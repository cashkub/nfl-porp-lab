import React,{useState,useSyncExternalStore} from 'react';
import {priceText} from '../lib/bookLine.js';
import TeamLogo from './TeamLogo.jsx';
import {teamColor} from '../lib/teamColors.js';
import {propGap,sortColumns} from '../lib/propSort.js';

const mobileLayout=() => window.matchMedia('(max-width: 760px)');
function subscribeLayout(callback){
  const media=mobileLayout();
  media.addEventListener('change',callback);
  return ()=>media.removeEventListener('change',callback);
}
const isMobile=()=>mobileLayout().matches;
const timestamp=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const number=n=>Number.isFinite(n)?String(Number(n.toFixed(1))):'—';
const teamPositions={QB:'quarterbacks',RB:'running backs',WR:'wide receivers',TE:'tight ends'};

function Price({row}){
  const q=row.line;
  return <><strong>{q?.anytime?'Yes':number(q?.point??row.averageLine)}</strong>
    <small>{q?(q.anytime?priceText(q.over):'O '+priceText(q.over)+' / U '+priceText(q.under)):'Player average'}</small>
    {Number.isFinite(Date.parse(q?.updated))&&<small>Updated {timestamp.format(new Date(q.updated))}</small>}</>;
}
function Projection({row}){
  if(!Number.isFinite(row.estimated))return <small>{row.note||'Projection unavailable'}</small>;
  return <><strong>{number(row.estimated)}{row.line?.anytime?'%':''}</strong>
    {row.line?.anytime&&<small>Chance to score</small>}{row.note&&<small>{row.note}</small>}</>;
}
function Player({row}){
  return <span className="prop-identity"><TeamLogo team={row.team}/>
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

export default function MatchupProps({rows,game,onOpen,order,onSort}){
  const mobile=useSyncExternalStore(subscribeLayout,isMobile,()=>false);
  const key=r=>[r.p.name,r.metric,r.line?.point,r.line?.anytime].join(':');
  const headers=[['player','Player'],['market','Market'],['line','Prop line'],['model','Model projection'],['gap','Gap %'],['recent','Last 5 avg'],['season','Season avg'],['role','Role / share'],['defense','Defense']];
  function direction(key){
    if(!sortColumns[key].includes(order))return undefined;
    return ['player','market','low','below'].includes(order)||order.endsWith('Low')?'ascending':'descending';
  }
  function header(key,label){
    const dir=direction(key);
    return <button className="prop-column-button" type="button" onClick={()=>onSort(key)}
      aria-label={'Sort by '+label+(dir?', currently '+dir:'')}>{label}<i aria-hidden="true">{dir==='ascending'?'↑':dir==='descending'?'↓':'↕'}</i></button>;
  }
  function gap(r){
    const value=propGap(r);
    return value==null?'—':(value>0?'+':'')+number(100*value)+'%';
  }
  if(!rows.length)return <p className="nfl-empty-state">No players match these filters.</p>;
  if(!mobile)return <div className="matchup-props-desktop"><table><thead><tr>{headers.map(([key,label])=><th key={key} scope="col" aria-sort={direction(key)}>{header(key,label)}</th>)}<th>Chart</th></tr></thead>
      <tbody>{rows.map(r=><tr key={key(r)} style={{'--club':teamColor(r.team)}}><td><Player row={r}/></td><td>{r.label}</td><td><Price row={r}/></td><td><Projection row={r}/></td>
        <td>{gap(r)}</td><td>{number(r.recentAvg)}</td><td>{number(r.seasonAvg)}<small>{r.sampleLabel}</small></td><td><Role row={r}/></td><td><Defense row={r}/></td><td><Charts row={r} game={game} onOpen={onOpen}/></td></tr>)}</tbody></table></div>;
  return <div className="matchup-props-mobile">
      <div className="prop-list-head"><span>{header('player','Player')}/{header('market','Market')}</span>{header('line',rows[0].line?'DK line':'Avg')}{header('model','Model')}{header('gap','Gap %')}</div>
      {rows.map(r=><MobileRow key={key(r)} r={r} gap={gap(r)} game={game} onOpen={onOpen}/>)}</div>;
}

function MobileRow({r,gap,game,onOpen}){
  const [open,setOpen]=useState(false);
  return <details className="prop-list-row" onToggle={e=>setOpen(e.currentTarget.open)} style={{'--club':teamColor(r.team)}}>
        <summary>
          <span className="prop-list-name"><TeamLogo team={r.team}/><b>{r.p.name}</b><small>{[r.team,r.label].filter(Boolean).join(' · ')}</small></span>
          <span>{r.line?.anytime?priceText(r.line.over):number(r.line?.point??r.averageLine)}</span>
          <span>{Number.isFinite(r.estimated)?number(r.estimated)+(r.line?.anytime?'%':''):'—'}</span><span>{gap}<i aria-hidden="true">⌄</i></span>
        </summary>
        {open&&<><dl><dt>{r.line?'DraftKings':'Player average'}</dt><dd><Price row={r}/></dd>
          <dt>Model projection</dt><dd><Projection row={r}/></dd>
          {r.status&&<><dt>Injury status</dt><dd>{r.status}</dd></>}
          <dt>Last 5 average</dt><dd>{number(r.recentAvg)}</dd><dt>Season average</dt><dd>{number(r.seasonAvg)} {r.sampleLabel}</dd>
          <dt>Role / share</dt><dd><Role row={r}/></dd><dt>Defense</dt><dd><Defense row={r}/></dd>
      </dl><Charts row={r} game={game} onOpen={onOpen}/></>}</details>;
}
