import React,{useEffect,useState} from 'react';
import {MatchCard} from './Research.jsx';
import {PickReport} from './MatchReport.jsx';
import {priceText} from '../lib/bookLine.js';

export function useArchive(file){
  const [state,setState]=useState({});
  useEffect(()=>{
    if(!file)return;
    const ctrl=new AbortController();
    fetch(import.meta.env.BASE_URL+'data/'+file,{signal:ctrl.signal,cache:'no-cache'})
      .then(r=>{if(!r.ok)throw Error();return r.json()})
      .then(rows=>setState({file,rows})).catch(()=>{if(!ctrl.signal.aborted)setState({file,error:true})});
    return ()=>ctrl.abort();
  },[file]);
  return state.file===file?state:{};
}
const dayfmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export default function TrackedPicks({sport,record=false,onOpen,archive,touchdownRecord=false}){
  const fetched=useArchive(archive?null:sport+'-picks.json');
  const {rows:allRows,error}=archive || fetched;
  const [showScorers,setShowScorers]=useState(false);
  const scorers=record?touchdownRecord:showScorers;
  const rows=allRows?.filter(r=>scorers?r.kind==='touchdown':r.kind!=='touchdown');
  const [date,setDate]=useState('');
  const dates=[...new Set(rows?.map(r=>r.date))].sort();
  const today=dayfmt.format(new Date());
  const selected=date || (record?'all':dates.find(d=>d>=today)||dates.at(-1));
  const shown=(rows || []).filter(r=>selected==='all'||r.date===selected).sort((a,b)=>b.date.localeCompare(a.date)||a.rank-b.rank);
  const count=status=>shown.filter(r=>(r.result||'Pending')===status).length;
  const hits=count('Hit'),misses=count('Miss');
  return <section className="panel props-board"><h1>{sport.toUpperCase()} {scorers && record?'Touchdown Scorers Record':record?'Top Props Record':'Top Props'}</h1>
    {!record && sport==='nfl' && <div className="board-sort">{[[false,'All Props'],[true,'Touchdown Scorers']].map(([active,label])=><button type="button" key={label} className="outline-button" aria-pressed={scorers===active} onClick={()=>{setShowScorers(active);setDate('')}}>{label}</button>)}</div>}
    {scorers?<p>Up to eight players ranked to score a rushing or receiving touchdown on the selected game day. Rankings use scoring frequency, recent carries and targets, opponent defense and reported availability.</p>:<p>Up to eight picks per game date (ET). Each line is locked when published. Recent hit rate, last-three form and opponent defense rank determine the order{sport==='nfl'?' with adjustments for usage changes, questionable designations and the DraftKings price. Out and doubtful players are excluded at publication.':'. College picks use preset manual lines and require 15 minutes per game.'}</p>}
    <div className="board-controls"><label>Game Date<select value={selected||''} onChange={e=>setDate(e.target.value)}>{record&&<option value="all">All Dates</option>}{dates.map(d=><option key={d}>{d}</option>)}</select></label></div>
    {record&&<p><b>{hits} Hits · {misses} Misses · {count('Push')} Pushes</b> · {count('Pending')} Pending · {count('No Stat')} No Stat · Hit Rate {hits+misses?Math.round(100*hits/(hits+misses))+'%':'—'}</p>}
    {error?<p>Pick archive unavailable.</p>:!rows?<p>Loading Published Picks…</p>:!shown.length?<p>No qualifying picks published for this slate yet.</p>:record?
      <div className="board-scroll"><table className="game-log"><thead><tr>{['Date / Rank','Player','Pick','Price','Final Stat','Result','Published'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.date+r.rank}><td>{r.date} · #{r.rank}</td><td>{r.player}</td><td>{r.side} {r.line} {r.label}</td><td>{priceText(r.price)}</td><td>{r.actual??'—'}</td><td><strong className={'result-pill '+(r.result||'pending').toLowerCase()}>{r.result||'Pending'}</strong></td><td>{new Date(r.saved).toLocaleString()}</td></tr>)}</tbody></table></div>:
      <div className="research-grid picks-grid">{shown.map(r=><MatchCard key={r.date+r.rank} game={r} colors={sport==='cbb'?r.colors:undefined}>
        <PickReport number={r.rank} name={r.player} onOpen={()=>onOpen(r)} side={r.side} line={r.line} metric={r.label} price={scorers?'To Score 1+ TD':r.price==null?'Manual Line':'DraftKings '+priceText(r.price)} hits={r.hits} total={r.total} average={r.average} rank={r.defenseRank} results={r.values}
          reason={scorers?'Scored in '+r.hits+' of '+r.total+' games. '+r.role+(r.context?' · '+r.context:''):'Adjusted historical hit rate '+Math.round(100*r.adjusted)+'%'+(r.price!=null?' versus '+Math.round(100*r.breakEven)+'% break-even at the saved price':' at the manual line')+'. '+(r.role||'')+(r.context?' · '+r.context:'')}/>
        <small>Published {new Date(r.saved).toLocaleString()} · {r.result||'Pending'}</small></MatchCard>)}</div>}
    {record&&<p className="board-foot">A push lands on the line. No Stat means team game logs arrived without a qualifying player stat. Neither counts toward hit rate.</p>}</section>;
}
