import NflToolHeader from './NflToolHeader.jsx';
import WorkloadUsage from './WorkloadUsage.jsx';
import ChartSelect from './ChartSelect.jsx';
import React,{useMemo,useState} from 'react';
import {METRICS,getPlayerGames,filteredWindow,summarize,formatNumber,formatRate} from '../lib/stats.js';
import {priceText,usageFor} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {DefenseRank,rateStyle} from './HitRate.jsx';
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

function leagueComparison(value,average,direction) {
  if (!Number.isFinite(value) || !Number.isFinite(average)) return undefined;
  if (value === average) return 'equal';
  return (direction === 'under' ? value < average : value > average) ? 'favorable' : 'tough';
}

function TeamLogo({team}) {
  const normalized=({LA:'LAR',WSH:'WAS',JAC:'JAX'})[team] || team;
  const code=normalized==='WAS'?'wsh':normalized?.toLowerCase();
  return code?<img key={code} className="chart-logo" alt="" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>:null;
}

function PlayerBoxScore({game,position,metric}) {
  const keys=logColumns(position,[game],metric);
  return <dl>{keys.map(key=>{
    const [label,read]=logFields[key];
    return <div key={key}><dt>{label}</dt><dd>{read(game) ?? '—'}</dd></div>;
  })}<div><dt>Offensive Snap %</dt><dd>{formatRate(game.usage?.offenseSnapRate)}</dd></div></dl>;
}

function lineResult(value,line,direction) {
  if (line==null) return {margin:null,outcome:'Unrated'};
  const margin=direction==='under' ? line-value : value-line;
  return {margin,outcome:margin>0?'Hit':margin<0?'Miss':'Push'};
}

const marginNumber=new Intl.NumberFormat('en-US',{maximumFractionDigits:12,signDisplay:'exceptZero'});

function GameChart({games,windowSize,players,playerPosition,playerName,metric,line,direction}) {
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
    return {game,value,...ranks.get(game.gameId),...lineResult(value,line,direction)};
  });
  const low=Math.min(0,...rows.map(r=>r.value));
  const high=Math.max(1,line,...rows.map(r=>r.value));
  const position=v=>8+75*(v-low)/(high-low);
  const active=rows.find(r=>r.game.gameId===selected);
  if(!rows.length)return <p>No recorded games match this venue and window.</p>;
  return <><div className="plot-heading"><span>{info.label}</span><small>{rows.length} {rows.length===1?'Game':'Games'} Shown{windowSize!=='season' && rows.length<Number(windowSize) && ' · Last '+windowSize+' Requested'}</small></div>
    <div className="margin-scroll"><div className="margin-bars" style={{'--count':rows.length,'--target':position(line)+'%'}}>
    {rows.map(r=><button key={r.game.gameId} type="button" data-result={r.outcome} aria-pressed={r===active}
      aria-label={'Week '+r.game.week+' against '+r.game.opponent+', '+r.value+' '+info.unit+', '+r.outcome+', offensive snaps '+formatRate(r.game.usage?.offenseSnapRate)}
      onClick={()=>setSelected(previous=>previous===r.game.gameId?'':r.game.gameId)}>
      <span className="bar-space"><i style={{bottom:Math.min(position(0),position(r.value))+'%',height:Math.max(1,Math.abs(position(r.value)-position(0)))+'%'}}/>
        {line!=null && r===rows.at(-1) && <span className="chart-reference">{direction} {line}</span>}
        <strong style={{bottom:Math.max(position(0),position(r.value))+'%'}}>{r.value}</strong></span>
      <TeamLogo team={r.game.opponent}/><b>{r.game.venue==='A'?'@ ':'vs '}{r.game.opponent}</b><span className="chart-rank">DEF <DefenseRank compact rank={r.defense?.rank} total={r.teams} side={direction}/></span><span>{gameDate(r.game)}</span><span>W{r.game.week} · {r.outcome}</span>
      <span className="game-volume">{usageFields.map(([key,label])=><span key={key}><b>{r.game.usage?.[key] ?? '—'}</b> {label.toLowerCase()}</span>)}<span>Off. Snaps <b>{formatRate(r.game.usage?.offenseSnapRate)}</b></span></span>
    </button>)}</div></div>
    {active?<section className="bar-report log-body" aria-label="Selected Game Details"><h3>{playerName} · {active.game.team} {active.game.venue==='A'?'@':'vs.'} {active.game.opponent}</h3><p className="margin-detail"><b data-result={active.outcome}>{active.outcome}</b> · {gameDate(active.game)} · Week {active.game.week} · {active.value} {info.unit} {line!=null && ' · '}{line==null?'':active.margin===0?'Exactly on the line':Math.abs(active.margin).toFixed(1)+' '+(active.value>line?'above':'below')+' the line'}{metric==='scrimmageYards' && <> · {active.game.stats.rushingYards ?? 0} rushing + {active.game.stats.receivingYards ?? 0} receiving</>}</p><PlayerBoxScore game={active.game} position={playerPosition} metric={metric}/>{Array.isArray(active.game.scoringChances) && <p>Red-Zone Carries: {active.game.scoringChances[0]} · Red-Zone Targets: {active.game.scoringChances[1]} · Carries From the 5 or Closer: {active.game.scoringChances[2]}</p>}<p className="defense-note">{active.defense?<><b>{active.game.opponent} DEF <DefenseRank rank={active.defense.rank} total={active.teams} side={direction}/></b> · {formatNumber(active.defense.average)} {info.unit} per game allowed to {playerPosition}s across {active.defense.games} prior games.</>:'Pregame defense rank unavailable for this week.'}</p></section>:<p className="bar-hint">Select A Game Bar For Player Stats.</p>}</>;
}

function ControlLabel({children}) {
  return <b><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7h5m5 0h8M3 17h10m5 0h3"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/></svg>{children}</b>;
}

function LineControl({line,setLine,resetLine,manual,manualLabel,quote,median,games,metric,direction}) {
  const [draft,setDraft]=useState(null);
  const savedAt=Date.parse(quote?.updated);
  const stamp=Number.isFinite(savedAt)?new Date(savedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}):'';
  const source=quote?'DraftKings · '+quote.point+(stamp?' · '+stamp:''):'No Sportsbook Line Data';
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
    <summary className="chart-disclosure">
      <ControlLabel>Prop Line</ControlLabel>
      <span className="line-selection">{line!=null && <strong>{direction} {line}</strong>}
        {manual?manualLabel:quote?'DraftKings':'No Sportsbook Line'}
      </span>
    </summary>
    <div className="chart-line-panel">
    <div className="chart-line-options">
    {options.length>0 && <h3>Compare Lines</h3>}
    {options.length>0 && <div className="line-compare" role="group" aria-label="Compare research lines">{options.map(value=>{
      const summary=summarize(games,metric,value,direction);
      const saved=quote?.point===value;
      return <button type="button" key={value} aria-pressed={line===value} onClick={()=>{setDraft(null);if(saved)resetLine();else setLine(value)}}>
        <strong>{value}{saved && <sup> DK</sup>}</strong><span style={rateStyle(summary.rate)}>{summary.hits}/{summary.total} {direction}</span>
      </button>;
    })}</div>}
    <small className="line-source">{source}</small>
    </div><div className="line-exact"><label htmlFor="chart-line">Exact Line</label>
    <div className="line-stepper"><button aria-label="Decrease line by half a point" disabled={line==null || line<=0} onClick={()=>step(-.5)}>−</button>
    <input id="chart-line" aria-label="Exact prop line" type="text" inputMode="decimal" placeholder="Line" value={draft ?? line ?? ''} onFocus={e=>e.target.select()} onChange={e=>setDraft(e.target.value)} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>
    <button aria-label="Increase line by half a point" disabled={line==null} onClick={()=>step(.5)}>+</button></div>
    <div className="line-actions">
    {Number.isFinite(median) && median>=0 && median!==line && <button className="line-reset" onClick={()=>{setDraft(null);setLine(median)}}>Use median · {median}</button>}
    {manual && <button className="line-reset" onClick={()=>{setDraft(null);resetLine()}}>{quote?'Use DK '+quote.point:'Clear custom line'}</button>}
    </div></div></div></details>;
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
  const redZone=game.context?.redZoneDefense?.[game.opponent];
  const outcomes=Number.isFinite(redZone?.passingTDs) && redZone.trips>0 ? [
    ['Rush TD', redZone.rushingTDs, '#925cf5'], ['Pass TD', redZone.passingTDs, '#d2b2ff'],
    ['Other TD', redZone.otherTDs, '#f4c784'], ['No TD', redZone.trips-redZone.touchdowns, '#796c83']
  ].filter(([label,n])=>label!=='Other TD' || n>0) : [];
  const against=history.filter(g=>g.opponent===game.opponent);
  const headToHead=summarize(against,metric,line,direction);
  const unit=chartMarkets[metric].unit;
  return <section className="lab-block matchup-lab"><h2>Matchup research</h2>
    <h3><TeamLogo team={game.away}/>{game.away} at {game.home}<TeamLogo team={game.home}/></h3>
    <KickoffConditions game={game}/>
    <dl><div><dt>{game.opponent} vs. {player.position}s</dt><dd><DefenseRank rank={defense?.rank} total={defenses.length} side={direction}/></dd></div>
      <div><dt>Position group allowed per game</dt><dd data-vs-league={leagueComparison(defense?.average,leagueMean,direction)}>{formatNumber(defense?.average)} {unit}</dd></div>
      <div><dt>League average allowed to {player.position}s</dt><dd>{formatNumber(leagueMean)} {unit}</dd></div>
      <div><dt>Player vs. {game.opponent} in selected history</dt><dd>{against.length?<>{line!=null && <span style={rateStyle(headToHead.rate)}>{headToHead.hits}/{against.length} Hits · </span>}{formatNumber(headToHead.average)} {unit} Avg</>:'No Meetings'}</dd></div></dl>
    <p className="method">{game.season} · Position Totals Compared With The League Average.{defense?' Based on '+defense.games+' opponent games.':''}</p>
    <h3>{game.opponent} Red Zone Defense</h3>
    <dl><div><dt>Touchdown Rate Allowed</dt><dd>{redZone?.trips ? (100*redZone.touchdowns/redZone.trips).toFixed(1)+'%' : '—'}</dd></div>
    </dl>
    {outcomes.length>0 && <div className="zone-split">
      <div className="zone-track" aria-hidden="true">{outcomes.map(([label,count,color])=><span key={label} style={{flex:count,background:color}}/>)}</div>
      <ul>{outcomes.map(([label,count,color])=><li key={label}><i style={{background:color}}/>{label} <strong>{count}</strong> · {(100*count/redZone.trips).toFixed(1)}%</li>)}</ul>
    </div>}
    <p className="method">{redZone ? redZone.touchdowns+' TDs Allowed On '+redZone.trips+' Red Zone Trips · '+redZone.games+' Games With Play Data Before Week '+game.week : 'No Earlier Red Zone Play Data Available.'}</p>
    <h3>Last Three Games Against {player.position}s</h3>
    {prior.length?<div className="history-scroll"><table><thead><tr><th>Game</th><th>Offense</th><th>Group Total</th><th>Leading Player</th></tr></thead><tbody>
      {prior.map(({game:g,total,leader})=><tr key={g.gameId}><td>{gameDate(g)} · W{g.week}</td><td><span className="log-table-team"><TeamLogo team={g.team}/>{g.team}</span></td><td data-vs-league={leagueComparison(total,leagueMean,direction)}>{total} {unit}</td><td>{leader && leader.value>0?leader.name+' · '+leader.value+' '+unit:'—'}</td></tr>)}
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
  scrimmageYards:['Rushing + Receiving Yards',g=>g.stats.scrimmageYards],
  scoredTDs:['TDs Scored',g=>g.stats.scoredTDs],
};
const passing=['attempts','passingYards','passingTDs'];
const rushing=['rushingAttempts','rushingYards'];
const receiving=['receptions','targets','receivingYards'];

function statOrder(position){
  const skill=[...rushing,...receiving,'scrimmageYards','scoredTDs'];
  return position==='QB'?[...passing,...skill]:[...skill,...passing];
}

function logColumns(position,games,metric){
  return statOrder(position).filter(key=>{
    if(key===metric || key==='scoredTDs')return true;
    if(key==='scrimmageYards')return false;
    if(passing.includes(key) && position==='QB')return true;
    if(rushing.includes(key) && ['QB','RB','FB'].includes(position))return true;
    if(receiving.includes(key) && ['WR','TE','RB','FB'].includes(position))return true;
    const group=rushing.includes(key)?rushing:receiving.includes(key)?receiving:passing;
    return games.some(g=>group.some(k=>Boolean(logFields[k][1](g))));
  });
}

function GameLog({player,currentSeason,line,direction,metric}) {
  const [year,setYear]=useState(String(currentSeason));
  const years=[...new Set([currentSeason,...player.games.map(g=>g.season)])].sort((a,b)=>b-a);
  const games=getPlayerGames(player,year);

  const market=chartMarkets[metric];
  const columns=logColumns(player.position,games,metric);
  const ordered=[...games].reverse();
  return <section className="lab-block player-log" aria-label="Game Log">
    <h2>Game Log</h2>
    <ChartSelect label="Game Log Year" value={year} onChange={setYear}>
      {years.map(y=><option key={y} value={y}>{y}</option>)}
    </ChartSelect>
    <p>{games.length} {games.length===1?'Game':'Games'} · Home And Away · {market.label} · {line==null?'No Line Selected':(direction==='over'?'Over ':'Under ')+line} · Newest First</p>
    {ordered.length>0 && <div className="history-scroll log-table" tabIndex="0" role="region" aria-label="Game Log Statistics"><table><thead><tr>
      <th>Week</th><th>Opponent</th>{columns.map(key=><th key={key}>{logFields[key][0]}</th>)}<th>Result</th><th>Date</th>
    </tr></thead><tbody>{ordered.map(g=>{
      const v=g.stats[metric] ?? 0;
      const {margin,outcome}=lineResult(v,line,direction);
      return <tr key={g.gameId}><th scope="row">{g.week}</th><td><span className="log-table-team"><TeamLogo team={g.opponent}/>{g.venue==='A'?'@':'vs.'} {g.opponent}</span></td>
        {columns.map(key=><td key={key}>{key===metric?<b>{v}</b>:logFields[key][1](g) ?? '—'}</td>)}
        <td><span className="log-outcome" data-result={outcome}>{outcome}{margin!=null && ' '+marginNumber.format(margin)}</span></td>
        <td>{gameDate(g)}</td></tr>;
    })}</tbody></table></div>}
    {!games.length && <p>No Recorded Games For This Year.</p>}
  </section>;
}

export default function NflCharts({players,seasons,slate,venue,onVenue,resetLine,nextFixture,player,roster,onPlayer,season,markets,metric,onMetric,line,setLine,quote,manual,manualLabel,direction,setDirection,windowSize,setWindowSize,upcoming,defenses,loading,error}) {
  const [filtersOpen,setFiltersOpen]=useState(false);
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
  return <main className="chart-lab" style={{'--club':teamColor(player?.team) || '#be98ed'}}>
    <NflToolHeader active="charts"/>
    <h1>Player <em>Charts</em></h1>
    {!loading && !error && !player && <ChartSlate slate={slate}/>}
    {loading || error || !player?<p>{loading?'Loading player charts…':error || 'No player history available.'}</p>:<>
    <div className="lab-controls primary-controls">
      <ChartSelect label="Player" value={player.id} onChange={onPlayer}>{roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}</ChartSelect>
      <ChartSelect label="Market" value={metric} onChange={onMetric}>{markets.map(m=><option key={m} value={m}>{chartMarkets[m].label}</option>)}</ChartSelect>
    </div>
    <button type="button" className="filter-toggle chart-disclosure" aria-controls="chart-filters" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}>
      <ControlLabel>Filters</ControlLabel>
      <span>Week {slate.week} · {slate.team || (slate.game ? slate.game.away+' @ '+slate.game.home : 'All Teams')} · {venue==='ALL'?'All Games':venue==='H'?'Home':'Away'} · {windowSize==='season'?'Full History':'Last '+windowSize}</span>
    </button>
    <div className="extra-filters" id="chart-filters" data-open={filtersOpen}>
      <ChartSlate slate={slate}/>
      <div className="lab-controls secondary-controls">
      <ChartSelect label="Side" value={direction} onChange={setDirection}><option value="over">Over</option><option value="under">Under</option></ChartSelect>
      <ChartSelect label="Venue" value={venue} onChange={onVenue}><option value="ALL">All games</option><option value="H">Home</option><option value="A">Away</option></ChartSelect>
      <ChartSelect label="History season" value={historySeason} onChange={setChosenSeason}>{[...seasons].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}<option value="ALL">All seasons</option></ChartSelect>
      <ChartSelect label="Window" value={windowSize} onChange={setWindowSize}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full history</option></ChartSelect>
    </div>
    </div>
    <LineControl key={player.id+metric+(upcoming?.id || '')} line={line} setLine={setLine} resetLine={resetLine} manual={manual} manualLabel={manualLabel} quote={quote} median={current.median} games={displayed} metric={metric} direction={direction}/>
    <section className="lab-player">
      <div className="player-identity"><PlayerPhoto key={player.id} large id={player.id} name={player.name} url={player.photo}/>
        <div><small>{season} · {player.team} · {player.position}</small><h2>{player.name}</h2><div className="player-prop">
          <strong>{line==null?'No Line Selected':direction+' '+line}</strong><span>{chartMarkets[metric].label}</span>
          {line!=null && <small>{manual?manualLabel: 'DraftKings'}</small>}
          {upcoming && <small className="prop-matchup">Prop Matchup · Week {upcoming.week} · {upcoming.venue==='Away'?'at':'vs.'} {upcoming.opponent}</small>}
          {!(manual && manualLabel==='Player Average') && quote && line===quote.point && <div className="prop-prices" aria-label="DraftKings odds">
            {['over','under'].map(side=><span key={side} data-selected={side===direction}>{side} <b>{priceText(quote[side])}</b></span>)}
          </div>}
        </div><div className="player-next">{nextFixture?<><TeamLogo team={nextFixture.opponent}/><span><b>Next game</b> · {player.team} {nextFixture.venue==='Away'?'at':'vs.'} {nextFixture.opponent}<br/>{new Date(nextFixture.kickoff).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',...(nextFixture.timeKnown===false?{}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})})}{nextFixture.timeKnown===false?' · Time TBD':''}</span></>:<span>No upcoming game scheduled</span>}</div></div>
      </div>
      <div className="player-numbers">
        <div><small>Median</small><b>{formatNumber(current.median)} <small>{chartMarkets[metric].unit}</small></b></div>
        <div><small>Hit Rate</small>{line==null?<button type="button" onClick={()=>{const input=document.getElementById('chart-line');input.closest('details').open=true;input.focus()}}>Set Custom Line</button>:<><b style={rateStyle(current.rate)}>{formatRate(current.rate)}</b><small>{current.hits} Hits · {current.total-current.hits-pushes} Misses · {pushes} Pushes</small></>}</div>
        <div><small>Games Shown</small><b>{displayed.length}</b></div>
      </div>

    </section>
    <section className="lab-block"><h2>Game By Game</h2>
      <GameChart windowSize={windowSize} key={player.id} playerName={player.name} players={players} playerPosition={player.position} games={displayed} metric={metric} line={line} direction={direction}/></section>
    <MatchResearch players={players} game={upcoming} player={player} metric={metric} line={line} direction={direction} history={splitGames} defenses={defenses}/>
    <section className="lab-block"><h2>Production &amp; workload</h2><dl>
      <div><dt>Average / median</dt><dd>{formatNumber(current.average)} / {formatNumber(current.median)} {chartMarkets[metric].unit}</dd></div>
      <div><dt>{usage.label} per game</dt><dd>{formatNumber(meanUsage)}</dd></div>
      <div><dt>{usage.label} · last {recentUsage.length} recorded</dt><dd>{recentUsage.length?formatNumber(recentUsage.reduce((a,b)=>a+b,0)/recentUsage.length):'—'} per game</dd></div>
      {['H','A'].map(v=>{const s=summarize(splitGames.filter(g=>g.venue===v),metric,line,direction);return <div key={v}><dt>Selected history · {v==='H'?'home':'away'} hits</dt><dd style={line==null?undefined:rateStyle(s.rate)}>{line==null?'—':s.hits+'/'+s.total+' · '+formatRate(s.rate)}</dd></div>})}
    </dl><WorkloadUsage players={players} games={displayed} position={player.position}/></section>
    <GameLog key={player.id} player={player} currentSeason={Math.max(...seasons)} line={line} direction={direction} metric={metric}/>
    </>}
  </main>;
}
