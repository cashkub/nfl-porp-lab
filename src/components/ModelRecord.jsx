import FilterMenu from './FilterMenu.jsx';
import SortableTable from './SortableTable.jsx';
import HitRate from './HitRate.jsx';
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
function winRate(results){
  const wins=results.filter(s=>s==='Correct' || s==='Hit').length;
  const losses=results.filter(s=>s==='Incorrect' || s==='Miss').length;
  return wins+losses?wins/(wins+losses):null;
}
function recordCell(results){
  const wins=results.filter(s=>s==='Correct' || s==='Hit').length;
  const losses=results.filter(s=>s==='Incorrect' || s==='Miss').length;
  const pending=results.filter(s=>s==='Pending').length;
  const other=results.length-wins-losses-pending;
  if(!results.length)return '—';
  return <><b className="result-win">{wins} W</b> · <b className="result-loss">{losses} L</b> · <HitRate rate={wins/(wins+losses)}/>
    {(pending>0 || other>0) && <small>{[pending && pending+' pending',other && other+' ungraded or tied'].filter(Boolean).join(' · ')}</small>}</>;
}

function PerformanceSummary({games,picks,period,sport}){
  const groups=new Map();
  function add(label,row,result){
    if(!groups.has(label))groups.set(label,{overall:[],selected:[]});
    const group=groups.get(label);
    group.overall.push(result);
    if(recordPeriod(row,sport)===period)group.selected.push(result);
  }
  for(const row of games)add(sport==='nfl'?'Moneyline Winners':'Game Winners',row,outcome({...row,overall:overallScore(row)}));
  for(const row of picks)add(row.kind==='touchdown'?'Anytime Touchdown Scorers':row.label,row,row.result || 'Pending');
  return <section className="performance-summary"><h2>Performance by Category</h2>
    <div className="board-scroll"><SortableTable headers={['Category','Overall',period?periodLabel(period,sport):'Selected Period']} rows={[...groups]} descending={[1,2]}
      values={([label,g])=>[label,winRate(g.overall),winRate(g.selected)]} renderRow={([label,group])=><tr key={label}><th scope="row">{label}</th><td>{recordCell(group.overall)}</td><td>{recordCell(group.selected)}</td></tr>}/></div>
    <small>Win rates use decided picks. Overall includes the full published archive.</small></section>;
}
export default function ModelRecord({validation,sport='nfl',initialTab='games'}){
  const [tab,setTab]=useState(initialTab);
  const periodName=(sport==='nba'||sport==='cbb')?'Date':'Week';
  const [period,setPeriod]=useState('all');
  const picks=useArchive(sport+'-picks.json');
  const {rows:games,error:failed}=useArchive(sport==='nfl'?'model-record.json':sport+'-games-record.json');
  const periods=[...new Set([...(games || []),...(picks.rows || [])].map(r=>recordPeriod(r,sport)).filter(Boolean))].sort().reverse();
  const inPeriod=r=>period==='all' || recordPeriod(r,sport)===period;
  const rows=games?.filter(inPeriod).map(row=>({...row,overall:overallScore(row)}));
  const graded=(rows || []).filter(r=>r.final && r.overall);
  const decided=graded.filter(r=>margin(r.final) && margin(r.overall));
  const right=decided.filter(r=>outcome(r)==='Correct').length;
  const selector=<div className="board-controls"><label>Game {periodName}<FilterMenu aria-label={'Game '+periodName} value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All {periodName}s</option>{periods.map(w=><option value={w} key={w}>{periodLabel(w,sport)}</option>)}</FilterMenu></label></div>;
  const nearest=[...(games || []),...(picks.rows || [])].filter(r=>Number.isFinite(Date.parse(r.kickoff)))
    .sort((a,b)=>Math.abs(Date.parse(a.kickoff)-Date.now())-Math.abs(Date.parse(b.kickoff)-Date.now()))[0];
  const summaryPeriod=period==='all'?(nearest?recordPeriod(nearest,sport):periods[0]):period;
  const summary=games && picks.rows?<PerformanceSummary games={games} picks={picks.rows} period={summaryPeriod} sport={sport}/>:null;
  const tabs=<div className="board-sort">{[['games','Game Winners'],['props','Top Props'],...(sport==='nfl'?[['touchdowns','Touchdown Scorers']]:[])].map(([k,t])=><button key={k} className="outline-button" aria-pressed={tab===k} onClick={()=>setTab(k)}>{t}</button>)}</div>;
  if(tab!=='games')return <TrackedPicks sport={sport} touchdownRecord={tab==='touchdowns'} record archive={{...picks,rows:picks.rows?.filter(inPeriod)}}>{tabs}{selector}{summary}</TrackedPicks>;
  return <section className="panel props-board">{tabs}<h1>{sport.toUpperCase()} Model Record</h1><p>{sport==='nfl'?'Latest saved prediction before kickoff.':sport==='cfb'?'First published prediction before kickoff.':'First published prediction before tipoff.'} Final scores are graded on the next stats refresh.</p>{selector}{summary}
    <div className="usage-trend"><h3>{period==='all'?'Overall Game Record':'Selected Game Record'}</h3><p><strong className="result-win">{right} Correct</strong> · <strong className="result-loss">{decided.length-right} Incorrect</strong></p>
      <small>{decided.length?<><HitRate rate={right/decided.length}/> accuracy · </>:''}{graded.length} graded · Average margin error {graded.length?(graded.reduce((sum,r)=>sum+Math.abs(margin(r.final)-margin(r.overall)),0)/graded.length).toFixed(1)+' pts':'—'}</small></div>
    {validation && <details><summary>2025 Held-Out Test · {validation.games} Games</summary><p>Average absolute error in points. Historical evaluation uses recorded starting QBs and outdoor conditions. The injury overlay is evaluated prospectively.</p>{Object.entries(validation.results).map(([k,v])=><p key={k}><b>{k}</b> · Team score {v.scoreMAE} · Margin {v.marginMAE}</p>)}</details>}
    {rows?.length?<div className="board-scroll"><SortableTable headers={[...(periodName==='Date'?['Game Date']:[]),'Matchup (Away First)','Overall Pick','Projected Score','Final','Result','Saved']} rows={rows}
      values={r=>[...(periodName==='Date'?[recordPeriod(r,sport)]:[]),r.away+' at '+r.home,!r.overall?null:margin(r.overall)===0?'No Pick':margin(r.overall)>0?r.home:r.away,r.overall?.join(' – '),r.final?.join(' – '),outcome(r),Date.parse(r.saved)]}
      renderRow={r=><tr key={r.id}>
      {(sport==='nba'||sport==='cbb') && <td>{periodLabel(recordPeriod(r,sport),sport)}</td>}<td><span className="team-name" style={{'--team-color':teamColor(r.away,r.colors)}}>{r.away}</span> at <span className="team-name" style={{'--team-color':teamColor(r.home,r.colors)}}>{r.home}</span></td><td>{!r.overall?'—':margin(r.overall)===0?'No Pick':margin(r.overall)>0?r.home:r.away}</td>
      <td>{r.overall?.join(' – ') || '—'}</td><td>{r.final?.join(' – ') || '—'}</td>
      <td><strong className="record-result" data-result={outcome(r)}>{outcome(r)}</strong></td><td>{new Date(r.saved).toLocaleString()}</td></tr>}/></div>:<p>{failed?'Record unavailable.':rows?'No archived game predictions for this selection.':'Loading Record…'}</p>}</section>;
}
