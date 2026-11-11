import {gamePicks} from '../lib/gamePicks.js';
import TeamLogo from './TeamLogo.jsx';
import {teamNames} from '../lib/schedule.js';
import React,{useMemo,useRef,useState} from 'react';
import {ArrowUpRight,ChartNoAxesCombined,Cloud,Info,Shield,Target} from 'lucide-react';
import {projection} from '../lib/projection.js';
import {METRICS,getPlayerGames} from '../lib/stats.js';
import {priceText,playerAverageLine,quotedPlayers,postedLines} from '../lib/bookLine.js';
import {buildOpportunityEfficiencyPriors,estimateOpportunityProjection,getUsageMetric,hasMeaningfulProjectionRole,PLAYER_PROJECTION_MARKETS} from '../lib/playerProjection.js';
import {teamWorkload} from '../lib/teamWorkload.js';
import {highImpactInjuries} from '../lib/gameInjuries.js';
import {defenseTable} from '../lib/matchup.js';
import {teamColor} from '../lib/teamColors.js';
import {postedPriors,projectPosted} from '../lib/postedProjection.js';
import {sortColumns,sortPropRows} from '../lib/propSort.js';
import MatchupProps from './MatchupProps.jsx';
import GameChanges from './GameChanges.jsx';
import FilterMenu from './FilterMenu.jsx';
import PropsBoard from './PropsBoard.jsx';
import {InjuryReport,InjuryTeams} from './InjuryReport.jsx';
import {MatchReport} from './MatchReport.jsx';
import './NflGames.css';

const kickoff=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});
const weekOf=game=>game.season+' · Week '+game.week;
const normalizeTeamCode=t=>({LA:'LAR',STL:'LAR',WSH:'WAS',JAC:'JAX',OAK:'LV',SD:'LAC'}[t]||t);
const marketsFor=PLAYER_PROJECTION_MARKETS;
const usageLabels={attempts:'PASS ATT',carries:'CARRIES',targets:'TARGETS'};
const format=n=>Number.isFinite(n)?(Number.isInteger(n)?String(n):n.toFixed(1)):'—';
const sameGame=(a,b)=>a&&b&&normalizeTeamCode(a.away)===normalizeTeamCode(b.away)&&normalizeTeamCode(a.home)===normalizeTeamCode(b.home)&&Math.abs(Date.parse(a.kickoff)-Date.parse(b.kickoff))<12*3600000;
function savedAnalysis(){try{return JSON.parse(sessionStorage.getItem('nfl-games-analysis')||'{}')}catch{return {}}}

const dayLabel=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'America/New_York'});
const timeLabel=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});
const gameKey=g=>g.id||g.kickoff+g.home;
const gameDay=g=>dayLabel.format(new Date(g.kickoff));
const gameTime=g=>g.timeKnown===false?'Time TBD':timeLabel.format(new Date(g.kickoff));

export default function NflGames({schedule,books,players,validation,season,now,onOpen,updated,loading,error}){
  const [requestedWeek,setWeek]=useState(()=>savedAnalysis().week||'');
  const [selectedId,setSelected]=useState('');
  const [tab,setTab]=useState(()=>savedAnalysis().tab||'game');
  const [position,setPosition]=useState(()=>savedAnalysis().position||'ALL');
  const [market,setMarket]=useState(()=>savedAnalysis().market||'ALL');
  const analysisRef=useRef(null);
  const upcoming=(schedule||[]).filter(g=>Date.parse(g.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  const weeks=[...new Set(upcoming.map(weekOf))];
  const week=weeks.includes(requestedWeek)?requestedWeek:weeks[0];
  const games=upcoming.filter(g=>weekOf(g)===week);
  const selected=games.find(g=>gameKey(g)===selectedId);
  function openMatchup(id){
    setSelected(id);
    if(!selected)setTab('game');
    requestAnimationFrame(()=>{
      analysisRef.current?.focus({preventScroll:true});
      analysisRef.current?.scrollIntoView({block:'start'});
    });
  }
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
      if([report?.gameStatus,report?.status].some(s=>/^(out|doubtful|inactive|ir|injured reserve|suspended|pup|physically unable to perform)$/i.test(s?.trim())))continue;
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
        output.push({p,team,metric,label,sampleLabel,seasonAvg:values.reduce((a,b)=>a+b,0)/values.length,
          recentAvg:recent.reduce((a,b)=>a+b,0)/recent.length,history:history.length,estimated:estimated?.projection??null,
          usageLabel:usageLabels[usageKey],usageAvg:observed.reduce((sum,g)=>sum+Number(g.usage?.[usageKey]||0),0)/observed.length,
          share:shareValues.length?shareValues.reduce((a,b)=>a+b,0)/shareValues.length:null,averageLine:playerAverageLine(observed,metric),opponent,defense,
          values:values.slice(-5)});
      }
    }
    const quotes=quotedPlayers(bookGame,selected,players||[]);
    if(quotes.length){
      const priors=postedPriors(players||[],selected);
      return quotes.filter(({line})=>market==='ALL'||line.metric===market).map(({line,player,status})=>{
        const stats=output.find(row=>row.p.id===player?.id&&row.metric===line.metric);
        const fallback=stats?null:projectPosted({player,line,status,game:selected,priors});
        return {...stats,...fallback,p:player||{name:line.player},team:player?.team||[selected.away,selected.home].find(t=>line.player.endsWith(teamNames[t]+' D/ST')),metric:line.metric,
          label:line.anytime?'Anytime TD':METRICS[line.metric]?.label||line.metric,line,status,chartAvailable:Boolean(player?.games?.length)};
      }).sort((a,b)=>a.p.name.localeCompare(b.p.name)||a.label.localeCompare(b.label));
    }
    return output.sort((a,b)=>a.team.localeCompare(b.team)||a.p.name.localeCompare(b.p.name)||a.label.localeCompare(b.label));
  },[players,selected,bookGame,market]);
  const breakdown=selected?projection(selected,selected.awayRating,selected.homeRating):null;
  const selectedAnalysis=selected&&<section ref={analysisRef} tabIndex={-1} className="nfl-analysis" aria-labelledby="nfl-analysis-title">
    <section className="match-score" aria-labelledby="nfl-analysis-title">
      <div className="match-score-caption"><h2 id="nfl-analysis-title">Projected final score</h2><span>{selected.timeKnown===false?selected.date+' · Time TBD':kickoff.format(new Date(selected.kickoff))}</span></div>
      <div className="match-score-teams">{['away','home'].map(side=>{
        const team=selected[side],score=breakdown?.[side==='away'?'a':'h']?.score;
        const code=({WAS:'wsh',LA:'lar'})[team]||team.toLowerCase();
        return <div key={side} style={{'--club':teamColor(team)}}><img alt="" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>
          <span><small>{side}</small><b>{team}</b></span><strong>{Number.isFinite(score)?score.toFixed(1):'—'}</strong></div>;
      })}</div>
    </section>
    <nav className="nfl-analysis-tabs" role="tablist" aria-label="Game Analysis">
      {[['game','GAME PICKS',Target],['players','PLAYER PROPS',ChartNoAxesCombined],['breakdown','MODEL BREAKDOWN',Shield]].map(([key,label,Icon])=><button key={key} id={'nfl-tab-'+key} type="button" role="tab" aria-controls={'nfl-view-'+key} aria-selected={tab===key} tabIndex={0} onClick={()=>{setTab(key);try{sessionStorage.setItem('nfl-games-analysis',JSON.stringify({week,selected:selected?.id||(selected?.kickoff+selected?.home),tab:key,position,market}))}catch{}}}><Icon size={17}/>{label}</button>)}
    </nav>
    <div id={'nfl-view-'+tab} role="tabpanel" aria-labelledby={'nfl-tab-'+tab} tabIndex={0} className="nfl-tab-panel">
      {tab==='game'&&<GamePredictions players={players} game={selected} model={breakdown} validation={validation} bookGame={bookGame}/>}
      {tab==='players'&&<PlayerResearch game={selected} rows={rows} position={position} setPosition={setPosition} market={market} setMarket={setMarket} onOpen={onOpen} books={books} players={players} season={season} now={now}/>}
      {tab==='breakdown'&&<ModelBreakdown game={selected} model={breakdown} bookGame={bookGame} players={players}/>}
    </div>
  </section>;

  return <section className="panel nfl-games"><header className="nfl-games-heading"><div><small>NFL · V2</small><h1>NFL Games</h1></div><span className="nfl-data-chip"><span/> SCHEDULE SNAPSHOT</span></header>
    {weeks.length>0&&<><div className="board-controls nfl-week-control"><label>Game Week<FilterMenu aria-label="Game Week" value={week} onChange={e=>{setWeek(e.target.value);setSelected('');}}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu></label><label>Matchup<FilterMenu aria-label="Matchup" value={selected?gameKey(selected):''} onChange={e=>openMatchup(e.target.value)}>
        <option value="">All games</option>{games.map(g=><option key={gameKey(g)} value={gameKey(g)} data-group={gameDay(g)} data-short-label={g.away+' @ '+g.home}>{gameTime(g)+' · '+g.away+' @ '+g.home}</option>)}
      </FilterMenu></label>{selected&&<div className="match-arrows" aria-label="Switch matchup">{[-1,1].map(step=>{
        const next=games[games.indexOf(selected)+step];
        return <button type="button" key={step} disabled={!next} aria-label={step<0?'Previous matchup':'Next matchup'} onClick={()=>openMatchup(gameKey(next))}>{step<0?'←':'→'}</button>;
      })}</div>}<p>Schedule updated {updated}</p></div>
      {selected?<><button className="slate-back" type="button" onClick={()=>setSelected('')}>← All games</button>{selectedAnalysis}</>:<WeeklySlate games={games} onOpen={openMatchup}/>}
    </>}
    {!upcoming.length&&<p>{loading?'Loading the NFL schedule…':error||'No upcoming games in the current schedule.'}</p>}
  </section>;
}

function WeeklySlate({games,onOpen}){
  const days=new Map();
  for(const game of games){
    const day=gameDay(game);
    if(!days.has(day))days.set(day,[]);
    days.get(day).push(game);
  }
  return <div className="weekly-slate">{[...days].map(([day,fixtures])=><section key={day}>
    <h2>{day}</h2>
    {fixtures.map(game=>{
      const model=projection(game,game.awayRating,game.homeRating);
      const {winner,hasWinnerForecast,spreadTeam,spreadLine,spreadEdge,totalSide}=gamePicks(game,model);
      const winnerPrice=winner?.team===game.home?game.homePrice:game.awayPrice;
      const spreadPrice=spreadTeam===game.home?game.homeSpreadPrice:game.awaySpreadPrice;
      const totalPrice=totalSide==='OVER'?game.overPrice:game.underPrice;
      return <button className="slate-fixture" type="button" key={gameKey(game)} onClick={()=>onOpen(gameKey(game))}>
        <span className="slate-pair"><b><span style={{'--club':teamColor(game.away)}}><TeamLogo team={game.away}/>{game.away}</span> @ <span style={{'--club':teamColor(game.home)}}><TeamLogo team={game.home}/>{game.home}</span></b><small>{gameTime(game)}</small></span>
        <span><small>Moneyline winner</small><b>{winner?winner.team+' '+priceText(winnerPrice):hasWinnerForecast?'Even':'Unavailable'}</b>
          {winner&&<em>{(100*winner.probability).toFixed(1)}% model win</em>}</span>
        <span><small>Spread</small><b>{spreadTeam?spreadTeam+' '+(spreadLine>0?'+':'')+spreadLine:spreadEdge==null?'Unavailable':'No clear side'}</b>
          {spreadTeam&&Number.isFinite(spreadPrice)&&<em>{priceText(spreadPrice)}</em>}</span>
        <span><small>Total</small><b>{totalSide==='OVER'||totalSide==='UNDER'?totalSide+' '+game.totalLine:totalSide||'Unavailable'}</b>
          {(totalSide==='OVER'||totalSide==='UNDER')&&Number.isFinite(totalPrice)&&<em>{priceText(totalPrice)}</em>}</span>
        <span className="slate-chevron" aria-hidden="true">›</span>
      </button>;
    })}
  </section>)}</div>;
}

function GamePredictions({game,model,validation,players,bookGame}){
  const workload=useMemo(()=>({away:teamWorkload(players,game.away,game),home:teamWorkload(players,game.home,game)}),[players,game]);
  const {elo,margin,projectedTotal,winner,hasWinnerForecast,spreadTeam,spreadLine,spreadEdge,totalSide}=gamePicks(game,model);
  return <div className="nfl-view-panel">
    <div className="nfl-predictions-heading"><div><h3>Model picks</h3></div><span>RESEARCH OUTPUT · NOT A BETTING EDGE</span></div>
    <div className="nfl-pick-grid">
      <PickTile label="WINNER PROJECTION" team={winner?.team} value={winner?.team||(hasWinnerForecast?'NO CLEAR WINNER':'Forecast unavailable')} detail={winner?`${(winner.probability*100).toFixed(1)}% model win probability · calibrated Elo`:hasWinnerForecast?'Elo probabilities are effectively even.':'No calibrated Elo forecast for this game.'}/>
      <PickTile label="SPREAD PICK" team={spreadTeam} value={spreadTeam&&Number.isFinite(spreadLine)?`${spreadTeam} ${spreadLine>0?'+':''}${spreadLine}`:spreadEdge==null?'Spread line unavailable':'No clear side'} detail={Number.isFinite(margin)?`Model margin: ${margin>0?'+':''}${margin.toFixed(1)} points for ${game.home}.`:'Team score projection unavailable.'}/>
      <PickTile label="OVER / UNDER PICK" value={totalSide&&Number.isFinite(game.totalLine)?`${totalSide} ${game.totalLine}`:totalSide||'Total line unavailable'} detail={Number.isFinite(projectedTotal)?`Projected total ${projectedTotal.toFixed(1)} points${Number.isFinite(game.totalLine)?` vs. ${game.totalLine} schedule line`:''}.`:'Team score projection unavailable.'}/>

    </div>
    <h3 className="match-section-title">Game lines</h3>
    <div className="nfl-market-grid"><MarketTile label="MONEYLINE PRICE" value={`${game.away} ${priceText(game.awayPrice)} · ${game.home} ${priceText(game.homePrice)}`}/><MarketTile label="SPREAD LINE" value={Number.isFinite(game.homeSpread)?`${game.home} ${game.homeSpread>0?'+':''}${game.homeSpread}`:'Unavailable'}/><MarketTile label="TOTAL LINE" value={Number.isFinite(game.totalLine)?`${game.totalLine} · O ${priceText(game.overPrice)} / U ${priceText(game.underPrice)}`:'Unavailable'} /></div>
    <InjuryFlags game={game} workload={workload}/>
    <GameChanges game={game} book={bookGame}/>
    <details className="nfl-validation-details"><summary>MODEL VALIDATION &amp; DATA LIMITS <span>View the holdout record and comparisons</span></summary>    <div className="nfl-probability-honesty"><Info size={17}/><span>The winner percentage comes from Elo, calibrated on {elo?.calibrationSeason||'the prior season'} and updated through Week {elo?.asOfWeek??'—'}. The spread and total are directional picks from the score projection. Walk-forward tests show the closing market was more accurate than this research model; treat the picks as model comparisons, not betting edges. Schedule prices have no per-matchup timestamp.</span></div>
<ModelEvidence validation={validation}/></details>
  </div>;
}

function MarketTile({label,value}){return <article className="nfl-market-tile"><small>{label}</small><b>{value}</b></article>}

function PickTile({label,value,detail,team}){
  return <article className="nfl-pick-tile" style={team?{'--club':teamColor(team)}:undefined}><small>{label}</small><b><TeamLogo team={team}/>{value}</b><span>{detail}</span></article>;
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
  const [sortOrder,setSortOrder]=useState(()=>{
    try {
      const stored=sessionStorage.getItem('nfl-games-prop-sort');
      return Object.values(sortColumns).flat().includes(stored)?stored:'player';
    } catch { return 'player'; }
  });
  function changeSort(column){
    const [first,second]=sortColumns[column];
    const order=sortOrder===first?second:first;
    setSortOrder(order);
    try { sessionStorage.setItem('nfl-games-prop-sort',order); } catch {}
  }
  const visibleRows=useMemo(()=>sortPropRows(rows.filter(r=>position==='ALL'||r.p.position===position),sortOrder),[rows,position,sortOrder]);
  const propMarkets=Object.entries(METRICS).sort((a,b)=>a[1].label.localeCompare(b[1].label));
  return <div className="nfl-view-panel"><div className="nfl-player-toolbar"><div><h3>Player Prop Research</h3><p>{rows.some(r=>r.line)?'DraftKings lines and model estimates.':'Player averages and model estimates.'}</p></div><div className="board-controls"><label>Position<FilterMenu value={position} onChange={e=>setPosition(e.target.value)}><option value="ALL">All Positions</option>{['QB','RB','TE','WR'].map(p=><option key={p}>{p}</option>)}</FilterMenu></label><label>Market<FilterMenu value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">All Markets</option>{propMarkets.map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</FilterMenu></label>
      </div></div>
    {(sortOrder==='high'||sortOrder==='low')&&market==='ALL'&&<p className="prop-sort-note">Projections ranked within each market.</p>}
    {!(books||[]).some(b=>sameGame(b,game)&&postedLines(b).length>0)&&<p className="nfl-empty-state">No DraftKings props in this matchup’s snapshot yet. The full slate is checked Wednesday and upcoming games are refreshed Sunday morning.</p>}
    <MatchupProps key={game.id} rows={visibleRows} order={sortOrder} onSort={changeSort} game={game} onOpen={onOpen}/>
    <div className="nfl-probability-honesty"><Info size={17}/><span>Posted props use pregame workload and efficiency. Anytime TD shows the estimated chance of at least one rushing or receiving touchdown using a Poisson approximation. A new starting QB with only relief appearances uses league starter workload. Limited samples and gaps in recent appearances are flagged. For matchups without posted markets, the research line averages up to 10 prior games this season.</span></div>
    <details className="nfl-full-props"><summary>OPEN FULL MATCHUP PROP BOARD <ArrowUpRight size={15}/></summary><PropsBoard fixedGame={game} title="Matchup Player Prop Board" games={(books||[]).filter(g=>sameGame(g,game))} schedule={[game]} players={players} season={season} now={now} onOpen={onOpen}/></details>
  </div>;
}

function InjuryFlags({game,workload}){
  const reports=highImpactInjuries(game,workload);
  return <section className="nfl-injury-panel"><h4><Shield size={16}/> KEY MATCHUP INJURIES</h4>
    {reports.length?<InjuryTeams game={game} highlights={reports}/>:<p>No key-player flags in the available reports.</p>}
    <InjuryReport game={game}/>
  </section>;
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
    ['Sportsbook player props',postedLines(bookGame).length?`${postedLines(bookGame).length} markets with timestamped prices`:'No timestamped player props available']];

  return <div className="nfl-view-panel"><div className="nfl-breakdown-intro"><div><small>MODEL INPUT AUDIT</small><h3>What Is In This Matchup</h3></div><span>RAW INPUTS · NO HIDDEN FACTORS</span></div>
    <div className="nfl-breakdown-list">{lines.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <section className="nfl-workload-panel"><header><div><h4>TEAM WORKLOAD &amp; QB SNAPSHOT</h4><p>Recent completed games before this matchup · selected-season sample when available</p></div><span>HISTORICAL CONTEXT</span></header><div className="nfl-workload-grid">{[[game.away,workload.away],[game.home,workload.home]].map(([team,profile])=><article key={team} style={{'--club':teamColor(team)}}><h5><i/>{team}</h5>{profile?<><small>{profile.source} · {profile.games} G</small><dl><div><dt>QB PASS ATT / G</dt><dd>{format(profile.passAttempts)}</dd></div><div><dt>TEAM CARRIES / G</dt><dd>{format(profile.carries)}</dd></div><div><dt>TEAM TARGETS / G</dt><dd>{format(profile.targets)}</dd></div><div><dt>QB PASS YDS / ATT</dt><dd>{profile.yardsPerAttempt==null?'—':profile.yardsPerAttempt.toFixed(2)}</dd></div></dl><p>{profile.rushLeader?`CARRY LEADER · ${profile.rushLeader[0]} (${format(profile.rushLeader[1]/profile.games)} / G)`:''}{profile.targetLeader?`${profile.rushLeader?' · ':''}TARGET LEADER · ${profile.targetLeader[0]} (${format(profile.targetLeader[1]/profile.games)} / G)`:''}</p></>:<p className="nfl-workload-empty">No completed player usage rows are available before this matchup.</p>}</article>)}</div><p className="nfl-workload-note">These are descriptive team/player history summaries, not opponent-adjusted inputs to the independent score estimate. Targets can differ slightly from pass attempts because sacks, scrambles, and data coverage affect the totals.</p></section>
    <PlayByPlayMatchup game={game}/>
    <InjuryFlags game={game} workload={workload}/>
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
