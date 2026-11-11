import React,{useMemo,useRef,useState} from 'react';
import {ArrowUpRight,ChartNoAxesCombined,Cloud,Info,Shield,Target} from 'lucide-react';
import {projection} from '../lib/projection.js';
import {METRICS,getPlayerGames} from '../lib/stats.js';
import {priceText} from '../lib/bookLine.js';
import {buildOpportunityEfficiencyPriors,estimateOpportunityProjection,getUsageMetric,hasMeaningfulProjectionRole,PLAYER_PROJECTION_MARKETS} from '../lib/playerProjection.js';
import {teamWorkload} from '../lib/teamWorkload.js';
import {highImpactInjuries} from '../lib/gameInjuries.js';
import {defenseTable} from '../lib/matchup.js';
import {teamColor} from '../lib/teamColors.js';
import PlayerPhoto from './PlayerPhoto.jsx';
import FilterMenu from './FilterMenu.jsx';
import PropsBoard from './PropsBoard.jsx';
import {MatchReport} from './MatchReport.jsx';
import './NflGames.css';

const kickoff=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});
const weekOf=game=>game.season+' · Week '+game.week;
const teamCode=t=>({WAS:'WSH',LAR:'LA'}[t]||t);
const normalizeTeamCode=t=>({LA:'LAR',STL:'LAR',WSH:'WAS',JAC:'JAX',OAK:'LV',SD:'LAC'}[t]||t);
const teamLabel=t=>({WAS:'Washington Commanders',WSH:'Washington Commanders',LAR:'Los Angeles Rams',LA:'Los Angeles Rams'}[t]||t);
const marketsFor=PLAYER_PROJECTION_MARKETS;
const usageLabels={attempts:'PASS ATT',carries:'CARRIES',targets:'TARGETS'};
const format=n=>Number.isFinite(n)?(Number.isInteger(n)?String(n):n.toFixed(1)):'—';
const ordinal=n=>`${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')}`;
const sameGame=(a,b)=>a&&b&&normalizeTeamCode(a.away)===normalizeTeamCode(b.away)&&normalizeTeamCode(a.home)===normalizeTeamCode(b.home)&&Math.abs(Date.parse(a.kickoff)-Date.parse(b.kickoff))<12*3600000;
function savedAnalysis(){try{return JSON.parse(sessionStorage.getItem('nfl-games-analysis')||'{}')}catch{return {}}}

function Team({code,price}){
  const logoCode=({WAS:'wsh',LAR:'lar'})[code]||code.toLowerCase();
  return <span className="nfl-game-team" style={{'--club':teamColor(code)}}>
    <img alt="" loading="lazy" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+logoCode+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>
    <b>{code}</b><span>ML {priceText(price)}</span>
  </span>;
}

export default function NflGames({schedule,books,players,validation,season,now,onOpen,updated,loading,error}){
  const [requestedWeek,setWeek]=useState(()=>savedAnalysis().week||'');
  const [selectedId,setSelected]=useState(()=>savedAnalysis().selected||'');
  const [tab,setTab]=useState(()=>savedAnalysis().tab||'game');
  const [position,setPosition]=useState(()=>savedAnalysis().position||'ALL');
  const [market,setMarket]=useState(()=>savedAnalysis().market||'ALL');
  const analysisRef=useRef(null);
  const upcoming=(schedule||[]).filter(g=>Date.parse(g.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  const weeks=[...new Set(upcoming.map(weekOf))];
  const week=weeks.includes(requestedWeek)?requestedWeek:weeks[0];
  const games=upcoming.filter(g=>weekOf(g)===week);
  const matchupOptions=[...games].sort((a,b)=>(a.away+' @ '+a.home).localeCompare(b.away+' @ '+b.home));
  const selected=games.find(g=>(g.id||g.kickoff+g.home)===selectedId)||games[0];
  const selectedGameId=selected?.id||selected?.kickoff+selected?.home||'';
  const bookGame=(books||[]).find(g=>sameGame(g,selected));
  React.useEffect(()=>{try{sessionStorage.setItem('nfl-games-analysis',JSON.stringify({week,selected:selected?.id||(selected?.kickoff+selected?.home),tab,position,market}))}catch{}},[week,selected,tab,position,market]);
  const rows=useMemo(()=>{
    if(!selected)return [];
    const cutoffWeek=Number(selected.week);
    const teamGames={},efficiencyPriors=buildOpportunityEfficiencyPriors(players||[],selected);
    const isPregame=game=>Number(game.season)<Number(selected.season)||
      (Number(game.season)===Number(selected.season)&&Number(game.week)<cutoffWeek);
    const weeksByTeam=new Map([selected.away,selected.home].map(t=>[normalizeTeamCode(t),new Set()]));
    for(const p of players||[]){
      for(const game of p.games||[]){
        if(!isPregame(game))continue;
        const completedWeeks=weeksByTeam.get(normalizeTeamCode(game.team));
        if(!completedWeeks)continue;
        if(Number(game.season)===Number(selected.season))completedWeeks.add(Number(game.week));
        const key=game.gameId||game.id;
        if(!key)continue;
        const normalizedTeam=normalizeTeamCode(game.team);
        teamGames[normalizedTeam]??={};
        teamGames[normalizedTeam][key]??={attempts:0,carries:0,targets:0};
        for(const field of ['attempts','carries','targets'])teamGames[normalizedTeam][key][field]+=Number(game.usage?.[field]||0);
      }
    }
    const defenseByMarket={};
    for(const [position,markets] of Object.entries(marketsFor))for(const [metric] of markets){
      const key=position+':'+metric;
      if(!defenseByMarket[key])defenseByMarket[key]=defenseTable(players||[],Number(selected.season),position,metric,cutoffWeek);
    }
    const recentWeeks=new Map([...weeksByTeam].map(([team,weeks])=>[team,new Set([...weeks].sort((a,b)=>b-a).slice(0,2))]));
    const output=[];
    for(const p of players||[]){
      if(!['QB','RB','WR','TE'].includes(p.position))continue;
      const normalizedPlayerTeam=normalizeTeamCode(p.team);
      const team=[selected.home,selected.away].find(t=>normalizeTeamCode(t)===normalizedPlayerTeam);
      if(!team)continue;
      const history=getPlayerGames(p,'ALL').filter(isPregame);
      const teamHistory=history.filter(g=>normalizeTeamCode(g.team)===normalizedPlayerTeam);
      const currentSeason=history.filter(g=>Number(g.season)===Number(selected.season));
      const observed=currentSeason;
      if(!observed.length)continue;
      const report=(selected.injuries?.[team]||[]).find(r=>r.id?r.id===p.id:r.name?.toLowerCase()===p.name?.toLowerCase());
      if([report?.gameStatus,report?.status].some(s=>/^(out|doubtful|inactive|ir|injured reserve|suspended|pup)$/i.test(s?.trim())))continue;
      const qb=selected.context?.[team===selected.home?'home':'away'];
      if(p.position==='QB'&&qb?.listed&&qb.qbId&&qb.qbId!==p.id)continue;
      const recentTeamGames=observed.filter(g=>normalizeTeamCode(g.team)===normalizedPlayerTeam&&recentWeeks.get(normalizedPlayerTeam).has(Number(g.week)));
      const expectedQuarterback=p.position==='QB'&&qb?.listed&&qb.qbId===p.id;
      if(!expectedQuarterback&&!recentTeamGames.some(g=>['attempts','carries','targets','offenseSnapRate'].some(k=>Number(g.usage?.[k])>0)))continue;
      const sampleLabel=`${selected.season} · ${observed.length} G`;
      for(const [metric,label] of marketsFor[p.position]||[]){
        if(market!=='ALL'&&market!==metric)continue;
        const usageKey=getUsageMetric(p.position,metric);
        const values=observed.map(g=>Number(g.stats?.[metric])).filter(Number.isFinite);
        if(!values.length)continue;
        const recent=history.slice(-5).map(g=>Number(g.stats?.[metric])).filter(Number.isFinite);
        const shareValues=teamHistory.map(g=>{
          const total=teamGames[normalizeTeamCode(g.team)]?.[g.gameId||g.id]?.[usageKey]||0;
          const own=Number(g.usage?.[usageKey]||0);
          return total>0?own/total:null;
        }).filter(Number.isFinite);
        const estimated=estimateOpportunityProjection({history,position:p.position,market:metric,season:selected.season,
          priorEfficiency:efficiencyPriors[p.position+':'+metric]??null});
        if(!estimated||!hasMeaningfulProjectionRole({position:p.position,market:metric,
          projectedUsage:estimated.projectedUsage,historyGames:history.length,expectedStarter:expectedQuarterback}))continue;
        const opponent=team===selected.home?selected.away:selected.home;
        const defense=(defenseByMarket[p.position+':'+metric]||[]).find(row=>normalizeTeamCode(row.team)===normalizeTeamCode(opponent));
        const line=bookGame?.lines?.find(l=>l.metric===metric&&l.player?.toLowerCase().replace(/[^a-z]/g,'')===p.name?.toLowerCase().replace(/[^a-z]/g,''));
        output.push({p,team,metric,label,sampleLabel,seasonAvg:values.reduce((a,b)=>a+b,0)/values.length,
          recentAvg:recent.reduce((a,b)=>a+b,0)/recent.length,history:history.length,estimated:estimated?.projection??null,
          usageLabel:usageLabels[usageKey],usageAvg:observed.reduce((sum,g)=>sum+Number(g.usage?.[usageKey]||0),0)/observed.length,
          share:shareValues.length?shareValues.reduce((a,b)=>a+b,0)/shareValues.length:null,line,opponent,defense,
          values:values.slice(-5)});
      }
    }
    return output.sort((a,b)=>a.team.localeCompare(b.team)||a.p.name.localeCompare(b.p.name)||a.label.localeCompare(b.label));
  },[players,selected,bookGame,market]);
  const breakdown=selected?projection(selected,selected.awayRating,selected.homeRating):null;
  const selectedAnalysis=selected&&<section ref={analysisRef} className="nfl-analysis" aria-labelledby="nfl-analysis-title">
    <header className="nfl-analysis-head"><div><small>SELECTED MATCHUP · {week}</small><h2 id="nfl-analysis-title">{teamLabel(selected.away)} <i>@</i> {teamLabel(selected.home)}</h2><p>{kickoff.format(new Date(selected.kickoff))}</p></div>
      <div className="nfl-analysis-badges"><span style={{'--club':teamColor(selected.away)}}>{selected.away}</span><b>VS</b><span style={{'--club':teamColor(selected.home)}}>{selected.home}</span></div></header>
    <nav className="nfl-analysis-tabs" role="tablist" aria-label="Game Analysis">
      {[['game','GAME PREDICTIONS',Target],['players','PLAYER PROJECTIONS',ChartNoAxesCombined],['breakdown','MODEL BREAKDOWN',Shield]].map(([key,label,Icon])=><button key={key} id={'nfl-tab-'+key} type="button" role="tab" aria-controls={'nfl-view-'+key} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>{setTab(key);try{sessionStorage.setItem('nfl-games-analysis',JSON.stringify({week,selected:selected?.id||(selected?.kickoff+selected?.home),tab:key,position,market}))}catch{}}}><Icon size={17}/>{label}</button>)}
    </nav>
    <div id={'nfl-view-'+tab} role="tabpanel" aria-labelledby={'nfl-tab-'+tab} tabIndex={0} className="nfl-tab-panel">
      {tab==='game'&&<GamePredictions game={selected} model={breakdown} validation={validation}/>}
      {tab==='players'&&<PlayerResearch game={selected} rows={rows} position={position} setPosition={setPosition} market={market} setMarket={setMarket} onOpen={onOpen} books={books} players={players} season={season} now={now}/>}
      {tab==='breakdown'&&<ModelBreakdown game={selected} model={breakdown} bookGame={bookGame} players={players}/>}
    </div>
  </section>;

  return <section className="panel nfl-games"><header className="nfl-games-heading"><div><small>NFL · V2</small><h1>NFL Games</h1></div><span className="nfl-data-chip"><span/> SCHEDULE SNAPSHOT</span></header>
    {weeks.length>0&&<><div className="board-controls nfl-week-control"><label>Game Week<FilterMenu aria-label="Game Week" value={week} onChange={e=>{setWeek(e.target.value);setSelected('');}}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu></label><label>Matchup<FilterMenu aria-label="Matchup" value={selectedGameId} onChange={e=>{setSelected(e.target.value);requestAnimationFrame(()=>analysisRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}>{matchupOptions.map(g=>{const id=g.id||g.kickoff+g.home;return <option key={id} value={id}>{g.away} @ {g.home}</option>})}</FilterMenu></label><p>Schedule data refreshed {updated} · game price fields have no per-matchup timestamp in this feed.</p></div>
      {selectedAnalysis}
      <div className="nfl-games-list" aria-label="Upcoming NFL matchups">{games.map(g=>{
        const id=g.id||g.kickoff+g.home,active=(selected?.id||selected?.kickoff+selected?.home)===id;
        return <button type="button" className="nfl-game nfl-match-button" key={id} aria-pressed={active} onClick={()=>{setSelected(id);requestAnimationFrame(()=>analysisRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}>
          <span className="nfl-game-date">{g.timeKnown===false?g.date+' · TIME TBD':kickoff.format(new Date(g.kickoff))}</span>
          <span className="nfl-game-pair"><Team code={g.away} price={g.awayPrice}/><small>AT</small><Team code={g.home} price={g.homePrice}/></span>
          <span className="nfl-game-market">{Number.isFinite(g.totalLine)?'TOTAL '+g.totalLine+' · O '+priceText(g.overPrice)+' / U '+priceText(g.underPrice):'GAME TOTAL NOT AVAILABLE'}</span>
          <span className="nfl-game-action">{active?'SELECTED MATCHUP':'ANALYZE MATCHUP'} ↓</span>
        </button>;
      })}</div>
    </>}
    {!upcoming.length&&<p>{loading?'Loading the NFL schedule…':error||'No upcoming games in the current schedule.'}</p>}
  </section>;
}

function GamePredictions({game,model,validation}){
  const away=model?.a,home=model?.h;
  const margin=away&&home?home.score-away.score:null;
  const elo=game.context?.elo;
  const projectedTotal=away&&home?away.score+home.score:null;
  const homeProbability=Number(elo?.homeProbability),awayProbability=Number(elo?.awayProbability);
  const hasWinnerForecast=Number.isFinite(homeProbability)&&Number.isFinite(awayProbability);
  const winner=hasWinnerForecast&&Math.abs(homeProbability-awayProbability)>.0001
    ?(homeProbability>awayProbability?{team:game.home,probability:homeProbability}:{team:game.away,probability:awayProbability})
    :null;
  const spreadEdge=Number.isFinite(margin)&&Number.isFinite(game.homeSpread)?margin+game.homeSpread:null;
  const spreadTeam=spreadEdge==null||Math.abs(spreadEdge)<.05?null:spreadEdge>0?game.home:game.away;
  const spreadLine=spreadTeam===game.home?game.homeSpread:-game.homeSpread;
  const totalSide=Number.isFinite(projectedTotal)&&Number.isFinite(game.totalLine)
    ?projectedTotal-game.totalLine>.05?'OVER':game.totalLine-projectedTotal>.05?'UNDER':'NO CLEAR SIDE'
    :null;
  return <div className="nfl-view-panel">
    <div className="nfl-predictions-heading"><div><small>GAME MODEL</small><h3>MODEL PICKS &amp; SCORE PROJECTION</h3></div><span>RESEARCH OUTPUT · NOT A BETTING EDGE</span></div>
    <div className="nfl-pick-grid">
      <PickTile label="WINNER PROJECTION" team={winner?.team} value={winner?.team||(hasWinnerForecast?'NO CLEAR WINNER':'Forecast unavailable')} detail={winner?`${(winner.probability*100).toFixed(1)}% model win probability · calibrated Elo`:hasWinnerForecast?'Elo probabilities are effectively even.':'No calibrated Elo forecast for this game.'}/>
      <PickTile label="SPREAD PICK" team={spreadTeam} value={spreadTeam&&Number.isFinite(spreadLine)?`${spreadTeam} ${spreadLine>0?'+':''}${spreadLine}`:spreadEdge==null?'Spread line unavailable':'No clear side'} detail={Number.isFinite(margin)?`Model margin: ${margin>0?'+':''}${margin.toFixed(1)} points for ${game.home}.`:'Team score projection unavailable.'}/>
      <PickTile label="OVER / UNDER PICK" value={totalSide&&Number.isFinite(game.totalLine)?`${totalSide} ${game.totalLine}`:totalSide||'Total line unavailable'} detail={Number.isFinite(projectedTotal)?`Projected total ${projectedTotal.toFixed(1)} points${Number.isFinite(game.totalLine)?` vs. ${game.totalLine} schedule line`:''}.`:'Team score projection unavailable.'}/>
      <PickTile label="TEAM POINT PROJECTION" value={away&&home?`${game.away} ${away.score.toFixed(1)} · ${game.home} ${home.score.toFixed(1)}`:'Projection unavailable'} detail="Independent projected final score. These points drive the spread and total comparisons."/>
    </div>
    <div className="nfl-market-grid"><MarketTile label="MONEYLINE PRICE" value={`${game.away} ${priceText(game.awayPrice)} · ${game.home} ${priceText(game.homePrice)}`}/><MarketTile label="SPREAD LINE" value={Number.isFinite(game.homeSpread)?`${game.home} ${game.homeSpread>0?'+':''}${game.homeSpread}`:'Unavailable'}/><MarketTile label="TOTAL LINE" value={Number.isFinite(game.totalLine)?`${game.totalLine} · O ${priceText(game.overPrice)} / U ${priceText(game.underPrice)}`:'Unavailable'} /></div>
    <div className="nfl-probability-honesty"><Info size={17}/><span>The winner percentage comes from Elo, calibrated on {elo?.calibrationSeason||'the prior season'} and updated through Week {elo?.asOfWeek??'—'}. The spread and total are directional picks from the score projection. Walk-forward tests show the closing market was more accurate than this research model; treat the picks as model comparisons, not betting edges. Schedule prices have no per-matchup timestamp.</span></div>
    <details className="nfl-validation-details"><summary>MODEL VALIDATION &amp; DATA LIMITS <span>View the holdout record and comparisons</span></summary><ModelEvidence validation={validation}/></details>
  </div>;
}

function MarketTile({label,value}){return <article className="nfl-market-tile"><small>{label}</small><b>{value}</b></article>}

function PickTile({label,value,detail,team}){
  return <article className="nfl-pick-tile" style={team?{'--club':teamColor(team)}:undefined}><small>{label}</small><b>{value}</b><span>{detail}</span></article>;
}

function ModelEvidence({validation}){
  const results=validation?.results;
  if(!results&&!validation?.elo?.latest)return null;
  const entries=[['BASELINE','Base'],['PLAY-BY-PLAY CANDIDATE','Stats'],['CLOSING-MARKET BENCHMARK','Market'],['MARKET BLEND','Blend']].filter(([,key])=>(results||{})[key]);
  const value=(key,metric)=>Number.isFinite(results[key]?.[metric])?results[key][metric].toFixed(2):'—';
  const elo=validation?.elo?.latest;
  return <section className="nfl-model-evidence"><header><div><small>HISTORICAL MODEL CHECK</small><h3>WALK-FORWARD SCORE ERROR</h3></div><span>{validation.games||0} GAMES</span></header>{entries.length>0&&<><div className="nfl-evidence-table-wrap"><table><thead><tr><th>FORECAST</th><th>SCORE MAE</th><th>MARGIN MAE</th></tr></thead><tbody>{entries.map(([label,key])=><tr key={key}><th>{label}</th><td>{value(key,'scoreMAE')}</td><td>{value(key,'marginMAE')}</td></tr>)}</tbody></table></div><p>Lower error is better. The market benchmark uses historical closing prices; it is a reference, not a timestamped price guaranteed to have been available when a pick was made. MAE measures point accuracy, not probability calibration or betting returns.</p></>}{elo&&<div className="nfl-elo-evidence"><h4>ELO WIN PROBABILITY · {elo.holdoutSeason} HOLDOUT</h4><div><span>{elo.elo?.games??0} GAMES</span><span>BRIER <b>{elo.elo?.brier?.toFixed(3)??'—'}</b></span><span>LOG LOSS <b>{elo.elo?.logLoss?.toFixed(3)??'—'}</b></span><span>ACCURACY <b>{Number.isFinite(elo.elo?.winnerAccuracy)?`${(elo.elo.winnerAccuracy*100).toFixed(1)}%`:'—'}</b></span></div><p>Closing market reference: Brier {elo.closingMoneyline?.brier?.toFixed(3)??'—'} · log loss {elo.closingMoneyline?.logLoss?.toFixed(3)??'—'} ({elo.closingMoneyline?.games??0} games). Elo is shown as a probability forecast for transparency; the market comparison remains stronger.</p></div>}</section>;
}

function PlayerResearch({game,rows,position,setPosition,market,setMarket,onOpen,books,players,season,now}){
  const propMarkets=Object.entries(METRICS).filter(([k])=>['passingYards','passingTDs','rushingAttempts','rushingYards','receivingYards','receptions'].includes(k)).sort((a,b)=>a[1].label.localeCompare(b[1].label));
  return <div className="nfl-view-panel"><div className="nfl-player-toolbar"><div><h3>Player Prop Research</h3><p>Projections require current-season game history and recent offensive participation or a listed starting QB role. Players reported out or doubtful are excluded.</p></div><div className="board-controls"><label>Position<FilterMenu value={position} onChange={e=>setPosition(e.target.value)}><option value="ALL">All Positions</option>{['QB','RB','TE','WR'].map(p=><option key={p}>{p}</option>)}</FilterMenu></label><label>Market<FilterMenu value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">All Markets</option>{propMarkets.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</FilterMenu></label></div></div>
    {!(books||[]).some(b=>sameGame(b,game)&&b.lines?.length>0)&&<p className="nfl-empty-state">No DraftKings props in this matchup’s snapshot yet. The full slate is checked Wednesday and upcoming games are refreshed Sunday morning.</p>}
    <div className="nfl-defense-legend"><span className="favorable">GREEN · ALLOWS MORE</span><span className="tough">RED · ALLOWS FEWER</span><span>RANKS USE PRIOR GAMES ONLY</span></div>
    <div className="nfl-table-wrap"><table className="nfl-projection-table"><thead><tr><th>PLAYER</th><th>MARKET</th><th>LAST 5 AVG</th><th>SEASON AVG</th><th>MODEL PROJECTION†</th><th>ROLE / SHARE</th><th>DEFENSE MATCHUP</th><th>BOOK LINE</th><th>CHART</th></tr></thead><tbody>{rows.filter(r=>position==='ALL'||r.p.position===position).map((r,i)=>{
      const rank=r.defense?.rank;
      const defenseTone=rank==null?'':rank<=10?'favorable':rank>=23?'tough':'average';
      const defensePhrase=rank==null?'DEFENSE SAMPLE N/A':`ALLOWS ${ordinal(rank<=16?rank:33-rank).toUpperCase()}-${rank<=16?'MOST':'FEWEST'} ${r.label.toUpperCase()} TO ${({QB:'QBS',RB:'RBS',WR:'WRS',TE:'TES'}[r.p.position])}`;
      return <tr key={r.p.id+':'+r.metric}>
      <td><span className="nfl-player-cell" style={{'--club':teamColor(r.team)}}><PlayerPhoto id={r.p.id} name={r.p.name} url={r.p.photo}/><span><b>{r.p.name}</b><small>{r.team} · {r.p.position}</small></span></span></td><td>{r.label}</td><td>{format(r.recentAvg)}</td><td><b>{format(r.seasonAvg)}</b><small>{r.sampleLabel}</small></td><td><b>{format(r.estimated)}</b><small>RESEARCH BASELINE</small></td><td><b>{format(r.usageAvg)} {r.usageLabel}</b><small>{r.share==null?'SHARE N/A':`${(r.share*100).toFixed(1)}% AVG SHARE`}</small></td><td><span className={'nfl-defense-cell '+defenseTone} style={{'--club':teamColor(r.opponent)}}><b>{r.opponent} · {defensePhrase}</b><small>{r.defense?`${format(r.defense.average)} ALLOWED / GAME · ${r.defense.games} G`:'NO PRIOR GAME SAMPLE'}</small></span></td><td>{r.line?<><b>{format(r.line.point)}</b><small>O {priceText(r.line.over)} · U {priceText(r.line.under)}</small><small>Updated {new Date(r.line.updated).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></>:'—'}</td><td><button className="nfl-chart-link" type="button" onClick={()=>onOpen?.(r.p,{metric:r.metric,point:r.line?.point},'over',game)} aria-label={'Open charts for '+r.p.name}><ArrowUpRight size={16}/><span>CHARTS</span></button></td>
    </tr>})}</tbody></table></div>
    {!rows.length&&<p className="nfl-empty-state">No players currently qualify for projections in this matchup and market.</p>}
    <div className="nfl-probability-honesty"><Info size={17}/><span>† This is the same opportunity × efficiency point projection used in Top Looks. Both views use the selected season’s player history, a shared pregame league efficiency prior, and recent workload; Top Looks adds separate line hit-rate and matchup-ranking signals. Missing sportsbook lines remain blank.</span></div>
    <details className="nfl-full-props"><summary>OPEN FULL MATCHUP PROP BOARD <ArrowUpRight size={15}/></summary><PropsBoard fixedGame={game} title="Matchup Player Prop Board" games={(books||[]).filter(g=>sameGame(g,game))} schedule={[game]} players={players} season={season} now={now} onOpen={onOpen}/></details>
  </div>;
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
  const significant=highImpactInjuries(game,workload);
  const injuryReportAvailable=[game.away,game.home].some(team=>Array.isArray(game.injuries?.[team]));
  return <div className="nfl-view-panel"><div className="nfl-breakdown-intro"><div><small>MODEL INPUT AUDIT</small><h3>What Is In This Matchup</h3></div><span>RAW INPUTS · NO HIDDEN FACTORS</span></div>
    <div className="nfl-breakdown-list">{lines.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <section className="nfl-workload-panel"><header><div><h4>TEAM WORKLOAD &amp; QB SNAPSHOT</h4><p>Recent completed games before this matchup · selected-season sample when available</p></div><span>HISTORICAL CONTEXT</span></header><div className="nfl-workload-grid">{[[game.away,workload.away],[game.home,workload.home]].map(([team,profile])=><article key={team} style={{'--club':teamColor(team)}}><h5><i/>{team}</h5>{profile?<><small>{profile.source} · {profile.games} G</small><dl><div><dt>QB PASS ATT / G</dt><dd>{format(profile.passAttempts)}</dd></div><div><dt>TEAM CARRIES / G</dt><dd>{format(profile.carries)}</dd></div><div><dt>TEAM TARGETS / G</dt><dd>{format(profile.targets)}</dd></div><div><dt>QB PASS YDS / ATT</dt><dd>{profile.yardsPerAttempt==null?'—':profile.yardsPerAttempt.toFixed(2)}</dd></div></dl><p>{profile.rushLeader?`CARRY LEADER · ${profile.rushLeader[0]} (${format(profile.rushLeader[1]/profile.games)} / G)`:''}{profile.targetLeader?`${profile.rushLeader?' · ':''}TARGET LEADER · ${profile.targetLeader[0]} (${format(profile.targetLeader[1]/profile.games)} / G)`:''}</p></>:<p className="nfl-workload-empty">No completed player usage rows are available before this matchup.</p>}</article>)}</div><p className="nfl-workload-note">These are descriptive team/player history summaries, not opponent-adjusted inputs to the independent score estimate. Targets can differ slightly from pass attempts because sacks, scrambles, and data coverage affect the totals.</p></section>
    <PlayByPlayMatchup game={game}/>
    <section className="nfl-injury-panel"><h4><Shield size={16}/> HIGH-IMPACT INJURY FLAGS</h4>{significant.length?significant.map((p,i)=><p key={p.id||p.name+i}><b>{p.team} · {p.position}</b> {p.name} · {p.gameStatus||p.status}{p.injury?' · '+p.injury:''}</p>):<p>{injuryReportAvailable?'No starting quarterback or leading carry/target player is listed out, doubtful, or questionable in the available report.':'Current injury report data is unavailable for this matchup.'}</p>}</section>
    {model&&<p className="nfl-model-disclosure">Current independent score estimate: {game.away} {model.a.score.toFixed(1)} – {model.h.score.toFixed(1)} {game.home}. Existing data ratings are a baseline, not a validated probability model. Candidate tests have not shown a consistent improvement over the closing market; those candidate weights remain separate from production.</p>}
    <details className="nfl-methodology"><summary>Model Methodology &amp; Limits</summary><p>Team scores use opponent-adjusted points scored and allowed, a four-game league-average shrinkage, a fixed home edge, and the currently available contextual adjustments. Historical results include single-season and rolling walk-forward comparisons against base ratings and closing market benchmarks. Historical weather observations and retrospective quarterback labels are excluded where they would introduce leakage. Advanced play-level or player-level projections, calibrated probability distributions, live team odds, and quantified uncertainty are not yet validated in production.</p></details>
    <details className="nfl-methodology"><summary>Existing Market-Informed Matchup Breakdown</summary><p>This is the site's current explanation panel, retained for its detailed rating, quarterback, weather and injury context. Its overall score incorporates the historically fitted sportsbook blend; use the independent team-data estimate above as a separate reference.</p><MatchReport game={game} away={game.awayRating} home={game.homeRating}/></details>
  </div>;
}

function PlayByPlayMatchup({game}){
  const profiles=[[game.away,game.context?.away],[game.home,game.context?.home]];
  const available=profiles.some(([,profile])=>profile?.inputs);
  const fmt=value=>Number.isFinite(Number(value))?`${Number(value)>0?'+':''}${Number(value).toFixed(3)}`:'—';
  const rates=[['PASS EPA / DROPBACK','Pass Offense','Pass Defense Faced'],['RUSH EPA / PLAY','Run Offense','Run Defense Faced']];
  const redZone=game.context?.redZoneDefense||{};
  const hasRedZone=[game.away,game.home].some(team=>Number(redZone[team]?.trips)>0);
  if(!available&&!hasRedZone)return null;
  return <section className="nfl-workload-panel nfl-advanced-matchup"><header><div><h4>ADVANCED PLAY-BY-PLAY MATCHUP</h4><p>Opponent-adjusted recent efficiency and scoring-area defense, using games completed before kickoff</p></div><span>DATA-DRIVEN CONTEXT</span></header>
    {available&&<><div className="nfl-workload-grid">{profiles.map(([team,profile],i)=>{const input=profile?.inputs;const opponent=i===0?game.home:game.away;return <article key={team} style={{'--club':teamColor(team)}}><h5><i/>{team} OFFENSE <small>VS {opponent} DEFENSE</small></h5><small>{profile?.sample||0} PREVIOUS GAMES · {profile?.qb||'QB UNAVAILABLE'}</small><dl>{rates.map(([label,offense,defense])=><div key={label}><dt>{label}</dt><dd>{input?`OFF ${fmt(input[offense])} · ALLOWED ${fmt(input[defense])}`:'—'}</dd></div>)}<div><dt>OFFENSE SUCCESS</dt><dd>{Number.isFinite(profile?.success)?`${(profile.success*100).toFixed(1)}%`:'—'}</dd></div><div><dt>EST. DRIVES / GAME</dt><dd>{input?format(input.Possessions):'—'}</dd></div><div><dt>QB VS TEAM PASS EPA</dt><dd>{input?fmt(input.Quarterback):'—'}</dd></div><div><dt>REST EDGE</dt><dd>{input?`${input.Rest>0?'+':''}${format(input.Rest)} DAYS`:'—'}</dd></div></dl></article>})}</div><p className="nfl-workload-note">EPA allowed is the opposing defense’s recent EPA per play. Higher positive EPA allowed means the offense has produced more efficiently against that defense. QB comparison is a shrunk rate difference, not a quarterback projection.</p></>}
    {hasRedZone&&<><h5 className="nfl-red-zone-title">RED-ZONE TOUCHDOWNS ALLOWED</h5><div className="nfl-workload-grid">{[game.away,game.home].map(team=>{const stats=redZone[team],trips=Number(stats?.trips)||0;return <article key={team} style={{'--club':teamColor(team)}}><h5><i/>{team} DEFENSE</h5>{trips?<><small>{trips} RED-ZONE DRIVES · {stats.games} GAMES</small><dl><div><dt>ALL TD / TRIP</dt><dd>{(100*Number(stats.touchdowns||0)/trips).toFixed(1)}%</dd></div><div><dt>RUSH TD / TRIP</dt><dd>{(100*Number(stats.rushingTDs||0)/trips).toFixed(1)}%</dd></div><div><dt>PASS TD / TRIP</dt><dd>{(100*Number(stats.passingTDs||0)/trips).toFixed(1)}%</dd></div><div><dt>TD ALLOWED</dt><dd>{stats.touchdowns||0}</dd></div></dl></>:<p className="nfl-workload-empty">No pregame red-zone sample available.</p>}</article>})}</div><p className="nfl-workload-note">Rates use the defense’s red-zone trips faced this season before the selected game. Small samples are descriptive and aren’t treated as a scoring probability.</p></>}
  </section>;
}
