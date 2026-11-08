import ChartSelect from './ChartSelect.jsx';
import React,{useMemo,useState} from 'react';
import {METRICS,getPlayerGames,filteredWindow,isHit,summarize,formatNumber,formatRate} from '../lib/stats.js';
import {priceText,usageFor} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {defenseRankStyle} from './HitRate.jsx';
import {teamColor} from '../lib/teamColors.js';
import {ChartSlate} from './ChartSlate.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflCharts.css';

export const chartMarkets={...METRICS,scrimmageYards:{label:'Rushing + Receiving Yards',unit:'yds',defaultLine:69.5}};

const dateFormat=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
function gameDate(g){
  const date=Date.parse(g.date+'T12:00:00Z');
  return Number.isFinite(date)?dateFormat.format(date):g.season+' · W'+g.week;
}

function TeamLogo({team}) {
  const normalized=({LA:'LAR',WSH:'WAS',JAC:'JAX'})[team] || team;
  const code=normalized==='WAS'?'wsh':normalized?.toLowerCase();
  return code?<img key={code} className="chart-logo" alt="" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>:null;
}

function boxScoreFields(g) {
  return [['Pass Yards',g.stats.passingYards],['Rush Yards',g.stats.rushingYards],['Receiving Yards',g.stats.receivingYards],
        ['Pass Attempts',g.usage?.attempts],['Carries',g.usage?.carries],['Targets',g.usage?.targets],
        ['Receptions',g.stats.receptions],['Pass TDs',g.stats.passingTDs],['TDs Scored',g.stats.scoredTDs]];
}

function PlayerBoxScore({game}) {
  return <dl>{boxScoreFields(game).map(([label,stat])=><div key={label}><dt>{label}</dt><dd>{stat ?? '—'}</dd></div>)}</dl>;
}

function GameChart({games,players,playerPosition,playerName,metric,line,direction}) {
  const [selected,setSelected]=useState('');
  const info=chartMarkets[metric];
  const volume=usageFor(metric);
  const usageFields=metric==='scrimmageYards' || metric==='scoredTDs'?[['carries','Carries'],['targets','Targets']]:[[volume.key,volume.label]];
  const ranks=useMemo(()=>new Map(games.map(g=>{
    const table=defenseTable(players,g.season,playerPosition,metric,g.week);
    return [g.gameId,{defense:table.find(row=>row.team===g.opponent),teams:table.length}];
  })),[games,players,playerPosition,metric]);
  const rows=games.map(game=>{
    const value=game.stats[metric] ?? 0;
    const margin=(value-line)*(direction==='over'?1:-1);
    return {game,value,margin,...ranks.get(game.gameId),outcome:line==null?'Unrated':margin>0?'Hit':margin<0?'Miss':'Push'};
  });
  const low=Math.min(0,...rows.map(r=>r.value));
  const high=Math.max(1,line,...rows.map(r=>r.value));
  const position=v=>8+75*(v-low)/(high-low);
  const active=rows.find(r=>r.game.gameId===selected);
  if(!rows.length)return <p>No recorded games match this venue and window.</p>;
  return <><div className="plot-heading"><span>{info.label}</span>{line!=null && <b>{direction} {line} · dashed line</b>}</div>
    <div className="margin-scroll"><div className="margin-bars" style={{'--count':rows.length,'--target':position(line)+'%'}}>
    {rows.map(r=><button key={r.game.gameId} type="button" data-result={r.outcome} aria-pressed={r===active}
      aria-label={'Week '+r.game.week+' against '+r.game.opponent+', '+r.value+' '+info.unit+', '+r.outcome}
      onClick={()=>setSelected(previous=>previous===r.game.gameId?'':r.game.gameId)}>
      <span className="bar-space"><i style={{bottom:Math.min(position(0),position(r.value))+'%',height:Math.max(1,Math.abs(position(r.value)-position(0)))+'%'}}/>
        <strong style={{bottom:Math.max(position(0),position(r.value))+'%'}}>{r.value}</strong></span>
      <TeamLogo team={r.game.opponent}/><b>{r.game.venue==='A'?'@ ':'vs '}{r.game.opponent}</b><span className="chart-rank" style={defenseRankStyle(r.defense?.rank,r.teams)}>DEF {r.defense?'#'+r.defense.rank:'—'}</span><span>{gameDate(r.game)}</span><span>W{r.game.week} · {r.outcome}</span>
      <span className="game-volume">{usageFields.map(([key,label])=><span key={key}><b>{r.game.usage?.[key] ?? '—'}</b> {label.toLowerCase()}</span>)}</span>
    </button>)}</div></div>
    {active?<section className="bar-report log-body" aria-label="Selected Game Details"><h3>{playerName} · {active.game.team} {active.game.venue==='A'?'@':'vs.'} {active.game.opponent}</h3><p className="margin-detail"><b data-result={active.outcome}>{active.outcome}</b> · {gameDate(active.game)} · Week {active.game.week} · {active.value} {info.unit} {line!=null && ' · '}{line==null?'':active.margin===0?'Exactly on the line':Math.abs(active.margin).toFixed(1)+' '+(active.value>line?'above':'below')+' the line'}{metric==='scrimmageYards' && <> · {active.game.stats.rushingYards ?? 0} rushing + {active.game.stats.receivingYards ?? 0} receiving</>}</p><PlayerBoxScore game={active.game}/>{Array.isArray(active.game.scoringChances) && <p>Red-Zone Carries: {active.game.scoringChances[0]} · Red-Zone Targets: {active.game.scoringChances[1]} · Carries From the 5 or Closer: {active.game.scoringChances[2]}</p>}<p className="defense-note">{active.defense?<><b>{active.game.opponent} DEF #{active.defense.rank} of {active.teams}</b> · {formatNumber(active.defense.average)} {info.unit} per game allowed to {playerPosition}s across {active.defense.games} prior games.</>:'Pregame defense rank unavailable for this week.'} Rank 1 allows the most to the position before that week.</p></section>:<p className="bar-hint">Select A Game Bar For Player Stats.</p>}</>;
}

function LineControl({line,setLine,resetLine,manual,quote,median,games,metric,direction}) {
  const [draft,setDraft]=useState(null);
  const savedAt=Date.parse(quote?.updated);
  const stamp=Number.isFinite(savedAt)?new Date(savedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}):'';
  const source=quote?'DraftKings snapshot · '+quote.point+(stamp?' · '+stamp:''):'No sportsbook line data';
  const anchor=quote?.point ?? median ?? line;
  const interval=chartMarkets[metric].unit==='yds'?5:1;
  const options=anchor==null || !games.length?[]:Array.from({length:3},(_,i)=>(anchor>=interval?anchor-interval:Math.max(0,anchor))+i*interval);
  function step(delta){setDraft(null);setLine(Math.max(0,Math.round((line+delta)*100)/100))}
  function apply(){
    const value=Number(draft);
    if(draft!=null && draft.trim() && Number.isFinite(value) && value>=0)setLine(value);
    setDraft(null);
  }
  return <details className="line-control">
    <summary><span className="line-caption">Prop Line</span><strong>{line ?? '—'}</strong><small>{manual?'Custom':quote?'DK Snapshot':'No Sportsbook Line Data'}</small><span className="line-edit"><span className="line-closed-label">Choose Line</span><span className="line-open-label">Close</span></span></summary>
    <div className="line-panel"><small>{source}</small>
    {options.length>0 && <div className="line-compare" role="group" aria-label="Compare research lines">{options.map(value=>{
      const summary=summarize(games,metric,value,direction);
      const saved=quote?.point===value;
      return <button type="button" key={value} aria-pressed={line===value} onClick={()=>{setDraft(null);if(saved)resetLine();else setLine(value)}}>
        <strong>{value}{saved && <sup> DK</sup>}</strong><span>{summary.hits}/{summary.total} {direction}</span>
      </button>;
    })}</div>}
    <div className="line-stepper"><button aria-label="Decrease line by half a point" disabled={line==null || line<=0} onClick={()=>step(-.5)}>−</button>
    <input id="chart-line" aria-label="Exact prop line" type="text" inputMode="decimal" placeholder="Line" value={draft ?? line ?? ''} onFocus={e=>e.target.select()} onChange={e=>setDraft(e.target.value)} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>
    <button aria-label="Increase line by half a point" disabled={line==null} onClick={()=>step(.5)}>+</button></div>
    {Number.isFinite(median) && median>=0 && median!==line && <button className="line-reset" onClick={()=>{setDraft(null);setLine(median)}}>Use median · {median}</button>}
    {manual && <button className="line-reset" onClick={()=>{setDraft(null);resetLine()}}>{quote?'Use DK '+quote.point:'Clear custom line'}</button>}
    </div></details>;
}

function recentDefenseGames(players,matchup,position,metric) {
  if(!matchup)return [];
  const totals=new Map();
  for(const player of players){
    for(const g of player.games){
      if(g.season!==matchup.season || Number(g.week)>=Number(matchup.week) || g.opponent!==matchup.opponent)continue;
      if(!totals.has(g.gameId))totals.set(g.gameId,{game:g,total:0,leader:null});
      if(player.position!==position)continue;
      const row=totals.get(g.gameId),value=g.stats[metric] ?? 0;
      row.total+=value;
      if(!row.leader || value>row.leader.value)row.leader={name:player.name,value};
    }
  }
  return [...totals.values()].sort((a,b)=>Number(b.game.week)-Number(a.game.week)).slice(0,3);
}

function KickoffConditions({game}) {
  const context=game.context || {};
  const weather=context.weather;
  const when=new Date(game.kickoff).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',
    ...(game.timeKnown===false?{}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})});
  const conditions=[Number.isFinite(weather?.temp) && weather.temp+' °F',Number.isFinite(weather?.wind) && 'Wind '+weather.wind+' MPH',
    Number.isFinite(weather?.rain) && weather.rain+'% Rain Chance'].filter(Boolean);
  const enclosed=['closed','dome'].includes(context.roof);
  return <div className="kickoff-conditions"><div><small>Kickoff · Week {game.week}</small><b>{when}{game.timeKnown===false?' · Time TBD':''}</b>
    <span>{context.stadium || game.venue}{context.roof?' · '+context.roof:''}</span></div>
    <div><small>Kickoff Weather</small><b>{enclosed?'Enclosed Venue':conditions.length?conditions.join(' · '):'Forecast Unavailable'}</b>
    {!enclosed && conditions.length>0 && Number.isFinite(Date.parse(weather.asOf)) && <span>Forecast Saved {new Date(weather.asOf).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</span>}</div></div>;
}

function MatchResearch({players,game,player,metric,line,direction,history,defenses}) {
  const prior=useMemo(()=>recentDefenseGames(players,game,player.position,metric),[players,game,player.position,metric]);
  if(!game)return <section className="lab-block"><h2>Matchup research</h2><p>No matchup in the selected week.</p></section>;
  const defense=defenses.find(d=>d.team===game.opponent);
  const totalGames=defenses.reduce((n,row)=>n+row.games,0);
  const leagueMean=totalGames?defenses.reduce((n,row)=>n+row.total,0)/totalGames:null;
  const against=history.filter(g=>g.opponent===game.opponent);
  const headToHead=summarize(against,metric,line,direction);
  const unit=chartMarkets[metric].unit;
  return <section className="lab-block matchup-lab"><h2>Matchup research</h2>
    <h3><TeamLogo team={game.away}/>{game.away} at {game.home}<TeamLogo team={game.home}/></h3>
    <KickoffConditions game={game}/>
    <dl><div><dt>{game.opponent} vs. {player.position}s</dt><dd>{defense?'#'+defense.rank+' of '+defenses.length:'—'}</dd></div>
      <div><dt>Position group allowed per game</dt><dd>{formatNumber(defense?.average)} {unit}</dd></div>
      <div><dt>League average allowed to {player.position}s</dt><dd>{formatNumber(leagueMean)} {unit}</dd></div>
      <div><dt>Player vs. {game.opponent} in selected history</dt><dd>{against.length?(line==null?'':headToHead.hits+'/'+against.length+' hits · ')+formatNumber(headToHead.average)+' '+unit+' avg':'No meetings'}</dd></div></dl>
    <p className="method">{game.season} defense ranks · Rank 1 allows the most {chartMarkets[metric].label.toLowerCase()} to the entire position group.{defense?' Based on '+defense.games+' opponent games.':''}</p>
    <h3>Last Three Games Against {player.position}s</h3>
    {prior.length?<div className="history-scroll"><table><thead><tr><th>Game</th><th>Offense</th><th>Group Total</th><th>Leading Player</th></tr></thead><tbody>
      {prior.map(({game:g,total,leader})=><tr key={g.gameId}><td>{gameDate(g)} · W{g.week}</td><td>{g.team}</td><td>{total} {unit}</td><td>{leader && leader.value>0?leader.name+' · '+leader.value+' '+unit:'—'}</td></tr>)}
    </tbody></table></div>:<p>No Earlier Games Recorded This Season.</p>}
  </section>;
}

const logFields={
  passingYards:['Pass Yards',g=>g.stats.passingYards],
  attempts:['Pass Attempts',g=>g.usage?.attempts],
  passingTDs:['Pass TDs',g=>g.stats.passingTDs],
  rushingYards:['Rush Yards',g=>g.stats.rushingYards],
  rushingAttempts:['Carries',g=>g.usage?.carries ?? g.stats.rushingAttempts],
  receivingYards:['Receiving Yards',g=>g.stats.receivingYards],
  receptions:['Receptions',g=>g.stats.receptions],
  targets:['Targets',g=>g.usage?.targets],
  scoredTDs:['TDs Scored',g=>g.stats.scoredTDs],
};
const passing=['passingYards','attempts','passingTDs'];
const receiving=['receivingYards','receptions','targets'];
const rushing=['rushingYards','rushingAttempts'];

function logColumns(position,games,metric){
  let fields;
  if(position==='QB')fields=[...passing,...rushing,'scoredTDs'];
  else if(position==='RB' || position==='FB')fields=[...rushing,...receiving,'scoredTDs'];
  else if(position==='WR' || position==='TE'){
    fields=[...receiving,'scoredTDs'];
    if(games.some(g=>logFields.rushingAttempts[1](g)>0 || g.stats.rushingYards))fields.push(...rushing);
  }else fields=Object.keys(logFields).filter(key=>games.some(g=>logFields[key][1](g)));
  return fields.filter(key=>key!==metric).map(key=>logFields[key]);
}

function GameLog({games,line,direction,metric,position}) {
  const market=chartMarkets[metric];
  const columns=logColumns(position,games,metric);
  const ordered=[...games].reverse();
  return <section className="lab-block player-log" aria-label="Game Log">
    <h2>Game Log</h2><p>{market.label} · {line==null?'No Line Selected':(direction==='over'?'Over ':'Under ')+line} · Newest First</p>
    {ordered.length>0 && <div className="history-scroll log-table" tabIndex="0" role="region" aria-label="Game Log Statistics"><table><thead><tr>
      <th>Week</th><th>Opponent</th><th>{market.label}</th><th>Result</th>{columns.map(([label])=><th key={label}>{label}</th>)}<th>Date</th>
    </tr></thead><tbody>{ordered.map(g=>{
      const v=g.stats[metric] ?? 0;
      const outcome=line==null?'Unrated':v===line?'Push':isHit(v,line,direction)?'Hit':'Miss';
      return <tr key={g.gameId}><th scope="row">{g.week}</th><td><span className="log-table-team"><TeamLogo team={g.opponent}/>{g.venue==='A'?'@':'vs.'} {g.opponent}</span></td>
        <td><b>{v}</b></td><td><span className="log-outcome" data-result={outcome}>{outcome}</span></td>
        {columns.map(([label,read])=><td key={label}>{read(g) ?? '—'}</td>)}<td>{gameDate(g)}</td></tr>;
    })}</tbody></table></div>}
    {!games.length && <p>No Games At This Venue.</p>}
  </section>;
}

export default function NflCharts({players,seasons,slate,venue,onVenue,resetLine,nextFixture,player,roster,onPlayer,season,markets,metric,onMetric,line,setLine,quote,manual,direction,setDirection,windowSize,setWindowSize,upcoming,defenses,loading,error}) {
  const [chosenSeason,setChosenSeason]=useState('');
  const historySeason=chosenSeason || String(season);
  const splitGames=useMemo(()=>getPlayerGames(player,historySeason),[player,historySeason]);
  const allGames=useMemo(()=>venue==='ALL'?splitGames:splitGames.filter(g=>g.venue===venue),[venue,splitGames]);
  const displayed=useMemo(()=>filteredWindow(allGames,windowSize),[allGames,windowSize]);
  const current=summarize(displayed,metric,line,direction);
  const pushes=displayed.filter(g=>g.stats[metric]===line).length;
  const usage=metric==='scrimmageYards'?{key:'opportunities',label:'Carries + targets'}:usageFor(metric);
  const observedUsage=displayed.map(g=>g.usage?.[usage.key]).filter(Number.isFinite);
  const meanUsage=observedUsage.length ? observedUsage.reduce((sum,value)=>sum+value,0)/observedUsage.length : null;
  const recentUsage=displayed.slice(-3).map(g=>g.usage?.[usage.key]).filter(Number.isFinite);
  return <main className="chart-lab" style={{'--club':teamColor(player?.team) || '#55cfff'}}>
    <header><a href="/preview/"><img alt="" src="/preview/assets/mark.svg"/> PropBets</a><a href="/preview/nfl/">← NFL Menu</a></header>
    <h1>Player <em>Charts</em></h1>
    {!loading && !error && <ChartSlate slate={slate}/>}
    {loading || error || !player?<p>{loading?'Loading player charts…':error || 'No player history available.'}</p>:<>
    <div className="lab-controls">
      <ChartSelect label="Player" value={player.id} onChange={onPlayer}>{roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}</ChartSelect>
      <ChartSelect label="Market" value={metric} onChange={onMetric}>{markets.map(m=><option key={m} value={m}>{chartMarkets[m].label}</option>)}</ChartSelect>
      <ChartSelect label="Side" value={direction} onChange={setDirection}><option value="over">Over</option><option value="under">Under</option></ChartSelect>
      <ChartSelect label="Venue" value={venue} onChange={onVenue}><option value="ALL">All games</option><option value="H">Home</option><option value="A">Away</option></ChartSelect>
      <ChartSelect label="History season" value={historySeason} onChange={setChosenSeason}>{[...seasons].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}<option value="ALL">All seasons</option></ChartSelect>
      <ChartSelect label="Window" value={windowSize} onChange={setWindowSize}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full history</option></ChartSelect>
    </div>
    <section className="lab-player"><div><PlayerPhoto key={player.id} large id={player.id} name={player.name} url={player.photo}/>
      <small>{season} · {player.team} · {player.position}</small><h2>{player.name}</h2><div className="player-next">{nextFixture?<><TeamLogo team={nextFixture.opponent}/><span><b>Next game</b> · {player.team} {nextFixture.venue==='Away'?'at':'vs.'} {nextFixture.opponent}<br/>{new Date(nextFixture.kickoff).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',...(nextFixture.timeKnown===false?{}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})})}{nextFixture.timeKnown===false?' · Time TBD':''}</span></>:<span>No upcoming game scheduled</span>}</div><p>{line==null?'No sportsbook line data':(direction==='over'?'Over ':'Under ')+line+' '+chartMarkets[metric].label.toLowerCase()+' · '+(manual?'Custom line':'DraftKings snapshot')}</p>
      {!manual && quote && <small>Over {priceText(quote.over)} · Under {priceText(quote.under)}</small>}</div>
      <div className="lab-rate">{line==null?<span>Enter a line for hit rates</span>:<><strong>{formatRate(current.rate)}</strong><span>{current.hits} hits in {current.total} games</span><small>{current.total-current.hits-pushes} misses · {pushes} pushes</small></>}</div>
    </section>
    <section className="lab-block"><h2>Game by game</h2><LineControl key={player.id+metric+(upcoming?.id || '')} line={line} setLine={setLine} resetLine={resetLine} manual={manual} quote={quote} median={current.median} games={displayed} metric={metric} direction={direction}/>
      <GameChart key={player.id} playerName={player.name} players={players} playerPosition={player.position} games={displayed} metric={metric} line={line} direction={direction}/></section>
    <MatchResearch players={players} game={upcoming} player={player} metric={metric} line={line} direction={direction} history={splitGames} defenses={defenses}/>
    <section className="lab-block"><h2>Production &amp; workload</h2><dl>
      <div><dt>Average / median</dt><dd>{formatNumber(current.average)} / {formatNumber(current.median)} {chartMarkets[metric].unit}</dd></div>
      <div><dt>{usage.label} per game</dt><dd>{formatNumber(meanUsage)}</dd></div>
      <div><dt>{usage.label} · last {recentUsage.length} recorded</dt><dd>{recentUsage.length?formatNumber(recentUsage.reduce((a,b)=>a+b,0)/recentUsage.length):'—'} per game</dd></div>
      {['H','A'].map(v=>{const s=summarize(splitGames.filter(g=>g.venue===v),metric,line,direction);return <div key={v}><dt>Selected history · {v==='H'?'home':'away'} hits</dt><dd>{line==null?'—':s.hits+'/'+s.total+' · '+formatRate(s.rate)}</dd></div>})}
    </dl></section>
    <GameLog position={player.position} games={allGames} line={line} direction={direction} metric={metric}/>
    </>}
  </main>;
}
