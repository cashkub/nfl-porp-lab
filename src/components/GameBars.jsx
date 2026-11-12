import React from 'react';
import {ChevronDown} from 'lucide-react';
import TeamLogo from './TeamLogo.jsx';

export default function GameBars({rows,label,caption,line,direction,sport,selected,onSelect,expanded,onExpand,details}){
  const low=Math.min(0,...rows.map(r=>r.value)),high=Math.max(1,line,...rows.map(r=>r.value));
  const position=value=>8+75*(value-low)/(high-low);
  return <>
    <div className="plot-heading"><span>{label}</span><small>{caption}</small>
      <button className="plot-details-toggle" type="button" aria-expanded={expanded} aria-controls="game-by-game-bars" onClick={onExpand}>{expanded?'Hide Game Details':'Show Game Details'} <ChevronDown size={15}/></button>
    </div>
    <div className="margin-scroll"><div id="game-by-game-bars" className={'margin-bars'+(expanded?' details-open':'')} style={{'--count':rows.length,'--target':position(line)+'%'}}>
      {rows.map((r,i)=><button key={r.id} type="button" data-result={r.outcome} aria-pressed={r.id===selected} aria-label={r.description} onClick={()=>onSelect(r.id===selected?'':r.id)}>
        <span className="bar-space"><i style={{bottom:Math.min(position(0),position(r.value))+'%',height:Math.max(1,Math.abs(position(r.value)-position(0)))+'%'}}/>
          {line!=null&&i===rows.length-1&&<span className="chart-reference">{direction} {line}</span>}
          <strong style={{bottom:Math.max(position(0),position(r.value))+'%'}}>{r.value}</strong></span>
        <span className="chart-opponent"><TeamLogo sport={sport} className="chart-logo" team={r.opponent}/><b>{r.opponentLabel}</b></span><span>{r.date}</span><span>{r.footer}</span>
        {expanded&&<span className="bar-details">{details(r)}</span>}
      </button>)}
    </div></div>
  </>;
}
