import React,{useMemo,useState} from 'react';
import {ArrowUpRight,ChartNoAxesCombined,Cloud,Info,Shield,Target} from 'lucide-react';
import {projection} from '../lib/projection.js';
import {METRICS,getPlayerGames} from '../lib/stats.js';
import {priceText} from '../lib/bookLine.js';
import {estimateOpportunityProjection,getUsageMetric} from '../lib/playerProjection.js';
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
const usageLabels={attempts:'PASS ATT',carries:'CARRIES',targets:'TARGETS'};
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
    const teamGames={},leagueUsage={};
    const isPregame=game=>Number(game.season)<Number(selected.season)||
      (Number(game.season)===Number(selected.season)&&Number(game.week)<cutoffWeek);
    for(const p of players||[]){
      for(const game of p.games||[]){
        if(!isPregame(game))continue;
        for(const [metric] of marketsFor[p.position]||[]){
          const usageKey=getUsageMetric(p.position,metric),opportunities=Number(game.usage?.[usageKey]);
          const value=Number(game.stats?.[metric]);
          if(!usageKey||!Number.isFinite(opportunities)||opportunities<0||!Number.isFinite(value))continue;
          const aggregate=leagueUsage[p.position+':'+metric]??={stats:0,opportunities:0};
          aggregate.stats+=value;
          aggregate.opportunities+=opportunities;
        }
        if(![selected.home,selected.away].includes(game.team))continue;
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
      const team=[selected.home,selected.away].includes(p.team)?p.team:null;
      if(!team)continue;
      const history=getPlayerGames(p,'ALL').filter(isPregame);
      const teamHistory=history.filter(g=>g.team===team);
      const currentTeamHistory=teamHistory.filter(g=>Number(g.season)===Number(selected.season));
      if(!currentTeamHistory.length)continue;
      const currentSeason=history.filter(g=>Number(g.season)===Number(selected.season));
      const observed=currentSeason.length?currentSeason:history;
      const sampleLabel=currentSeason.length?`${selected.season} · ${currentSeason.length} G`:`CAREER · ${history.length} G`;
      for(const [metric,label] of marketsFor[p.position]||[]){
        if(market!=='ALL'&&market!==metric)continue;
        const usageKey=getUsageMetric(p.position,metric);
        const values=observed.map(g=>Number(g.stats?.[metric])).filter(Number.isFinite);
        if(!values.length)continue;
        const recent=history.slice(-5).map(g=>Number(g.stats?.[metric])).filter(Number.isFinite);
        const shareValues=teamHistory.map(g=>{
          const total=teamGames[g.team]?.[g.gameId||g.id]?.[usageKey]||0;
          const own=Number(g.usage?.[usageKey]||0);
          return total>0?own/total:null;
        }).filter(Number.isFinite);
        const league=leagueUsage[p.position+':'+metric];
        const estimated=estimateOpportunityProjection({history,position:p.position,market:metric,season:selected.season,
          priorEfficiency:league?.opportunities?league.stats/league.opportunities:null});
        const line=bookGame?.lines?.find(l=>l.metric===metric&&l.player?.toLowerCase().replace(/[^a-z]/g,'')===p.name?.toLowerCase().replace(/[^a-z]/g,''));
        output.push({p,team,metric,label,sampleLabel,seasonAvg:values.reduce((a,b)=>a+b,0)/values.length,
          recentAvg:recent.reduce((a,b)=>a+b,0)/recent.length,history:history.length,estimated:estimated?.projection??null,
          usageLabel:usageLabels[usageKey],usageAvg:observed.reduce((sum,g)=>sum+Number(g.usage?.[usageKey]||0),0)/observed.length,
          share:shareValues.length?shareValues.reduce((a,b)=>a+b,0)/shareValues.length:null,line,
          values:values.slice(-5)});
      }
    }
    return output.sort((a,b)=>a.team.localeCompare(b.team)||a.p.name.localeCompare(b.p.name)||a.label.localeCompare(b.label));
  },[players,selected,bookGame,market]);
  const breakdown=selected?projection(selected,selected.awayRating,selected.homeRating):null;

  return <section className="panel nfl-games"><header className="nfl-games-heading"><div><small>NFL · V2</small><h1>NFL Games</h1></div><span className="nfl-data-chip"><span/> SCHEDULE SNAPSHOT</span></header>
    {weeks.length>0&&<><div className="board-controls nfl-week-control"><label>Game Week<FilterMenu aria-label="Game Week" value={week} onChange={e=>{setWeek(e.target.value);setSelected('');}}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu></label><p>Schedule data refreshed {updated} · game price fields have no per-matchup timestamp in this feed.</p></div>
      <div className="nfl-games-list" aria-label="Upcoming NFL matchups">{games.map(g=>{
        const id=g.id||g.kickoff+g.home,active=(selected?.id||selected?.kickoff+selected?.home)===id;
        return <button type="button" className="nfl-game nfl-match-button" key={id} aria-pressed={active} onClick={()=>setSelected(id)}>
          <span className="nfl-game-date">{g.timeKnown===false?g.date+' · TIME TBD':kickoff.format(new Date(g.kickoff))}</span>
          <span className="nfl-game-pair"><Team code={g.away} price={g.awayPrice}/><small>AT</small><Team code={g.home} price={g.homePrice}/></span>
          <span className="nfl-game-market">{Number.isFinite(g.totalLine)?'TOTAL '+g.totalLine+' · O '+priceText(g.overPrice)+' / U '+priceText(g.underPrice):'GAME TOTAL NOT AVAILABLE'}</span>
          <span className="nfl-game-action">{active?'SELECTED MATCHUP':'ANALYZE MATCHUP'} ↓</span>
        </button>;
      })}</div>
    </>}
    {!upcoming.length&&<p>{loading?'Loading the NFL schedule…':error||'No upcoming games in the current schedule.'}</p>}
    {selected&&<section className="nfl-analysis" aria-labelledby="nfl-analysis-title">
      <header className="nfl-analysis-head"><div><small>SELECTED MATCHUP · {week}</small><h2 id="nfl-analysis-title">{teamLabel(selected.away)} <i>@</i> {teamLabel(selected.home)}</h2><p>{kickoff.format(new Date(selected.kickoff))}</p></div>
        <div className="nfl-analysis-badges"><span style={{'--club':teamColor(selected.away)}}>{selected.away}</span><b>VS</b><span style={{'--club':teamColor(selected.home)}}>{selected.home}</span></div></header>
      <nav className="nfl-analysis-tabs" role="tablist" aria-label="Game Analysis">
        {[['game','GAME PREDICTIONS',Target],['players','PLAYER PROJECTIONS',ChartNoAxesCombined],['breakdown','MODEL BREAKDOWN',Shield]].map(([key,label,Icon])=><button key={key} id={'nfl-tab-'+key} type="button" role="tab" aria-controls={'nfl-view-'+key} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>{setTab(key);try{sessionStorage.setItem('nfl-games-analysis',JSON.stringify({week,selected:selected?.id||(selected?.kickoff+selected?.home),tab:key,position,market}))}catch{}}}><Icon size={17}/>{label}</button>)}
      </nav>
      <div id={'nfl-view-'+tab} role="tabpanel" aria-labelledby={'nfl-tab-'+tab} tabIndex={0} className="nfl-tab-panel">
        {tab==='game'&&<GamePredictions game={selected} model={breakdown}/>}
        {tab==='players'&&<PlayerResearch game={selected} rows={rows} position={position} setPosition={setPosition} market={market} setMarket={setMarket} onOpen={onOpen} books={books} players={players} season={season} now={now}/>}
        {tab==='breakdown'&&<ModelBreakdown game={selected} model={breakdown} bookGame={bookGame} players={players}/>}
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
    <div className="nfl-probability-honesty"><Info size={17}/><span>Win, cover, Over/Under, fair odds, expected value, and confidence intervals are withheld until the underlying probabilities pass out-of-sample calibration. Any game prices shown come from the schedule data and are not verified live odds because this feed does not attach per-matchup timestamps.</span></div>
    <p className="nfl-market-footnote">A predicted score difference is not itself a win or bet probability. The schedule snapshot and independent team-data estimate are shown separately.</p>
  </div>;
}

function MarketTile({label,value}){return <article className="nfl-market-tile"><small>{label}</small><b>{value}</b></article>}

function PlayerResearch({game,rows,position,setPosition,market,setMarket,onOpen,books,players,season,now}){
  const propMarkets=Object.entries(METRICS).filter(([k])=>['passingYards','passingTDs','rushingAttempts','rushingYards','receivingYards','receptions'].includes(k)).sort((a,b)=>a[1].label.localeCompare(b[1].label));
  return <div className="nfl-view-panel"><div className="nfl-player-toolbar"><div><h3>Player Prop Research</h3><p>Pregame player history, an opportunity-based research baseline, and available timestamped sportsbook props.</p></div><div className="board-controls"><label>Position<FilterMenu value={position} onChange={e=>setPosition(e.target.value)}><option value="ALL">All Positions</option>{['QB','RB','TE','WR'].map(p=><option key={p}>{p}</option>)}</FilterMenu></label><label>Market<FilterMenu value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">All Markets</option>{propMarkets.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</FilterMenu></label></div></div>
    <div className="nfl-table-wrap"><table className="nfl-projection-table"><thead><tr><th>PLAYER</th><th>MARKET</th><th>LAST 5 AVG</th><th>SEASON / CAREER AVG</th><th>OPPORTUNITY EST.†</th><th>ROLE / SHARE</th><th>BOOK LINE</th><th>CHART</th></tr></thead><tbody>{rows.filter(r=>position==='ALL'||r.p.position===position).map((r,i)=><tr key={r.p.id+':'+r.metric}>
      <td><span className="nfl-player-cell" style={{'--club':teamColor(r.team)}}><PlayerPhoto id={r.p.id} name={r.p.name} url={r.p.photo}/><span><b>{r.p.name}</b><small>{r.team} · {r.p.position}</small></span></span></td><td>{r.label}</td><td>{format(r.recentAvg)}</td><td><b>{format(r.seasonAvg)}</b><small>{r.sampleLabel}</small></td><td><b>{format(r.estimated)}</b><small>RESEARCH BASELINE</small></td><td><b>{format(r.usageAvg)} {r.usageLabel}</b><small>{r.share==null?'SHARE N/A':`${(r.share*100).toFixed(1)}% AVG SHARE`}</small></td><td>{r.line?<><b>{format(r.line.point)}</b><small>O {priceText(r.line.over)} · U {priceText(r.line.under)}</small><small>Updated {new Date(r.line.updated).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></>:'—'}</td><td><button className="nfl-chart-link" type="button" onClick={()=>onOpen?.(r.p,{metric:r.metric,point:r.line?.point},'over',game)} aria-label={'Open charts for '+r.p.name}><ArrowUpRight size={16}/><span>CHARTS</span></button></td>
    </tr>)}</tbody></table></div>
    {!rows.length&&<p className="nfl-empty-state">No player history or sportsbook props are available for this matchup yet.</p>}
    <div className="nfl-probability-honesty"><Info size={17}/><span>† This experimental point baseline blends recent and season workload, then applies a shrinkage-adjusted efficiency from the same position and market. Walk-forward tests improved point error in most eligible seasons for standard volume and yardage markets; touchdown results were inconsistent. It has no matchup adjustment and does not produce hit probabilities. Missing sportsbook lines remain blank.</span></div>
    <details className="nfl-full-props"><summary>OPEN FULL MATCHUP PROP BOARD <ArrowUpRight size={15}/></summary><PropsBoard fixedGame={game} title="Matchup Player Prop Board" games={(books||[]).filter(g=>sameGame(g,game))} schedule={[game]} players={players} season={season} now={now} onOpen={onOpen}/></details>
  </div>;
}

function teamWorkload(players,team,game){
  const byGame=new Map();
  const pregame=row=>Number(row.season)<Number(game.season)||(Number(row.season)===Number(game.season)&&Number(row.week)<Number(game.week));
  for(const player of players||[])for(const row of player.games||[]){
    if(row.team!==team||!pregame(row)||!['QB','RB','FB','WR','TE'].includes(player.position))continue;
    const key=row.gameId||`${row.season}:${row.week}`;
    if(!key)continue;
    let bucket=byGame.get(key);
    if(!bucket)byGame.set(key,bucket={season:Number(row.season),week:Number(row.week),passAttempts:0,passYards:0,carries:0,targets:0,qbRows:[],rushLeaders:new Map(),targetLeaders:new Map()});
    if(player.position==='QB'){
      const attempts=Number(row.usage?.attempts)||0;
      bucket.passAttempts+=attempts;
      bucket.passYards+=Number(row.stats?.passingYards)||0;
      if(attempts>0)bucket.qbRows.push({name:player.name,attempts,yards:Number(row.stats?.passingYards)||0});
    }
    const carries=Number(row.usage?.carries)||0,targets=Number(row.usage?.targets)||0;
    bucket.carries+=carries;bucket.targets+=targets;
    if(carries)bucket.rushLeaders.set(player.name,(bucket.rushLeaders.get(player.name)||0)+carries);
    if(targets)bucket.targetLeaders.set(player.name,(bucket.targetLeaders.get(player.name)||0)+targets);
  }
  let games=[...byGame.values()].sort((a,b)=>a.season-b.season||a.week-b.week);
  const thisSeason=games.filter(row=>row.season===Number(game.season));
  if(thisSeason.length)games=thisSeason;
  const recent=games.slice(-5);
  if(!recent.length)return null;
  const avg=key=>recent.reduce((sum,row)=>sum+row[key],0)/recent.length;
  const passingAttempts=recent.reduce((sum,row)=>sum+row.passAttempts,0),passingYards=recent.reduce((sum,row)=>sum+row.passYards,0);
  const rushTotals=new Map(),targetTotals=new Map();
  for(const row of recent){for(const [name,count] of row.rushLeaders)rushTotals.set(name,(rushTotals.get(name)||0)+count);for(const [name,count] of row.targetLeaders)targetTotals.set(name,(targetTotals.get(name)||0)+count)}
  const leader=map=>[...map].sort((a,b)=>b[1]-a[1])[0];
  return {games:recent.length,source:thisSeason.length?'SELECTED SEASON':'CAREER FALLBACK',passAttempts:avg('passAttempts'),carries:avg('carries'),targets:avg('targets'),yardsPerAttempt:passingAttempts?passingYards/passingAttempts:null,rushLeader:leader(rushTotals),targetLeader:leader(targetTotals)};
}

function ModelBreakdown({game,model,bookGame,players}){
  const weather=game.context?.weather;
  const workload=useMemo(()=>({away:teamWorkload(players,game.away,game),home:teamWorkload(players,game.home,game)}),[players,game]);
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
    <section className="nfl-workload-panel"><header><div><h4>TEAM WORKLOAD &amp; QB SNAPSHOT</h4><p>Recent completed games before this matchup · selected-season sample when available</p></div><span>HISTORICAL CONTEXT</span></header><div className="nfl-workload-grid">{[[game.away,workload.away],[game.home,workload.home]].map(([team,profile])=><article key={team} style={{'--club':teamColor(team)}}><h5><i/>{team}</h5>{profile?<><small>{profile.source} · {profile.games} G</small><dl><div><dt>QB PASS ATT / G</dt><dd>{format(profile.passAttempts)}</dd></div><div><dt>TEAM CARRIES / G</dt><dd>{format(profile.carries)}</dd></div><div><dt>TEAM TARGETS / G</dt><dd>{format(profile.targets)}</dd></div><div><dt>QB PASS YDS / ATT</dt><dd>{profile.yardsPerAttempt==null?'—':profile.yardsPerAttempt.toFixed(2)}</dd></div></dl><p>{profile.rushLeader?`CARRY LEADER · ${profile.rushLeader[0]} (${format(profile.rushLeader[1]/profile.games)} / G)`:''}{profile.targetLeader?`${profile.rushLeader?' · ':''}TARGET LEADER · ${profile.targetLeader[0]} (${format(profile.targetLeader[1]/profile.games)} / G)`:''}</p></>:<p className="nfl-workload-empty">No completed player usage rows are available before this matchup.</p>}</article>)}</div><p className="nfl-workload-note">These are descriptive team/player history summaries, not opponent-adjusted inputs to the independent score estimate. Targets can differ slightly from pass attempts because sacks, scrambles, and data coverage affect the totals.</p></section>
    <section className="nfl-injury-panel"><h4><Shield size={16}/> HIGH-IMPACT INJURY FLAGS</h4>{significant.length?significant.map((p,i)=><p key={p.id||p.name+i}><b>{p.team} · {p.position}</b> {p.name} · {p.gameStatus||p.status}{p.injury?' · '+p.injury:''}</p>):<p>No QB1 or major skill-position injury is currently marked out or doubtful in the available report.</p>}</section>
    {model&&<p className="nfl-model-disclosure">Current independent score estimate: {game.away} {model.a.score.toFixed(1)} – {model.h.score.toFixed(1)} {game.home}. Existing data ratings are a baseline, not a validated probability model. Candidate tests have not shown a consistent improvement over the closing market; those candidate weights remain separate from production.</p>}
    <details className="nfl-methodology"><summary>Model Methodology &amp; Limits</summary><p>Team scores use opponent-adjusted points scored and allowed, a four-game league-average shrinkage, a fixed home edge, and the currently available contextual adjustments. Historical results include single-season and rolling walk-forward comparisons against base ratings and closing market benchmarks. Historical weather observations and retrospective quarterback labels are excluded where they would introduce leakage. Advanced play-level or player-level projections, calibrated probability distributions, live team odds, and quantified uncertainty are not yet validated in production.</p></details>
    <details className="nfl-methodology"><summary>Existing Market-Informed Matchup Breakdown</summary><p>This is the site's current explanation panel, retained for its detailed rating, quarterback, weather and injury context. Its overall score incorporates the historically fitted sportsbook blend; use the independent team-data estimate above as a separate reference.</p><MatchReport game={game} away={game.awayRating} home={game.homeRating}/></details>
  </div>;
}
