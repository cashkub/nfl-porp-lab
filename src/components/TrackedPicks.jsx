import HitRate,{defenseRankStyle} from './HitRate.jsx';
import {teamColor} from '../lib/teamColors.js';
import {CalendarDays,ListOrdered,Target} from 'lucide-react';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
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
export default function TrackedPicks({sport,record=false,onOpen,archive,touchdownRecord=false,children}){
  const fetched=useArchive(archive?null:sport+'-picks.json');
  const {rows:allRows,error}=archive || fetched;
  const [showScorers,setShowScorers]=useState(false);
  const scorers=record?touchdownRecord:showScorers;
  const rows=allRows?.filter(r=>scorers?r.kind==='touchdown':r.kind!=='touchdown');
  const periodName=sport==='cbb'?'Date':'Week';
  const [period,setPeriod]=useState('');
  const today=dayfmt.format(new Date());
  const ordered=[...(allRows || [])].sort((a,b)=>a.date.localeCompare(b.date));
  const periods=[...new Set(ordered.map(r=>recordPeriod(r,sport)).filter(Boolean))].reverse();
  const nearest=ordered.find(r=>r.date>=today) || ordered.at(-1);
  const selected=periods.includes(period)?period:nearest?recordPeriod(nearest,sport):'';
  const inPeriod=(rows || []).filter(r=>record || recordPeriod(r,sport)===selected);
  const dates=[...new Set(inPeriod.map(r=>r.date))].sort();
  const shown=inPeriod.sort((a,b)=>b.date.localeCompare(a.date)||a.rank-b.rank);
  const count=status=>shown.filter(r=>(r.result||'Pending')===status).length;
  const hits=count('Hit'),misses=count('Miss');
  return <section className="panel props-board top-props"><h1>{sport.toUpperCase()} {scorers && record?'Touchdown Scorers Record':record?'Top Props Record':'Top Props'}</h1>
    {children}
    {!record && <div className="picks-toolbar">
      {sport==='nfl' && <div className="pick-switch" role="group" aria-label="Pick List">{[[false,'All Props',ListOrdered],[true,'Touchdown Scorers',Target]].map(([active,label,Icon])=><button type="button" key={label} aria-pressed={scorers===active} onClick={()=>setShowScorers(active)}><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>}
      <label className="week-control"><CalendarDays size={17} aria-hidden="true"/>Game {periodName}
        <select aria-label={'Game '+periodName} value={selected} disabled={!periods.length} onChange={e=>setPeriod(e.target.value)}>{!periods.length&&<option value="">No {periodName}s Available</option>}{periods.map(w=><option key={w} value={w}>{periodLabel(w,sport)}</option>)}</select>
      </label>
    </div>}
    <details className="ranking-info"><summary>How Picks Are Ranked</summary><p>{scorers?'Scoring frequency, recent carries and targets, opponent defense, and reported availability determine the daily touchdown rankings.':'The model ranks up to nine picks per game day using recent hit rates, last-three form, and opponent defense.'} {!scorers && (sport==='nfl'?'NFL rankings also account for usage changes, questionable designations, and the DraftKings price. Out and doubtful players are excluded at publication.':'College rankings use manual lines and require 15 minutes per game.')} Picks lock at publication.</p></details>
    {record&&<p><b><span className="result-win">{hits} Hits</span> · <span className="result-loss">{misses} Misses</span> · <span className="result-push">{count('Push')} Pushes</span></b> · {count('Pending')} Pending · {count('No Stat')} No Stat · Hit Rate <HitRate rate={hits/(hits+misses)}/></p>}
    {error?<p>Pick archive unavailable.</p>:!rows?<p>Loading Published Picks…</p>:!shown.length?<p>{record?'No picks archived for this selection.':'No qualifying picks published for this slate yet.'}</p>:record?
      <div className="board-scroll"><table className="game-log"><thead><tr>{['Game '+periodName+' / Rank','Player','Pick','Price','Final Stat','Result','Published'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.date+r.rank}><td>{periodLabel(recordPeriod(r,sport),sport)} · <b style={defenseRankStyle(r.rank,9)}>#{r.rank}</b>{sport==='nfl' && <><br/><small>{r.date}</small></>}</td><td className="team-edge" style={{'--team-color':teamColor(r.team,r.colors)}}>{r.player}</td><td>{r.side} {r.line} {r.label}</td><td>{priceText(r.price)}</td><td>{r.actual??'—'}</td><td><strong className={'result-pill '+(r.result||'pending').toLowerCase()}>{r.result||'Pending'}</strong></td><td>{new Date(r.saved).toLocaleString()}</td></tr>)}</tbody></table></div>:
      dates.map(d=><section className="daily-picks" key={d}><h2>{new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'})}</h2><div className="research-grid picks-grid">{shown.filter(r=>r.date===d).map(r=><MatchCard key={r.date+r.rank} game={r} colors={sport==='cbb'?r.colors:undefined}>
        <PickReport number={r.rank} name={r.player} onOpen={()=>onOpen(r)} side={r.side} line={r.line} metric={r.label} price={scorers?(r.price==null?'DraftKings Odds Unavailable':'DraftKings '+priceText(r.price)+' · Anytime TD'):r.price==null?'Manual Line':'DraftKings '+priceText(r.price)} hits={r.hits} total={r.total} average={r.average} rank={r.defenseRank} rankCount={sport==='cbb'?(r.rankCount || null):32} results={r.values}
          role={r.role} context={r.context} reason={scorers?'Scored in '+r.hits+' of '+r.total+' games.':<>Adjusted historical hit rate <HitRate rate={r.adjusted}/>{r.price!=null?<> versus <span className="context-value">{Math.round(100*r.breakEven)}%</span> break-even at the saved price.</>:' at the manual line.'}</> }/>
        {scorers && r.priceUpdated && <small>Odds as of {new Date(r.priceUpdated).toLocaleString()}</small>}
        <small>Published {new Date(r.saved).toLocaleString()} · <span className="pick-status" data-result={r.result}>{r.result||'Pending'}</span></small></MatchCard>)}</div></section>)}
    {record&&<p className="board-foot">A push lands on the line. No Stat means team game logs arrived without a qualifying player stat. Neither counts toward hit rate.</p>}</section>;
}
