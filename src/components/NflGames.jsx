import React,{useMemo,useState} from 'react';
import {ArrowUpRight,ChartNoAxesCombined,Cloud,Info,Shield,Target} from 'lucide-react';
import {projection} from '../lib/projection.js';
import {METRICS,getPlayerGames} from '../lib/stats.js';
import {priceText} from '../lib/bookLine.js';
import {teamColor} from '../lib/teamColors.js';
import PlayerPhoto from './PlayerPhoto.jsx';
import FilterMenu from './FilterMenu.jsx';
import PropsBoard from './PropsBoard.jsx';
import {MatchReport} from './MatchReport.jsx';
import './NflGames.css';

const kickoff=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});
const weekOf=game=>game.season+' · Week '+game.week;
const teamCode=t=>({WAS:'WSH',LAR:'LA'}[t]||t);
const teamLabel=t=>({WAS:'Washington Commanders',WSH:'Washington Commanders',LAR:'Los Angeles Rams',LA:'Los Angeles Rams'}[t]||t);
const marketsFor={
  QB:[['passingYards','Pass Yards'],['passingTDs','Pass TDs'],['rushingYards','Rush Yards']],
  RB:[['rushingAttempts','Carries'],['rushingYards','Rush Yards'],['receivingYards','Rec Yards']],
  WR:[['receptions','Receptions'],['receivingYards','Rec Yards']],
  TE:[['receptions','Receptions'],['receivingYards','Rec Yards']]
};
const usageMetric={QB:['attempts','PASS ATT'],RB:['carries','CARRIES'],WR:['targets','TARGETS'],TE:['targets','TARGETS']};
const format=n=>Number.isFinite(n)?(Number.isInteger(n)?String(n):n.toFixed(1)):'—';
const sameGame=(a,b)=>a&&b&&a.away===b.away&&a.home===b.home&&Math.abs(Date.parse(a.kickoff)-Date.parse(b.kickoff))<12*3600000;
function savedAnalysis(){try{return JSON.parse(sessionStorage.getItem('nfl-games-analysis')||'{}')}catch{return {}}}

function Team({code,price}){
  const logoCode=({WAS:'wsh',LAR:'lar'})[code]||code.toLowerCase();
  return <span className="nfl-game-team" style={{'--club':teamColor(code)}}>
    <img alt="" loading="lazy" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+logoCode+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>
    <b>{code}</b><span>ML {priceText(price)}</span>
  </span>;
}

export default function NflGames({schedule,books,players,season,now,onOpen,updated,loading,error}){
  const [requestedWeek,setWeek]=useState(()=>savedAnalysis().week||'');
  const [selectedId,setSelected]=useState(()=>savedAnalysis().selected||'');
  const [tab,setTab]=useState(()=>savedAnalysis().tab||'game');
  const [position,setPosition]=useState(()=>savedAnalysis().position||'ALL');
  const [market,setMarket]=useState(()=>savedAnalysis().market||'ALL');
  const upcoming=(schedule||[]).filter(g=>Date.parse(g.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  const weeks=[...new Set(upcoming.map(weekOf))];
  const week=weeks.includes(requestedWeek)?requestedWeek:weeks[0];
  const games=upcoming.filter(g=>weekOf(g)===week);
  const selected=games.find(g=>(g.id||g.kickoff+g.home)===selectedId)||games[0];
  const bookGame=(books||[]).find(g=>sameGame(g,selected));
  React.useEffect(()=>{try{sessionStorage.setItem('nfl-games-analysis',JSON.stringify({week,selected:selected?.id||(selected?.kickoff+selected?.home),tab,position,market}))}catch{}},[week,selected,tab,position,market]);
  const rows=useMemo(()=>{
    if(!selected)return [];
    const cutoffWeek=Number(selected.week);
    const teamGames={};
    for(const p of players||[]){
      for(const game of p.games||[]){
        if(Number(game.season)!==Number(selected.season)||Number(game.week)>=cutoffWeek||![selected.home,selected.away].includes(game.team))continue;
        const key=game.gameId||game.id;
        if(!key)continue;
        teamGames[game.team]??={};
        teamGames[game.team][key]??={attempts:0,carries:0,targets:0};
        for(const field of ['attempts','carries','targets'])teamGames[game.team][key][field]+=Number(game.usage?.[field]||0);
      }
    }
    const output=[];
    for(const p of players||[]){
      if(!['QB','RB','WR','TE'].includes(p.position))continue;
      const history=getPlayerGames(p,selected.season).filter(g=>Number(g.week)<cutoffWeek&&[selected.home,selected.away].includes(g.team));
      const team=history.at(-1)?.team||p.team;
      if(!history.length||![selected.home,selected.away].includes(team))continue;
      for(const [metric,label] of marketsFor[p.position]||[]){
        if(market!=='ALL'&&market!==metric)continue;
        const usage=usageMetric[p.position];
        const values=history.map(g=>Number(g.stats?.[metric])).filter(Number.isFinite);
        if(!values.length)continue;
        const recent=values.slice(-5),shareValues=history.map(g=>{
          const total=teamGames[g.team]?.[g.gameId||g.id]?.[usage[0]]||0;
          const own=Number(g.usage?.[usage[0]]||0);
          return total>0?own/total:null;
        }).filter(Number.isFinite);
        const line=bookGame?.lines?.find(l=>l.metric===metric&&l.player?.toLowerCase().replace(/[^a-z]/g,'')===p.name?.toLowerCase().replace(/[^a-z]/g,''));
        output.push({p,team,metric,label,seasonAvg:values.reduce((a,b)=>a+b,0)/values.length,
          recentAvg:recent.reduce((a,b)=>a+b,0)/recent.length,history:history.length,
          usageLabel:usage[1],usageAvg:history.reduce((sum,g)=>sum+Number(g.usage?.[usage[0]]||0),0)/history.length,
          share:shareValues.length?shareValues.reduce((a,b)=>a+b,0)/shareValues.length:null,line,
          values:values.slice(-5)});
      }
    }
    return output.sort((a,b)=>a.team.localeCompare(b.team)||a.p.name.localeCompare(b.p.name)||a.label.localeCompare(b.label));
  },[players,selected,bookGame,market]);
  const breakdown=selected?projection(selected,selected.awayRating,selected.homeRating):null;

  return <section className="panel nfl-games"><header className="nfl-games-heading"><div><small>NFL · V2</small><h1>NFL Games</h1></div><span className="nfl-data-chip"><span/> LIVE DATA VIEW</span></header>
    {weeks.length>0&&<><div className="board-controls nfl-week-control"><label>Game Week<FilterMenu aria-label="Game Week" value={week} onChange={e=>{setWeek(e.target.value);setSelected('');}}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu></label><p>Schedule snapshot updated {updated} · game-market figures are historical closing references unless a current timestamp is shown.</p></div>
      <div className="nfl-games-list" aria-label="Upcoming NFL matchups">{games.map(g=>{
        const id=g.id||g.kickoff+g.home,active=(selected?.id||selected?.kickoff+selected?.home)===id;
        return <button type="button" className="nfl-game nfl-match-button" key={id} aria-pressed={active} onClick={()=>setSelected(id)}>
          <span className="nfl-game-date">{g.timeKnown===false?g.date+' · TIME TBD':kickoff.format(new Date(g.kickoff))}</span>
          <span className="nfl-game-pair"><Team code={g.away} price={g.awayPrice}/><small>AT</small><Team code={g.home} price={g.homePrice}/></span>
          <span className="nfl-game-market">{Number.isFinite(g.totalLine)?'CLOSING TOTAL '+g.totalLine+' · O '+priceText(g.overPrice)+' / U '+priceText(g.underPrice):'GAME TOTAL NOT AVAILABLE'}</span>
          <span className="nfl-game-action">{active?'SELECTED MATCHUP':'ANALYZE MATCHUP'} ↓</span>
        </button>;
      })}</div>
    </>}
    {!upcoming.length&&<p>{loading?'Loading the NFL schedule…':error||'No upcoming games in the current schedule.'}</p>}
    {selected&&<section className="nfl-analysis" aria-labelledby="nfl-analysis-title">
      <header className="nfl-analysis-head"><div><small>SELECTED MATCHUP · {week}</small><h2 id="nfl-analysis-title">{teamLabel(selected.away)} <i>@</i> {teamLabel(selected.home)}</h2><p>{kickoff.format(new Date(selected.kickoff))}</p></div>
        <div className="nfl-analysis-badges"><span style={{'--club':teamColor(selected.away)}}>{selected.away}</span><b>VS</b><span style={{'--club':teamColor(selected.home)}}>{selected.home}</span></div></header>
      <nav className="nfl-analysis-tabs" role="tablist" aria-label="Game Analysis">
        {[['game','GAME PREDICTIONS',Target],['players','PLAYER PROJECTIONS',ChartNoAxesCombined],['breakdown','MODEL BREAKDOWN',Shield]].map(([key,label,Icon])=><button key={key} id={'nfl-tab-'+key} type="button" role="tab" aria-controls={'nfl-view-'+key} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}><Icon size={17}/>{label}</button>)}
      </nav>
      <div id={'nfl-view-'+tab} role="tabpanel" aria-labelledby={'nfl-tab-'+tab} tabIndex={0} className="nfl-tab-panel">
        {tab==='game'&&<GamePredictions game={selected} model={breakdown}/>}
        {tab==='players'&&<PlayerResearch game={selected} rows={rows} position={position} setPosition={setPosition} market={market} setMarket={setMarket} onOpen={onOpen} books={books} players={players} season={season} now={now}/>}
        {tab==='breakdown'&&<ModelBreakdown game={selected} model={breakdown} bookGame={bookGame}/>}
      </div>
    </section>}
  </section>;
}

function GamePredictions({game,model}){
  const away=model?.a,home=model?.h;
  const margin=away&&home?home.score-away.score:null;
  return <div className="nfl-view-panel">
    <div className="nfl-projection-banner"><div><small>INDEPENDENT TEAM DATA PROJECTION</small><strong>{margin==null?'Projection Pending':Math.abs(margin)<.05?'Near Pick’em':(margin>0?game.home:game.away)+' BY '+Math.abs(margin).toFixed(1)}</strong><p>Built from the current opponent-adjusted scoring ratings and available matchup context.</p></div><span className="nfl-confidence-state">PROBABILITIES IN VALIDATION</span></div>
    <div className="nfl-score-grid">{[away,home].filter(Boolean).map((side,i)=><article key={side.team} style={{'--club':teamColor(side.team)}}><small>{i===0?'AWAY':'HOME'} · {side.team}</small><b>{side.score.toFixed(1)}</b><span>Projected Points</span><i/></article>)}</div>
    <div className="nfl-market-grid"><MarketTile label="MONEYLINE" value={`${game.away} ${priceText(game.awayPrice)} · ${game.home} ${priceText(game.homePrice)}`}/><MarketTile label="SPREAD" value={Number.isFinite(game.homeSpread)?`${game.home} ${game.homeSpread>0?'+':''}${game.homeSpread}`:'Unavailable'}/><MarketTile label="TOTAL" value={Number.isFinite(game.totalLine)?`${game.totalLine} · O ${priceText(game.overPrice)} / U ${priceText(game.underPrice)}`:'Unavailable'} /></div>
    <div className="nfl-probability-honesty"><Info size={17}/><span>Win, cover, Over/Under, fair odds, expected value, and confidence intervals are withheld until the underlying probabilities pass out-of-sample calibration. Closing sportsbook figures above are reference benchmarks, not live prices or model inputs.</span></div>
    <p className="nfl-market-footnote">A predicted score difference is not itself a win or bet probability. The market snapshot and independent team-data estimate are shown separately.</p>
  </div>;
}

function MarketTile({label,value}){return <article className="nfl-market-tile"><small>{label}</small><b>{value}</b></article>}

function PlayerResearch({game,rows,position,setPosition,market,setMarket,onOpen,books,players,season,now}){
  return <div className="nfl-view-panel"><div className="nfl-player-toolbar"><div><h3>Player Prop Research</h3><p>Current player usage before this matchup, plus available timestamped sportsbook props.</p></div><div className="board-controls"><label>Position<FilterMenu value={position} onChange={e=>setPosition(e.target.value)}><option value="ALL">All Positions</option>{['QB','RB','TE','WR'].map(p=><option key={p}>{p}</option>)}</FilterMenu></label><label>Market<FilterMenu value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">All Markets</option>{Object.entries(METRICS).filter(([k])=>['passingYards','passingTDs','rushingAttempts','rushingYards','receivingYards','receptions'].includes(k)).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</FilterMenu></label></div></div>
    <div className="nfl-table-wrap"><table className="nfl-projection-table"><thead><tr><th>PLAYER</th><th>MARKET</th><th>LAST 5 AVG</th><th>SEASON AVG</th><th>ROLE / SHARE</th><th>BOOK LINE</th><th>CHART</th></tr></thead><tbody>{rows.filter(r=>position==='ALL'||r.p.position===position).map((r,i)=><tr key={r.p.id+':'+r.metric}>
      <td><span className="nfl-player-cell" style={{'--club':teamColor(r.team)}}><PlayerPhoto id={r.p.id} name={r.p.name} url={r.p.photo}/><span><b>{r.p.name}</b><small>{r.team} · {r.p.position}</small></span></span></td><td>{r.label}</td><td>{format(r.recentAvg)}</td><td>{format(r.seasonAvg)}</td><td><b>{format(r.usageAvg)} {r.usageLabel}</b><small>{r.share==null?'SHARE N/A':`${(r.share*100).toFixed(1)}% AVG SHARE`}</small></td><td>{r.line?<><b>{format(r.line.point)}</b><small>O {priceText(r.line.over)} · U {priceText(r.line.under)}</small><small>Updated {new Date(r.line.updated).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></>:'—'}</td><td><button className="nfl-chart-link" type="button" onClick={()=>onOpen?.(r.p,{metric:r.metric,point:r.line?.point},'over',game)} aria-label={'Open charts for '+r.p.name}><ArrowUpRight size={16}/><span>CHARTS</span></button></td>
    </tr>)}</tbody></table></div>
    {!rows.length&&<p className="nfl-empty-state">No player history or sportsbook props are available for this matchup yet.</p>}
    <div className="nfl-probability-honesty"><Info size={17}/><span>Season and last-five averages are historical context, not model projections. Player probability forecasts are not shown until opportunity-based projections are independently validated. Missing sportsbook lines remain blank.</span></div>
    <details className="nfl-full-props"><summary>OPEN FULL MATCHUP PROP BOARD <ArrowUpRight size={15}/></summary><PropsBoard fixedGame={game} title="Matchup Player Prop Board" games={(books||[]).filter(g=>sameGame(g,game))} schedule={[game]} players={players} season={season} now={now} onOpen={onOpen}/></details>
  </div>;
}

function ModelBreakdown({game,model,bookGame}){
  const weather=game.context?.weather;
  const lines=[['Opponent-adjusted scoring',`${game.away} ${game.awayRating?.offense?.toFixed(1)??'—'} PPG · ${game.home} ${game.homeRating?.offense?.toFixed(1)??'—'} PPG`],
    ['Opponent-adjusted points allowed',`${game.away} ${game.awayRating?.defense?.toFixed(1)??'—'} · ${game.home} ${game.homeRating?.defense?.toFixed(1)??'—'}`],
    ['Games in team-rating sample',`${game.away} ${game.awayRating?.games??'—'} · ${game.home} ${game.homeRating?.games??'—'}`],
    ['Schedule strength',`${game.away} ${game.awayRating?.scheduleStrength>0?'+':''}${game.awayRating?.scheduleStrength??'—'} · ${game.home} ${game.homeRating?.scheduleStrength>0?'+':''}${game.homeRating?.scheduleStrength??'—'}`],
    ['Quarterback / efficiency',game.context?`${game.context.away?.qb||'Unavailable'} · ${game.context.home?.qb||'Unavailable'}`:'Not available'],
    ['Weather',weather?`${weather.temp??'—'}°F · wind ${weather.wind??'—'} mph · rain ${weather.rain??'—'}%`:'No kickoff forecast available'],
    ['Sportsbook player props',bookGame?.lines?.length?`${bookGame.lines.length} markets with timestamped prices`:'No timestamped player props available']];
  const significant=[game.away,game.home].flatMap(team=>(game.injuries?.[team]||[]).filter(p=>['QB','RB','WR','TE','LT','RT','CB','EDGE','DE'].includes(p.position)&&['OUT','DOUBTFUL'].includes(String(p.gameStatus||p.status).toUpperCase())).map(p=>({...p,team})));
  return <div className="nfl-view-panel"><div className="nfl-breakdown-intro"><div><small>MODEL INPUT AUDIT</small><h3>What Is In This Matchup</h3></div><span>RAW INPUTS · NO HIDDEN FACTORS</span></div>
    <div className="nfl-breakdown-list">{lines.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <section className="nfl-injury-panel"><h4><Shield size={16}/> HIGH-IMPACT INJURY FLAGS</h4>{significant.length?significant.map((p,i)=><p key={p.id||p.name+i}><b>{p.team} · {p.position}</b> {p.name} · {p.gameStatus||p.status}{p.injury?' · '+p.injury:''}</p>):<p>No QB1 or major skill-position injury is currently marked out or doubtful in the available report.</p>}</section>
    {model&&<p className="nfl-model-disclosure">Current independent score estimate: {game.away} {model.a.score.toFixed(1)} – {model.h.score.toFixed(1)} {game.home}. Existing data ratings are a baseline, not a validated probability model. Candidate tests have not shown a consistent improvement over the closing market; those candidate weights remain separate from production.</p>}
    <details className="nfl-methodology"><summary>Model Methodology &amp; Limits</summary><p>Team scores use opponent-adjusted points scored and allowed, a four-game league-average shrinkage, a fixed home edge, and the currently available contextual adjustments. Historical results include single-season and rolling walk-forward comparisons against base ratings and closing market benchmarks. Historical weather observations and retrospective quarterback labels are excluded where they would introduce leakage. Advanced play-level or player-level projections, calibrated probability distributions, live team odds, and quantified uncertainty are not yet validated in production.</p></details>
    <details className="nfl-methodology"><summary>Existing Market-Informed Matchup Breakdown</summary><p>This is the site's current explanation panel, retained for its detailed rating, quarterback, weather and injury context. Its overall score incorporates the historically fitted sportsbook blend; use the independent team-data estimate above as a separate reference.</p><MatchReport game={game} away={game.awayRating} home={game.homeRating}/></details>
  </div>;
}
