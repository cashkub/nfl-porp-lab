import React from 'react';
import {projection} from '../lib/projection.js';
import {priceText} from '../lib/bookLine.js';
import HitRate from './HitRate.jsx';

const signed=n=>(n>0?'+':'')+n.toFixed(1);
const priorities=['out','doubtful','questionable','limited participation in practice','did not participate in practice','full participation in practice'];
function urgency(p){
  const i=priorities.indexOf((p.gameStatus || p.status || '').toLowerCase());
  return i<0?priorities.length:i;
}
function InjuryReport({game}){
  return <details className="report-fold"><summary>Injury Report</summary>
    {[game.away,game.home].map(team=>{
      const players=[...(game.injuries?.[team] || [])].sort((a,b)=>urgency(a)-urgency(b)||a.name.localeCompare(b.name));
      return <section className="report-team" key={team}><h4>{team} <small>· {players.length} Listed</small></h4>
        {players.length?<ul>{players.map(p=><li key={p.id || p.name}><div><b>{p.name}</b> <small>{p.position}</small>
          {p.injury && <small className="report-sub">{p.injury}</small>}{p.gameStatus && p.practice && <small className="report-sub">{p.practice}</small>}</div>
          <div className="report-status"><span data-status={urgency(p)}>{p.gameStatus || p.status}</span>{p.deduction>0 && <small className="report-sub">−{p.deduction.toFixed(2)} pts</small>}</div></li>)}</ul>:<p>No weekly entries available.</p>}</section>;
    })}<a href="https://www.nfl.com/injuries/">Official NFL Injury Report ↗</a></details>;
}

export function MatchReport({game:g,away,home,college=false,names={}}){
  const model=projection(g,away,home,college);
  const label=t=>names[t] || t;
  let explanation='';
  if(model?.winner){
    const w=model.winner, other=w===model.a?model.h:model.a;
    const factors=[
      [w.rating.offense-other.rating.offense,'stronger opponent-adjusted scoring'],
      [other.rating.defense-w.rating.defense,'fewer opponent-adjusted points allowed'],
      [w.court-other.court,'home advantage'],
      [other.injuries-w.injuries,'a smaller injury deduction']
    ].sort((a,b)=>b[0]-a[0]);
    explanation=label(w.team)+' gains the most from '+factors[0][1]+' (+'+factors[0][0].toFixed(1)+' points of margin).';
  }
  return <>{model?<><div className="score-pair">{[model.a,model.h].map(s=><div key={s.team}><small>{label(s.team)}</small><strong>{s.score.toFixed(1)}</strong></div>)}</div>
    <p className="model-call"><small>Model Pick</small><b>{model.winner?label(model.winner.team)+' by '+Math.abs(model.margin).toFixed(1):'Projected Tie'}</b></p>
    <p>{explanation || 'The two projected scores are level at one decimal place.'}</p>
    {!college && model.a.injuries+model.h.injuries>0 && <p className="report-note">Confirmed absences reduce {g.away} by {model.a.injuries.toFixed(2)} and {g.home} by {model.h.injuries.toFixed(2)} points.</p>}
    {college && Math.min(away.games,home.games)<5 && <small>Early Season · {away.games} and {home.games} games in the sample.</small>}
    <details className="report-fold"><summary>Offense &amp; Defense Breakdown</summary>
      <table className="model-table"><caption>How the Score Is Built</caption><thead><tr><th>Points Per Game</th><th>{label(g.away)}</th><th>{label(g.home)}</th></tr></thead><tbody>
      {[
        ['Adjusted Offense',s=>s.rating.offense.toFixed(1)],
        ['Opposing Defense vs. Average',s=>signed(s.defense)],
        ['Venue Adjustment',s=>signed(s.court)],
        ...(!college?[['Injury Adjustment',s=>signed(-s.injuries)]]:[]),
        ['Projected Score',s=>s.score.toFixed(1)]
      ].map(([name,value])=><tr key={name}><th>{name}</th><td>{value(model.a)}</td><td>{value(model.h)}</td></tr>)}</tbody></table>
      <p className="report-note">Start with adjusted offense. Add how many points the opponent allows above or below the league average of {away.baseline.toFixed(1)}, then apply the listed adjustments. Figures are rounded for display.</p>
      {[model.a,model.h].map(s=><div className="team-history" key={s.team}><b>{label(s.team)} · {s.rating.games} Games</b><small>Adjusted points allowed {s.rating.defense.toFixed(1)} · Schedule strength {signed(s.rating.scheduleStrength)} pts versus average</small><small>Wins against {s.rating.wins.map(label).join(', ') || 'no opponents yet'}.</small></div>)}
    </details></>:<p>Projection Pending · {college?'Each team needs a completed game before the selected day.':'Each team needs three completed games.'}</p>}
    {!college && <><p className="market-line">Moneyline · {g.away} {priceText(g.awayPrice)} / {g.home} {priceText(g.homePrice)}<br/>Market Spread · {g.home} {priceText(g.homeSpread)}</p><InjuryReport game={g}/></>}
  </>;
}

export function PickReport({number,name,onOpen,side,line,metric,price,hits,total,average,rank,results,reason}){
  return <><div className="pick-player"><span>#{number}</span><button className="board-player" onClick={onOpen}>{name}</button></div>
    <p className="pick-line"><strong>{side==='over'?'Over':'Under'} {line} {metric}</strong><small>{price}</small></p>
    <dl className="pick-metrics"><div><dt>Hit Rate</dt><dd><HitRate rate={hits/total}/></dd></div><div><dt>Game Avg</dt><dd>{average.toFixed(1)}</dd></div><div><dt title="#1 allows the most">Defense Rank</dt><dd>{rank?'#'+rank:'—'}</dd></div></dl>
    <small>Recent Games · {hits} of {total} Hit · Oldest First</small>
    <div className="pick-history">{results.map((v,i)=>{
      const outcome=v===line?'Push':(side==='over'?v>line:v<line)?'Hit':'Miss';
      return <span key={i} data-outcome={outcome} title={outcome+' · '+v} aria-label={outcome+' · '+v}>{v}</span>;
    })}</div><p className="pick-reason"><b>Why It Ranks</b>{reason}</p><button className="outline-button" onClick={onOpen}>Open Analyzer →</button></>;
}
