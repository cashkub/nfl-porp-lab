import TrackedPicks,{useArchive} from './TrackedPicks.jsx';
import {recordWeek,weekLabel} from '../lib/recordWeeks.js';
import React,{useState} from 'react';
function outcome(row,key){
  if(!row.final || !row[key])return 'Pending';
  const direction=pair=>Math.sign(pair[1]-pair[0]);
  if(!direction(row[key]))return 'No Pick';
  if(!direction(row.final))return 'Tie';
  return direction(row.final)===direction(row[key])?'Correct':'Incorrect';
}
export default function ModelRecord({validation,sport='nfl'}){
  const [tab,setTab]=useState('games');
  const [week,setWeek]=useState('all');
  const picks=useArchive(sport+'-picks.json');
  const {rows:games,error:failed}=useArchive(sport==='nfl'?'model-record.json':'cbb-games-record.json');
  const weeks=[...new Set([...(games || []),...(picks.rows || [])].map(r=>recordWeek(r,sport)).filter(Boolean))].sort().reverse();
  const inWeek=r=>week==='all' || recordWeek(r,sport)===week;
  const rows=games?.filter(inWeek);
  const selector=<div className="board-controls"><label>Game Week<select value={week} onChange={e=>setWeek(e.target.value)}><option value="all">All Weeks</option>{weeks.map(w=><option value={w} key={w}>{weekLabel(w)}</option>)}</select></label></div>;
  const tabs=<div className="board-sort">{[['games','Game Winners'],['props','Top Props'],...(sport==='nfl'?[['touchdowns','Touchdown Scorers']]:[])].map(([k,t])=><button key={k} className="outline-button" aria-pressed={tab===k} onClick={()=>setTab(k)}>{t}</button>)}</div>;
  if(tab!=='games')return <TrackedPicks sport={sport} touchdownRecord={tab==='touchdowns'} record archive={{...picks,rows:picks.rows?.filter(inWeek)}}>{tabs}{selector}</TrackedPicks>;
  return <section className="panel props-board">{tabs}<h1>{sport.toUpperCase()} Model Record</h1><p>{sport==='nfl'?'Latest saved prediction before kickoff.':'First published prediction before tipoff.'} Final scores are graded on the next stats refresh.</p>{selector}
    <div className="research-grid">{(sport==='nfl'?[['stats','Stats-Only'],['blend','Market-Informed']]:[['stats','Stats-Only']]).map(([k,label])=>{
      const graded=(rows || []).filter(r=>r.final && r[k]),margin=s=>s[1]-s[0];
      const decided=graded.filter(r=>margin(r.final) && margin(r[k]));
      const right=decided.filter(r=>Math.sign(margin(r[k]))===Math.sign(margin(r.final))).length;
      return <div className="usage-trend" key={k}><h3>{label}</h3><p>{right} of {decided.length} winners · {graded.length} graded</p><small>Average margin error · {graded.length?(graded.reduce((a,r)=>a+Math.abs(margin(r.final)-margin(r[k])),0)/graded.length).toFixed(1)+' pts':'Awaiting Finals'}</small></div>;
    })}</div>
    {validation && <details><summary>2025 Held-Out Test · {validation.games} Games</summary><p>Average absolute error in points. Historical evaluation uses recorded starting QBs and outdoor conditions. The injury overlay is evaluated prospectively.</p>{Object.entries(validation.results).map(([k,v])=><p key={k}><b>{k}</b> · Team score {v.scoreMAE} · Margin {v.marginMAE}</p>)}</details>}
    {rows?.length?<div className="board-scroll"><table className="game-log"><thead><tr>{['Matchup (Away First)','Saved','Stats Score',...(sport==='nfl'?['Blended Score']:[]),'Final','Stats Pick',...(sport==='nfl'?['Blend Pick']:[])].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.away} at {r.home}</td><td>{new Date(r.saved).toLocaleString()}</td>{(sport==='nfl'?['stats','blend','final']:['stats','final']).map(k=><td key={k}>{r[k]?.join(' – ') || '—'}</td>)}{(sport==='nfl'?['stats','blend']:['stats']).map(k=><td key={k+'pick'}>{r[k]?(r[k][0]===r[k][1]?'Even':r[k][0]>r[k][1]?r.away:r.home):'—'} · <strong className="record-result" data-result={outcome(r,k)}>{outcome(r,k)}</strong></td>)}</tr>)}</tbody></table></div>:<p>{failed?'Record unavailable.':rows?'No archived game predictions for this selection.':'Loading Record…'}</p>}</section>;
}
