import {teamColor} from '../lib/teamColors.js';
import TrackedPicks,{useArchive} from './TrackedPicks.jsx';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
import React,{useState} from 'react';
import {overallScore} from '../lib/projection.js';

const margin=pair=>pair[1]-pair[0];
function outcome(row){
  if(!row.final || !row.overall)return 'Pending';
  const direction=pair=>Math.sign(pair[1]-pair[0]);
  if(!direction(row.overall))return 'No Pick';
  if(!direction(row.final))return 'Tie';
  return direction(row.final)===direction(row.overall)?'Correct':'Incorrect';
}
export default function ModelRecord({validation,sport='nfl'}){
  const [tab,setTab]=useState('games');
  const periodName=sport==='cbb'?'Date':'Week';
  const [period,setPeriod]=useState('all');
  const picks=useArchive(sport+'-picks.json');
  const {rows:games,error:failed}=useArchive(sport==='nfl'?'model-record.json':'cbb-games-record.json');
  const periods=[...new Set([...(games || []),...(picks.rows || [])].map(r=>recordPeriod(r,sport)).filter(Boolean))].sort().reverse();
  const inPeriod=r=>period==='all' || recordPeriod(r,sport)===period;
  const rows=games?.filter(inPeriod).map(row=>({...row,overall:overallScore(row)}));
  const graded=(rows || []).filter(r=>r.final && r.overall);
  const decided=graded.filter(r=>margin(r.final) && margin(r.overall));
  const right=decided.filter(r=>outcome(r)==='Correct').length;
  const selector=<div className="board-controls"><label>Game {periodName}<select aria-label={'Game '+periodName} value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All {periodName}s</option>{periods.map(w=><option value={w} key={w}>{periodLabel(w,sport)}</option>)}</select></label></div>;
  const tabs=<div className="board-sort">{[['games','Game Winners'],['props','Top Props'],...(sport==='nfl'?[['touchdowns','Touchdown Scorers']]:[])].map(([k,t])=><button key={k} className="outline-button" aria-pressed={tab===k} onClick={()=>setTab(k)}>{t}</button>)}</div>;
  if(tab!=='games')return <TrackedPicks sport={sport} touchdownRecord={tab==='touchdowns'} record archive={{...picks,rows:picks.rows?.filter(inPeriod)}}>{tabs}{selector}</TrackedPicks>;
  return <section className="panel props-board">{tabs}<h1>{sport.toUpperCase()} Model Record</h1><p>{sport==='nfl'?'Latest saved prediction before kickoff.':'First published prediction before tipoff.'} Final scores are graded on the next stats refresh.</p>{selector}
    <div className="usage-trend"><h3>Overall Record</h3><p>{right} Correct · {decided.length-right} Incorrect</p>
      <small>{decided.length?Math.round(100*right/decided.length)+'% accuracy · ':''}{graded.length} graded · Average margin error {graded.length?(graded.reduce((sum,r)=>sum+Math.abs(margin(r.final)-margin(r.overall)),0)/graded.length).toFixed(1)+' pts':'—'}</small></div>
    {validation && <details><summary>2025 Held-Out Test · {validation.games} Games</summary><p>Average absolute error in points. Historical evaluation uses recorded starting QBs and outdoor conditions. The injury overlay is evaluated prospectively.</p>{Object.entries(validation.results).map(([k,v])=><p key={k}><b>{k}</b> · Team score {v.scoreMAE} · Margin {v.marginMAE}</p>)}</details>}
    {rows?.length?<div className="board-scroll"><table className="game-log"><thead><tr>{[...(sport==='cbb'?['Game Date']:[]),'Matchup (Away First)','Overall Pick','Projected Score','Final','Result','Saved'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>
      {sport==='cbb' && <td>{periodLabel(recordPeriod(r,sport),sport)}</td>}<td><span className="team-name" style={{'--team-color':teamColor(r.away,r.colors)}}>{r.away}</span> at <span className="team-name" style={{'--team-color':teamColor(r.home,r.colors)}}>{r.home}</span></td><td>{!r.overall?'—':margin(r.overall)===0?'No Pick':margin(r.overall)>0?r.home:r.away}</td>
      <td>{r.overall?.join(' – ') || '—'}</td><td>{r.final?.join(' – ') || '—'}</td>
      <td><strong className="record-result" data-result={outcome(r)}>{outcome(r)}</strong></td><td>{new Date(r.saved).toLocaleString()}</td></tr>)}</tbody></table></div>:<p>{failed?'Record unavailable.':rows?'No archived game predictions for this selection.':'Loading Record…'}</p>}</section>;
}
