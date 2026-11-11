import SortableTable from './SortableTable.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import React from 'react';
import {ArrowUpRight} from 'lucide-react';
import {projection} from '../lib/projection.js';
import {priceText} from '../lib/bookLine.js';
import HitRate,{DefenseRank,defenseRankStyle} from './HitRate.jsx';

const signed=n=>(n>0?'+':'')+n.toFixed(1);
const priorities=['out','doubtful','questionable','limited participation in practice','did not participate in practice','full participation in practice'];
function urgency(p){
  const i=priorities.indexOf((p.gameStatus || p.status || '').toLowerCase());
  return i<0?priorities.length:i;
}
export function InjuryReport({game}){
  return <details className="report-fold"><summary>Full injury report</summary>
    {[game.away,game.home].map(team=>{
      const players=[...(game.injuries?.[team] || [])].sort((a,b)=>urgency(a)-urgency(b)||a.name.localeCompare(b.name));
      return <section className="report-team" key={team}><h4>{team} <small>· {players.length} Listed</small></h4>
        {players.length?<ul>{players.map(p=><li key={p.id || p.name}><div><b>{p.name}</b> <small>{p.position}</small>
          {p.injury && <small className="report-sub">{p.injury}</small>}{p.gameStatus && p.practice && <small className="report-sub">{p.practice}</small>}</div>
          <div className="report-status"><span data-status={urgency(p)}>{p.gameStatus || p.status}</span>{p.date && <small className="report-sub">{String(p.date).slice(0,10)}</small>}{p.source && <small className="report-sub">{p.source.startsWith('https://')?'Team announcement':p.source}</small>}{p.deduction>0 && <small className="report-sub">−{p.deduction.toFixed(2)} pts</small>}</div></li>)}</ul>:<p>No weekly entries available.</p>}</section>;
    })}<a href="https://www.nfl.com/injuries/">Official NFL Injury Report ↗</a></details>;
}

export function MatchReport({game:g,away,home,college=false,names={}}){
  const model=projection(g,away,home,college);
  const label=t=>names[t] || t;
  const overallMargin=model?Number((model.overall[1]-model.overall[0]).toFixed(1)):0;
  const winner=overallMargin>0?g.home:overallMargin<0?g.away:null;
  let explanation='';
  if(model?.winner){
    const w=model.winner, other=w===model.a?model.h:model.a;
    const factors=[
      [w.rating.offense-other.rating.offense,'stronger opponent-adjusted scoring'],
      [other.rating.defense-w.rating.defense,'fewer opponent-adjusted points allowed'],
      [w.court-other.court,'home advantage'],
      [other.injuries-w.injuries,'a smaller injury deduction'],
      ...Object.keys(w.parts).map(k=>[(w.parts[k]||0)-(other.parts[k]||0),k.toLowerCase()])
    ].sort((a,b)=>b[0]-a[0]);
    explanation=label(w.team)+' gains the most from '+factors[0][1]+' (+'+factors[0][0].toFixed(1)+' points of margin).';
  }
  if(model?.blend){
    const weight=Math.round(100*model.blend.weight);
    const marketNote=<>The overall projection gives team data <span className="context-value">{100-weight}%</span> weight and the market spread and total <span className="context-value">{weight}%</span>.</>;
    explanation=<>{winner && winner===model.winner?.team?explanation+' ':winner?'The market adjustment shifts the projected margin toward '+label(winner)+'. ':''}{marketNote}</>;
  }
  return <>{model?<><p className="model-call"><small>Overall Pick</small><b>{winner?label(winner)+' by '+Math.abs(overallMargin).toFixed(1):'Projected Tie'}</b></p>
    <h4 className="report-heading">Projected Score</h4>
    <div className="score-pair">{[model.a,model.h].map((s,i)=><div key={s.team} data-winner={winner===s.team}><small>{label(s.team)}</small><strong>{model.overall[i].toFixed(1)}</strong></div>)}</div>
    <h4 className="report-heading">Why This Pick</h4>
    <p className="report-explanation">{explanation || 'The two projected scores are level at one decimal place.'}</p>
    {!college && model.a.injuries+model.h.injuries>0 && <p className="report-note">Confirmed absences reduce {g.away} by {model.a.injuries.toFixed(2)} and {g.home} by {model.h.injuries.toFixed(2)} points.</p>}
    {!college && <MarketComparison game={g} blend={model.blend}/>}
    {college && Math.min(away.games,home.games)<5 && <small>Early Season · {away.games} and {home.games} games in the sample.</small>}
    <details className="report-fold"><summary>Offense &amp; Defense Breakdown</summary>
      <SortableTable className="model-table" caption="How the Score Is Built" headers={['Points Per Game',label(g.away),label(g.home)]} rows={[
        ['Adjusted Offense',s=>s.rating.offense.toFixed(1)],
        ['Opposing Defense vs. Average',s=>signed(s.defense)],
        ['Venue Adjustment',s=>signed(s.court)],
        ...Object.keys({...model.a.parts,...model.h.parts}).map(k=>[k,s=>signed(s.parts[k]||0)]),
        ...(!college?[['Injury Adjustment',s=>signed(-s.injuries)]]:[]),
        ['Team Projection',s=>s.score.toFixed(1)]
      ]} values={([name,value])=>[name,Number(value(model.a)),Number(value(model.h))]} renderRow={([name,value])=><tr key={name}><th>{name}</th><td>{value(model.a)}</td><td>{value(model.h)}</td></tr>}/>
      <p className="report-note">Start with adjusted offense. Add how many points the opponent allows above or below the league average of {away.baseline.toFixed(1)}, then apply the listed adjustments. Figures are rounded for display.</p>
      {[model.a,model.h].map(s=><div className="team-history" key={s.team}><b>{label(s.team)} · {s.rating.games} Games</b><small>Adjusted points allowed {s.rating.defense.toFixed(1)} · Schedule strength {signed(s.rating.scheduleStrength)} pts versus average</small><small>Wins against {s.rating.wins.map(label).join(', ') || 'no opponents yet'}.</small></div>)}
    </details></>:<p>Projection Pending · {college?'Each team needs a completed game before the selected day.':'Each team needs three completed games.'}</p>}
    {!college && !model && <MarketComparison game={g}/>}
    {!college && model && g.context && <NflConditions game={g} model={model}/>}
    {!college && <InjuryReport game={g}/>}
  </>;
}

function MarketComparison({game,blend}){
  return <details className="report-fold"><summary>Sportsbook Lines &amp; Market Comparison</summary>
    <SortableTable className="model-table" headers={['Market',game.away,game.home]}
      rows={[['Moneyline',game.awayPrice,game.homePrice],['Spread',Number.isFinite(game.homeSpread)?-game.homeSpread:null,game.homeSpread],...(blend?[['Market-Informed Score',blend.away,blend.home]]:[])]}
      values={row=>row} renderRow={([label,away,home])=><tr key={label}><th>{label}</th>{[away,home].map((v,i)=><td key={i}>{label==='Market-Informed Score'?v.toFixed(1):priceText(v)}</td>)}</tr>}/>
    {blend && <p className="report-note">This score gives the market <span className="context-value">{(100*blend.weight).toFixed(1)}%</span> weight, fitted on 2024 games. This weighting is included in the overall pick.</p>}
  </details>;
}

function NflConditions({game,model}){
  const c=game.context,w=c.weather;
  return <><details className="report-fold"><summary>Quarterbacks, Efficiency &amp; Weather</summary>
    {[model.a,model.h].map(s=>{
      const p=s.profile;
      if(!p)return <p key={s.team}>{s.team} · Play-by-play unavailable.</p>;
      const inputs=p.inputs;
      return <section className="team-history" key={s.team}><b>{s.team} · {p.qb || 'QB Unavailable'}</b>
        <small>{'QB source: '+p.qbSource} · {p.rest ?? '—'} rest days</small>
        <small>Last {p.sample} games · Passing EPA/play {signed(inputs['Pass Offense'])} · Rushing EPA/play {signed(inputs['Run Offense'])} · Successful plays <HitRate rate={p.success}/></small>
        <small>Opponent allows {inputs['Pass Defense Faced'].toFixed(2)} EPA per dropback and {inputs['Run Defense Faced'].toFixed(2)} per rush. Expected possessions {inputs.Possessions.toFixed(1)}.</small>
        {p.backupKnown && <small>{s.swap?'Replacement used':'Alternate QB scenario'} · {p.backup} · {signed(p.backupDelta)} pts relative to {p.qb}. Scenario score: {s.team} {(s.score+(s.swap?0:p.backupDelta)).toFixed(1)}. Depth chart alternate · {p.backupPasses} tracked pass plays this season.</small>}</section>;
    })}
    <p>{c.stadium} · {c.roof} · {c.surface || 'Surface unavailable'}</p>
    <p>{w?<>{w.temp ?? '—'} °F · Wind {w.wind ?? '—'} mph · Rain chance <span className="context-value">{w.rain==null?'—':w.rain+'%'}</span>. Forecast for the kickoff hour, retrieved {new Date(w.asOf).toLocaleString()}. {['open','outdoors'].includes(c.roof)?'Wind above 8 mph and temperatures below 40°F enter the score estimate.':'Roof status unconfirmed. Outside weather has no score adjustment.'} <a href="https://open-meteo.com/">Open-Meteo</a></>:['closed','dome'].includes(c.roof)?'Enclosed venue · No outdoor weather adjustment.':'Kickoff forecast unavailable · No weather adjustment.'}</p>
    </details></>;
}

export function PickReport({number,name,playerId,photo,onOpen,side,line,metric,price,hits,total,average,rank,rankCount=32,results,reason,role,context}){
  return <><div className="pick-player"><span style={defenseRankStyle(number,9)}>#{number}</span><button className="board-player" onClick={onOpen}><PlayerPhoto id={playerId} name={name} url={photo}/>{name}</button></div>
    <p className="pick-line"><strong>{side==='over'?'Over':'Under'} {line} {metric}</strong><small>{price}</small></p>
    <dl className="pick-metrics"><div><dt>Hit Rate</dt><dd><HitRate rate={hits/total}/></dd></div><div><dt>Game Avg</dt><dd>{average.toFixed(1)}</dd></div><div><dt>Defense Rank</dt><dd><DefenseRank rank={rank} total={rankCount} side={side}/></dd></div></dl>
    <div className="pick-reason"><h4 className="report-heading">Why It Ranks</h4><p>{reason}</p></div>
    <details className="report-fold pick-evidence"><summary>Game History{role || context?' & Player Context':''}</summary>
    <small>{hits} of {total} Hit · Oldest First</small>
    <div className="pick-history">{results.map((v,i)=>{
      const outcome=v===line?'Push':(side==='over'?v>line:v<line)?'Hit':'Miss';
      return <span key={i} style={{'--bar-height':Math.max(4,Math.abs(v)/Math.max(1,...results.map(Math.abs))*26)+'px'}} data-outcome={outcome} title={outcome+' · '+v} aria-label={outcome+' · '+v}>{v}</span>;
    })}</div>{role && <p><b>Usage</b> {role}</p>}{context && <p><b>Matchup Context</b> {context}</p>}</details><button className="outline-button" onClick={onOpen}>Open Analyzer <ArrowUpRight size={16} aria-hidden="true"/></button></>;
}
