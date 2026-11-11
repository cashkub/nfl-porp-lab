import React from 'react';
import {priceText} from '../lib/bookLine.js';
import PlayerPhoto from './PlayerPhoto.jsx';

const number=n=>Number.isFinite(n)?String(Number(n.toFixed(1))):'—';
const teamPositions={QB:'quarterbacks',RB:'running backs',WR:'wide receivers',TE:'tight ends'};

function Price({row}){
  const q=row.line;
  return <><strong>{q?.anytime?'Yes':number(q?.point??row.averageLine)}</strong>
    <small>{q?(q.anytime?priceText(q.over):'O '+priceText(q.over)+' / U '+priceText(q.under)):'Player average'}</small>
    {q?.updated&&<small>Updated {new Date(q.updated).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small>}</>;
}
function Projection({row}){
  if(!Number.isFinite(row.estimated))return <small>{row.note||'Projection unavailable'}</small>;
  return <><strong>{number(row.estimated)}{row.line?.anytime?'%':''}</strong>
    {row.line?.anytime&&<small>Chance to score</small>}{row.note&&<small>{row.note}</small>}</>;
}
function Player({row}){
  return <span className="prop-identity"><PlayerPhoto id={row.p.id} name={row.p.name} url={row.p.photo}/>
    <span><strong>{row.p.name}</strong><small>{[row.team,row.p.position,row.status].filter(Boolean).join(' · ')}</small></span></span>;
}
function Role({row}){
  return <>{row.usageLabel?number(row.usageAvg)+' '+row.usageLabel:'—'}{Number.isFinite(row.share)&&<small>{Math.round(row.share*100)}% average share</small>}</>;
}
function Defense({row}){
  if(!row.defense)return '—';
  const rank=row.defense.rank;
  const tone=rank<=10?'favorable':rank>=23?'tough':'average';
  return <span className={'prop-defense '+tone}><b>{row.opponent} · #{rank} in {row.label.toLowerCase()} allowed</b>
    <small>{number(row.defense.average)} per game vs {teamPositions[row.p.position]||row.p.position} · {row.defense.games} games</small></span>;
}
function Charts({row,onOpen,game}){
  return <button type="button" className="nfl-chart-link" disabled={row.chartAvailable===false}
    aria-label={'Open charts for '+row.p.name} onClick={()=>onOpen?.(row.p,{metric:row.metric,point:row.line?.point??row.averageLine,
      source:row.line?'DraftKings':'Player Average'},'over',game)}>Charts ↗</button>;
}

export default function MatchupProps({rows,game,onOpen}){
  const key=r=>[r.p.name,r.metric,r.line?.point,r.line?.anytime].join(':');
  if(!rows.length)return <p className="nfl-empty-state">No players match these filters.</p>;
  return <>
    <div className="matchup-props-desktop"><table><thead><tr>{['Player','Market','Prop line','Model projection','Last 5 avg','Season avg','Role / share','Defense','Chart'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r=><tr key={key(r)}><td><Player row={r}/></td><td>{r.label}</td><td><Price row={r}/></td><td><Projection row={r}/></td>
        <td>{number(r.recentAvg)}</td><td>{number(r.seasonAvg)}<small>{r.sampleLabel}</small></td><td><Role row={r}/></td><td><Defense row={r}/></td><td><Charts row={r} game={game} onOpen={onOpen}/></td></tr>)}</tbody></table></div>
    <div className="matchup-props-mobile">
      <div className="prop-list-head" aria-hidden="true"><span>Player / market</span><span>{rows[0].line?'DK line':'Average'}</span><span>Model</span></div>
      {rows.map(r=><details key={key(r)} className="prop-list-row">
        <summary>
          <span className="prop-list-name"><b>{r.p.name}</b><small>{[r.team,r.label].filter(Boolean).join(' · ')}</small></span>
          <span>{r.line?.anytime?priceText(r.line.over):number(r.line?.point??r.averageLine)}</span>
          <span>{Number.isFinite(r.estimated)?number(r.estimated)+(r.line?.anytime?'%':''):'—'}<i aria-hidden="true">⌄</i></span>
        </summary>
        <dl><dt>{r.line?'DraftKings':'Player average'}</dt><dd><Price row={r}/></dd>
          <dt>Model projection</dt><dd><Projection row={r}/></dd>
          {r.status&&<><dt>Injury status</dt><dd>{r.status}</dd></>}
          <dt>Last 5 average</dt><dd>{number(r.recentAvg)}</dd><dt>Season average</dt><dd>{number(r.seasonAvg)} {r.sampleLabel}</dd>
          <dt>Role / share</dt><dd><Role row={r}/></dd><dt>Defense</dt><dd><Defense row={r}/></dd>
      </dl><Charts row={r} game={game} onOpen={onOpen}/></details>)}</div></>;
}
