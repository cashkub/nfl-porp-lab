import React,{useState} from 'react';
import {METRICS,summarize,formatNumber,formatRate} from '../lib/stats.js';
import {priceText,usageFor} from '../lib/bookLine.js';
import {teamColor} from '../lib/teamColors.js';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflCharts.css';

function MarginChart({games,metric,line,direction}) {
  const [selected,setSelected]=useState('');
  const rows=games.map(game=>{
    const value=game.stats[metric] ?? 0;
    const margin=(value-line)*(direction==='over'?1:-1);
    return {game,value,margin,outcome:margin>0?'Hit':margin<0?'Miss':'Push'};
  });
  const range=Math.max(1,...rows.map(r=>Math.abs(r.margin)));
  const active=rows.find(r=>r.game.gameId===selected) || rows.at(-1);
  if(!active)return <p>No qualifying games in this window.</p>;
  return <><div className="margin-scroll"><div className="margin-bars" style={{'--count':rows.length}}>
    {rows.map(r=><button key={r.game.gameId} type="button" data-result={r.outcome} aria-pressed={r===active}
      aria-label={'Week '+r.game.week+' against '+r.game.opponent+', '+r.value+', '+r.outcome}
      onClick={()=>setSelected(r.game.gameId)}>
      <span className="bar-space"><i style={{height:Math.max(2,Math.abs(r.margin)/range*45)+'%'}}/></span>
      <span>W{r.game.week}</span></button>)}
  </div></div>
  <p className="margin-detail"><b data-result={active.outcome}>{active.outcome}</b> · Week {active.game.week} {active.game.venue==='H'?'vs.':'at'} {active.game.opponent} · {active.value} {METRICS[metric].unit} · {active.margin===0?'Exactly on the line':Math.abs(active.margin).toFixed(1)+' '+(active.value>line?'above':'below')+' the line'}</p></>;
}

export default function NflCharts({player,roster,onPlayer,season,markets,metric,onMetric,line,setLine,quote,manual,direction,setDirection,windowSize,setWindowSize,allGames,displayed,upcoming,defenses,loading,error}) {
  const [draft,setDraft]=useState(null);
  const context=[player?.id,metric].join('|');
  const current=summarize(displayed,metric,line,direction);
  const pushes=displayed.filter(g=>g.stats[metric]===line).length;
  const usage=usageFor(metric);
  const observedUsage=displayed.map(g=>g.usage?.[usage.key]).filter(Number.isFinite);
  const meanUsage=observedUsage.length ? observedUsage.reduce((sum,value)=>sum+value,0)/observedUsage.length : null;
  const rank=defenses.find(d=>d.team===upcoming?.opponent);
  return <main className="chart-lab" style={{'--club':teamColor(player?.team) || '#55cfff'}}>
    <header><a href="/preview/"><img alt="" src="/preview/assets/mark.svg"/> PropBets</a><a href="/preview/nfl/">← NFL Menu</a></header>
    <h1>Player <em>Charts</em></h1>
    {loading || error || !player?<p>{loading?'Loading player charts…':error || 'No player history available.'}</p>:<>
    <div className="lab-controls">
      <label>Player<select value={player.id} onChange={e=>onPlayer(e.target.value)}>{roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}</select></label>
      <label>Market<select value={metric} onChange={e=>onMetric(e.target.value)}>{markets.map(m=><option key={m} value={m}>{METRICS[m].label}</option>)}</select></label>
      <label>Side<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      <label>Line<input type="number" min="0" step="any" value={draft?.context===context?draft.value:line}
        onChange={e=>{const v=e.target.value;setDraft({context,value:v});if(v!=='' && Number.isFinite(Number(v)) && Number(v)>=0)setLine(Number(v))}}
        onBlur={()=>setDraft(null)}/></label>
      <label>Window<select value={windowSize} onChange={e=>setWindowSize(e.target.value)}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Season</option></select></label>
    </div>
    <section className="lab-player"><div><PlayerPhoto key={player.id} large id={player.id} name={player.name} url={player.photo}/>
      <small>{season} · {player.team} · {player.position}</small><h2>{player.name}</h2><p>{direction==='over'?'Over':'Under'} {line} {METRICS[metric].label.toLowerCase()} · {manual?'Custom line':quote?'DraftKings snapshot':'Research preset'}</p>
      {!manual && quote && <small>Over {priceText(quote.over)} · Under {priceText(quote.under)}</small>}</div>
      <div className="lab-rate"><strong>{formatRate(current.rate)}</strong><span>{current.hits} hits in {current.total} games</span><small>{current.total-current.hits-pushes} misses · {pushes} pushes</small></div>
    </section>
    <section className="lab-block"><h2>Margin to the line</h2><p>Above the center line is a hit. Tap a week for its result.</p>
      <MarginChart games={displayed} metric={metric} line={line} direction={direction}/></section>
    <div className="lab-splits"><section className="lab-block"><h2>Production &amp; workload</h2><dl>
      <div><dt>Average / median</dt><dd>{formatNumber(current.average)} / {formatNumber(current.median)} {METRICS[metric].unit}</dd></div>
      <div><dt>{usage.label} per game</dt><dd>{formatNumber(meanUsage)}</dd></div>
      {['H','A'].map(v=>{const s=summarize(allGames.filter(g=>g.venue===v),metric,line,direction);return <div key={v}><dt>Season {v==='H'?'home':'away'} hits</dt><dd>{s.hits}/{s.total} · {formatRate(s.rate)}</dd></div>})}
    </dl></section><section className="lab-block"><h2>Next matchup</h2>{upcoming?<><h3>{player.team} {upcoming.venue==='Away'?'at':'vs.'} {upcoming.opponent}</h3><p>{upcoming.venue} · {new Date(upcoming.kickoff).toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric'})}</p>{rank && <p>{upcoming.opponent} allows <b>{rank.average.toFixed(1)} {METRICS[metric].unit}</b> per game to the {player.position} position group (rank #{rank.rank}, most allowed first).</p>}</>:<p>No upcoming matchup on the schedule.</p>}</section></div>
    </>}
  </main>;
}
