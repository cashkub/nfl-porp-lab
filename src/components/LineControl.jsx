import React,{useState} from 'react';
import {summarize} from '../lib/stats.js';
import {rateStyle} from './HitRate.jsx';

export function ControlLabel({children}) {
  return <b><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7h5m5 0h8M3 17h10m5 0h3"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/></svg>{children}</b>;
}

export default function LineControl({line,setLine,resetLine,manual,manualLabel,quote,median,games,metric,direction,interval=1}) {
  const [draft,setDraft]=useState(null);
  const savedAt=Date.parse(quote?.updated);
  const stamp=Number.isFinite(savedAt)?new Date(savedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}):'';
  const source=quote?'DraftKings · '+quote.point+(stamp?' · '+stamp:''):'No Sportsbook Line Data';
  const anchor=quote?.point ?? median ?? line;
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
        {manual?manualLabel:quote?'DraftKings':line!=null?'Player Average':'No Sportsbook Line'}
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
