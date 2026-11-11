import {Trophy,ArrowUpDown,Scale} from 'lucide-react';
import RecordHeader from './RecordHeader.jsx';
import React,{useState} from 'react';
import {gameMarkets,gameResult} from '../lib/gamePicks.js';
import {periodLabel,recordPeriod} from '../lib/recordWeeks.js';
import {priceText} from '../lib/bookLine.js';
import TeamLogo from './TeamLogo.jsx';
import FilterMenu from './FilterMenu.jsx';

const headers={
  moneyline:{icon:Trophy,description:'The model’s pregame winner and saved odds are graded against the final score.'},
  total:{icon:ArrowUpDown,description:'Final combined points are graded against the model’s saved over or under and game total.'},
  spread:{icon:Scale,description:'The final margin is graded against the team and point spread saved before kickoff.'}
};

function summary(rows,market){
  const count={Win:0,Loss:0,Push:0,Pending:0};
  for(const row of rows)count[gameResult(row,market)]++;
  return count.Win+'W · '+count.Loss+'L · '+count.Push+' push · '+count.Pending+' pending';
}
const kickoff=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export default function GameMarketRecord({rows,market}){
  const [week,setWeek]=useState('');
  const weeks=[...new Set(rows.filter(r=>r.markets).map(r=>recordPeriod(r,'nfl')))].sort().reverse();
  const nearest=rows.filter(r=>r.markets).reduce((best,r)=>!best||Math.abs(Date.parse(r.kickoff)-Date.now())<Math.abs(Date.parse(best.kickoff)-Date.now())?r:best,null);
  const selected=week==='all'||weeks.includes(week)?week:nearest?recordPeriod(nearest,'nfl'):'all';
  const all=rows.filter(r=>r.markets?.[market]);
  const visible=all.filter(r=>selected==='all'||recordPeriod(r,'nfl')===selected).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  return <section className="model-record-picks">
    <RecordHeader title={gameMarkets[market].toUpperCase()} icon={headers[market].icon}>{headers[market].description}</RecordHeader>
    <div className="mr-period-select"><label>Game week<FilterMenu value={selected} onChange={e=>setWeek(e.target.value)}><option value="all">All weeks</option>{weeks.map(w=><option key={w} value={w}>{periodLabel(w,'nfl')}</option>)}</FilterMenu></label></div>
    <p><b>{selected==='all'?'All weeks':periodLabel(selected,'nfl')}</b> · {summary(visible,market)}</p>
    {selected!=='all'&&<p>All-time · {summary(all,market)}</p>}
    {visible.length?<div className="board-scroll"><table className="game-log"><thead><tr>{['Matchup','Pick','Odds','Final (away–home)','Result','Saved (ET)'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{visible.map(r=>{const p=r.markets[market];return <tr key={r.id}>
        <td><TeamLogo team={r.away}/>{r.away} @ <TeamLogo team={r.home}/>{r.home}<small>{kickoff.format(new Date(r.kickoff))}</small></td>
        <td><TeamLogo team={market==='total'?null:p.side}/><b>{p.side}{market!=='moneyline'?' '+(market==='spread'&&p.line>0?'+':'')+p.line:''}</b></td>
        <td>{priceText(p.price)}</td><td>{r.final?.join(' – ')||'—'}</td><td>{gameResult(r,market)}</td><td>{kickoff.format(new Date(r.saved))}</td>
      </tr>})}</tbody></table></div>:<p>No pregame {gameMarkets[market].toLowerCase()} picks saved for this selection.</p>}
  </section>;
}
