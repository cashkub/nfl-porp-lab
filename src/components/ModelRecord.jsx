import React,{useState,useEffect} from 'react';
export default function ModelRecord({validation}){
  const [rows,setRows]=useState(null),[failed,setFailed]=useState(false);
  useEffect(()=>{const ctrl=new AbortController();fetch(import.meta.env.BASE_URL+'data/model-record.json',{signal:ctrl.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setRows).catch(()=>{if(!ctrl.signal.aborted)setFailed(true)});return ()=>ctrl.abort()},[]);
  return <section className="panel props-board"><h1>NFL Model Record</h1><p>Latest saved prediction before kickoff. Final scores are graded on the next stats refresh.</p>
    <div className="research-grid">{[['stats','Stats-Only'],['blend','Market-Informed']].map(([k,label])=>{
      const graded=(rows || []).filter(r=>r.final && r[k]),margin=s=>s[1]-s[0];
      const decided=graded.filter(r=>margin(r.final) && margin(r[k]));
      const right=decided.filter(r=>Math.sign(margin(r[k]))===Math.sign(margin(r.final))).length;
      return <div className="usage-trend" key={k}><h3>{label}</h3><p>{right} of {decided.length} winners · {graded.length} graded</p><small>Average margin error · {graded.length?(graded.reduce((a,r)=>a+Math.abs(margin(r.final)-margin(r[k])),0)/graded.length).toFixed(1)+' pts':'Awaiting Finals'}</small></div>;
    })}</div>
    {validation && <details><summary>2025 Held-Out Test · {validation.games} Games</summary><p>Average absolute error in points. Historical evaluation uses recorded starting QBs and outdoor conditions. The injury overlay is evaluated prospectively.</p>{Object.entries(validation.results).map(([k,v])=><p key={k}><b>{k}</b> · Team score {v.scoreMAE} · Margin {v.marginMAE}</p>)}</details>}
    {rows?.length?<div className="board-scroll"><table className="game-log"><thead><tr>{['Matchup (Away First)','Saved','Stats Score','Blended Score','Final'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.away} at {r.home}</td><td>{new Date(r.saved).toLocaleString()}</td>{['stats','blend','final'].map(k=><td key={k}>{r[k]?.join(' – ') || '—'}</td>)}</tr>)}</tbody></table></div>:<p>{failed?'Record unavailable.':rows?'Awaiting Pregame Predictions.':'Loading Record…'}</p>}</section>;
}
