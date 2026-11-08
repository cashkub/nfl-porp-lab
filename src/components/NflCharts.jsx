import React,{useState} from 'react';
import {METRICS,isHit,summarize,formatNumber,formatRate} from '../lib/stats.js';
import {priceText,usageFor} from '../lib/bookLine.js';
import {teamColor} from '../lib/teamColors.js';
import {ChartSlate} from './ChartSlate.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflCharts.css';

export const chartMarkets={...METRICS,scrimmageYards:{label:'Rushing + Receiving Yards',unit:'yds',defaultLine:69.5}};

function TeamLogo({team}) {
  const normalized=({LA:'LAR',WSH:'WAS',JAC:'JAX'})[team] || team;
  const code=normalized==='WAS'?'wsh':normalized?.toLowerCase();
  return code?<img key={code} className="chart-logo" alt="" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>:null;
}

function GameChart({games,metric,line,direction}) {
  const [selected,setSelected]=useState('');
  const info=chartMarkets[metric];
  const volume=usageFor(metric);
  const usageFields=metric==='scrimmageYards' || metric==='scoredTDs'?[['carries','Carries'],['targets','Targets']]:[[volume.key,volume.label]];
  const rows=games.map(game=>{
    const value=game.stats[metric] ?? 0;
    const margin=(value-line)*(direction==='over'?1:-1);
    return {game,value,margin,outcome:line==null?'Unrated':margin>0?'Hit':margin<0?'Miss':'Push'};
  });
  const low=Math.min(0,...rows.map(r=>r.value));
  const high=Math.max(1,line,...rows.map(r=>r.value));
  const position=v=>8+75*(v-low)/(high-low);
  const active=rows.find(r=>r.game.gameId===selected) || rows.at(-1);
  if(!active)return <p>No recorded games match this venue and window.</p>;
  return <><div className="plot-heading"><span>{info.label}</span>{line!=null && <b>{direction} {line} · dashed line</b>}</div>
    <div className="margin-scroll"><div className="margin-bars" style={{'--count':rows.length,'--target':position(line)+'%'}}>
    {rows.map(r=><button key={r.game.gameId} type="button" data-result={r.outcome} aria-pressed={r===active}
      aria-label={'Week '+r.game.week+' against '+r.game.opponent+', '+r.value+' '+info.unit+', '+r.outcome}
      onClick={()=>setSelected(r.game.gameId)}>
      <span className="bar-space"><i style={{bottom:Math.min(position(0),position(r.value))+'%',height:Math.max(1,Math.abs(position(r.value)-position(0)))+'%'}}/>
        <strong style={{bottom:Math.max(position(0),position(r.value))+'%'}}>{r.value}</strong></span>
      <TeamLogo team={r.game.opponent}/><b>{r.game.venue==='A'?'@ ':'vs '}{r.game.opponent}</b><span>W{r.game.week} · {r.outcome}</span>
      <span className="game-volume">{usageFields.map(([key,label])=><span key={key}><b>{r.game.usage?.[key] ?? '—'}</b> {label.toLowerCase()}</span>)}</span>
    </button>)}</div></div>
    <p className="margin-detail"><b data-result={active.outcome}>{active.outcome}</b> · Week {active.game.week} · {active.value} {info.unit} {line!=null && ' · '}{line==null?'':active.margin===0?'Exactly on the line':Math.abs(active.margin).toFixed(1)+' '+(active.value>line?'above':'below')+' the line'}{metric==='scrimmageYards' && <> · {active.game.stats.rushingYards ?? 0} rushing + {active.game.stats.receivingYards ?? 0} receiving</>}</p></>;
}

function LineControl({line,setLine,resetLine,manual,quote,median}) {
  const [draft,setDraft]=useState(null);
  const savedAt=Date.parse(quote?.updated);
  const stamp=Number.isFinite(savedAt)?new Date(savedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}):'';
  const source=quote?'DraftKings snapshot · '+quote.point+(stamp?' · '+stamp:''):'No sportsbook line data';
  function step(delta){setDraft(null);setLine(Math.max(0,Math.round((line+delta)*100)/100))}
  function apply(){
    const value=Number(draft);
    if(draft!=null && draft.trim() && Number.isFinite(value) && value>=0)setLine(value);
    setDraft(null);
  }
  return <div className="line-control"><div><label htmlFor="chart-line">Prop line</label><small>{source}{manual?' · Custom line active':''}</small></div>
    <div className="line-stepper"><button aria-label="Decrease line by half a point" disabled={line==null || line<=0} onClick={()=>step(-.5)}>−</button>
    <input id="chart-line" type="text" inputMode="decimal" placeholder="Line" value={draft ?? line ?? ''} onFocus={e=>e.target.select()} onChange={e=>setDraft(e.target.value)} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>
    <button aria-label="Increase line by half a point" disabled={line==null} onClick={()=>step(.5)}>+</button></div>
    {Number.isFinite(median) && median>=0 && median!==line && <button className="line-reset" onClick={()=>{setDraft(null);setLine(median)}}>Use median · {median}</button>}
    {manual && <button className="line-reset" onClick={()=>{setDraft(null);resetLine()}}>{quote?'Use DK '+quote.point:'Clear custom line'}</button>}
  </div>;
}

function MatchResearch({game,player,metric,line,direction,history,defenses}) {
  if(!game)return <section className="lab-block"><h2>Matchup research</h2><p>No matchup in the selected week.</p></section>;
  const defense=defenses.find(d=>d.team===game.opponent);
  const totalGames=defenses.reduce((n,row)=>n+row.games,0);
  const leagueMean=totalGames?defenses.reduce((n,row)=>n+row.total,0)/totalGames:null;
  const against=history.filter(g=>g.opponent===game.opponent);
  const headToHead=summarize(against,metric,line,direction);
  const unit=chartMarkets[metric].unit;
  return <section className="lab-block matchup-lab"><h2>Matchup research</h2>
    <h3><TeamLogo team={game.away}/>{game.away} at {game.home}<TeamLogo team={game.home}/></h3>
    <p>Week {game.week} · {game.context?.stadium || game.venue}</p>
    <dl><div><dt>{game.opponent} vs. {player.position}s</dt><dd>{defense?'#'+defense.rank+' of '+defenses.length:'—'}</dd></div>
      <div><dt>Position group allowed per game</dt><dd>{formatNumber(defense?.average)} {unit}</dd></div>
      <div><dt>League average allowed to {player.position}s</dt><dd>{formatNumber(leagueMean)} {unit}</dd></div>
      <div><dt>Player vs. {game.opponent} this season</dt><dd>{against.length?(line==null?'':headToHead.hits+'/'+against.length+' hits · ')+formatNumber(headToHead.average)+' '+unit+' avg':'No meetings'}</dd></div></dl>
    <p className="method">Rank 1 allows the most {chartMarkets[metric].label.toLowerCase()} to the entire position group.{defense?' Based on '+defense.games+' opponent games.':''}</p>
  </section>;
}

function GameLog({games,line,direction,metric}) {
  return <section className="lab-block"><h2>Game log</h2><p>Season games · selected venue · newest first</p>
    <div className="history-scroll"><table><thead><tr>{['Week','Opponent',chartMarkets[metric].label,'Rush yds','Rec yds','Att','Carries','Targets','Result'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{[...games].reverse().map(g=>{
        const value=g.stats[metric] ?? 0;
        const result=line==null?'—':value===line?'Push':isHit(value,line,direction)?'Hit':'Miss';
        return <tr key={g.gameId}><td>{g.week}</td><td>{g.venue==='A'?'@':'vs.'} {g.opponent}</td><td><b>{value}</b></td><td>{g.stats.rushingYards ?? '—'}</td><td>{g.stats.receivingYards ?? '—'}</td><td>{g.usage?.attempts ?? '—'}</td><td>{g.usage?.carries ?? '—'}</td><td>{g.usage?.targets ?? '—'}</td><td data-result={result}>{result}</td></tr>;
      })}</tbody></table></div>{!games.length && <p>No games at this venue.</p>}</section>;
}

export default function NflCharts({slate,venue,onVenue,resetLine,nextFixture,splitGames,player,roster,onPlayer,season,markets,metric,onMetric,line,setLine,quote,manual,direction,setDirection,windowSize,setWindowSize,allGames,displayed,upcoming,defenses,loading,error}) {
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
      <label>Player<select value={player.id} onChange={e=>onPlayer(e.target.value)}>{roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}</select></label>
      <label>Market<select value={metric} onChange={e=>onMetric(e.target.value)}>{markets.map(m=><option key={m} value={m}>{chartMarkets[m].label}</option>)}</select></label>
      <label>Side<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      <label>Venue<select value={venue} onChange={e=>onVenue(e.target.value)}><option value="ALL">All games</option><option value="H">Home</option><option value="A">Away</option></select></label>
      <label>Window<select value={windowSize} onChange={e=>setWindowSize(e.target.value)}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Season</option></select></label>
    </div>
    <section className="lab-player"><div><PlayerPhoto key={player.id} large id={player.id} name={player.name} url={player.photo}/>
      <small>{season} · {player.team} · {player.position}</small><h2>{player.name}</h2><div className="player-next">{nextFixture?<><TeamLogo team={nextFixture.opponent}/><span><b>Next game</b> · {player.team} {nextFixture.venue==='Away'?'at':'vs.'} {nextFixture.opponent}<br/>{new Date(nextFixture.kickoff).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',...(nextFixture.timeKnown===false?{}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})})}{nextFixture.timeKnown===false?' · Time TBD':''}</span></>:<span>No upcoming game scheduled</span>}</div><p>{line==null?'No sportsbook line data':(direction==='over'?'Over ':'Under ')+line+' '+chartMarkets[metric].label.toLowerCase()+' · '+(manual?'Custom line':'DraftKings snapshot')}</p>
      {!manual && quote && <small>Over {priceText(quote.over)} · Under {priceText(quote.under)}</small>}</div>
      <div className="lab-rate">{line==null?<span>Enter a line for hit rates</span>:<><strong>{formatRate(current.rate)}</strong><span>{current.hits} hits in {current.total} games</span><small>{current.total-current.hits-pushes} misses · {pushes} pushes</small></>}</div>
    </section>
    <section className="lab-block"><h2>Game by game</h2><LineControl key={player.id+metric+(upcoming?.id || '')} line={line} setLine={setLine} resetLine={resetLine} manual={manual} quote={quote} median={current.median}/>
      <GameChart games={displayed} metric={metric} line={line} direction={direction}/></section>
    <MatchResearch game={upcoming} player={player} metric={metric} line={line} direction={direction} history={splitGames} defenses={defenses}/>
    <section className="lab-block"><h2>Production &amp; workload</h2><dl>
      <div><dt>Average / median</dt><dd>{formatNumber(current.average)} / {formatNumber(current.median)} {chartMarkets[metric].unit}</dd></div>
      <div><dt>{usage.label} per game</dt><dd>{formatNumber(meanUsage)}</dd></div>
      <div><dt>{usage.label} · last {recentUsage.length} recorded</dt><dd>{recentUsage.length?formatNumber(recentUsage.reduce((a,b)=>a+b,0)/recentUsage.length):'—'} per game</dd></div>
      {['H','A'].map(v=>{const s=summarize(splitGames.filter(g=>g.venue===v),metric,line,direction);return <div key={v}><dt>Season {v==='H'?'home':'away'} hits</dt><dd>{line==null?'—':s.hits+'/'+s.total+' · '+formatRate(s.rate)}</dd></div>})}
    </dl></section>
    <GameLog games={allGames} line={line} direction={direction} metric={metric}/>
    </>}
  </main>;
}
