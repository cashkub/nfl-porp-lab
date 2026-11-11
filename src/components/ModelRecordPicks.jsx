import React,{useMemo,useState} from 'react';
import {Activity,CalendarDays,ChevronDown,Filter,Search,Shield,Target,TrendingUp} from 'lucide-react';
import FilterMenu from './FilterMenu.jsx';
import HitRate,{rateStyle} from './HitRate.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
import {priceText} from '../lib/bookLine.js';
import {teamColor} from '../lib/teamColors.js';
import './ModelRecordPicks.css';

const dateLabel=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
const won=r=>r.result==='Hit';
const decided=r=>r.result==='Hit'||r.result==='Miss';
const rate=rows=>{const graded=rows.filter(decided);return graded.length?graded.filter(won).length/graded.length:null};
const fmt=n=>Number.isFinite(Number(n))?Number(n).toFixed(1):'—';
const rateText=n=>n!=null&&Number.isFinite(Number(n))?`${Math.round(Number(n)*100)}%`:'—';
const forecastLabel=r=>r.probabilityCalibrated?'V3 validated line':r.model==='2026.11.v3'?'V3 exploratory estimate':r.model==='2026.11.v2'?'V2 estimate':'Model estimate';
const forecastDetail=r=>r.probabilityCalibrated?'Validated for this market and line':r.probabilitySource==='empirical-oos-residuals'?'Exploratory at this line · alternate thresholds are not independently validated':'Saved pregame estimate · calibration status unavailable';
const statText=r=>r.kind==='touchdown'?`${r.actual??'—'} TD`:r.actual??'—';
const sourceLabel=r=>r.kind==='touchdown'?(r.price==null?'Anytime TD · Odds Unavailable':'Sportsbook Anytime TD'):(r.lineSource==='average'||r.isAverageLine?'Average Line':r.price==null?'Line · Odds Unavailable':'Sportsbook Line');
const sourceType=r=>r.lineSource==='average'||r.isAverageLine?'average':r.price==null?'unavailable':'book';
const resultClass=r=>(r.result||'pending').toLowerCase().replace(' ','-');
const recentResults=r=>Array.isArray(r.values)?r.values.slice(-5):[];

function MiniForm({row}){
  const samples=recentResults(row),max=Math.max(1,...samples.map(v=>Number(v)||0));
  if(!samples.length)return <span className="record-no-sample">No pregame sample saved</span>;
  return <div className="record-form" aria-label="Last saved player game results">
    {samples.map((value,index)=>{
      const push=row.kind!=='touchdown'&&Number(value)===Number(row.line);
      const good=row.kind==='touchdown'?Number(value)>0:row.side==='under'?Number(value)<Number(row.line):Number(value)>Number(row.line);
      return <div className={`record-form-game ${push?'form-push':good?'form-good':'form-bad'}`} key={index} title={`${value} ${row.label || 'stat'} · ${push?'push':good?'hit':'miss'} at saved line`}>
        <i style={{height:`${Math.max(8,Number(value)/max*100)}%`}}/><b>{value}</b>
      </div>;
    })}
  </div>;
}

function SummaryTile({icon:Icon,label,value,detail,tone=''}){
  return <article className={`mr-stat ${tone}`}><span className="mr-stat-icon"><Icon size={17}/></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}

function breakdown(rows){
  const map=new Map();
  for(const row of rows){
    const label=row.kind==='touchdown'?'Anytime Touchdown':`${row.label||row.metric||'Player Prop'} · ${String(row.side||'').toUpperCase()}`;
    if(!map.has(label))map.set(label,[]);
    map.get(label).push(row);
  }
  return [...map].sort((a,b)=>a[0].localeCompare(b[0]));
}

function RecordPick({row}){
  const [open,setOpen]=useState(false);
  const history=recentResults(row),baseline=Number.isFinite(Number(row.adjusted))?row.adjusted:null;
  const observed=Number(row.total)>0?Number(row.hits)/Number(row.total):null;
  const breakeven=Number.isFinite(Number(row.breakEven))?row.breakEven:row.price==null?null:row.price<0?Math.abs(row.price)/(100+Math.abs(row.price)):100/(100+row.price);
  const kickoff=Date.parse(row.kickoff),published=Date.parse(row.saved);
  const opponent=row.team===(row.home||'')?row.away:row.home;
  const injuryEvidence=Array.isArray(row.injuries)?row.injuries:null;
  return <article className={`mr-pick ${open?'is-open':''} ${resultClass(row)}`}>
    <button className="mr-pick-head" type="button" aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
      <span className="mr-rank">#{String(row.rank||'—').padStart(2,'0')}</span>
      <span className="mr-photo" style={{'--club':teamColor(row.team)}}><PlayerPhoto id={row.playerId} name={row.player} url={row.photo}/></span>
      <span className="mr-player"><strong>{row.player||'Player'}</strong><small>{row.team||'NFL'}{row.position?` · ${row.position}`:''} <i>VS</i> {opponent||'Opponent'}</small></span>
      <span className="mr-bet"><strong>{row.kind==='touchdown'?'ANYTIME TD':`${String(row.side||'').toUpperCase()} ${row.line} ${row.label||row.metric||'Prop'}`}</strong><small>{sourceLabel(row)}{row.price!=null?` · ${priceText(row.price)}`:''}</small></span>
      <span className="mr-final"><small>{row.result==='Pending'?'PENDING':'FINAL'}</small><strong>{statText(row)}</strong><em className={`mr-result ${resultClass(row)}`}>{row.result||'Pending'}</em></span>
      <ChevronDown className="mr-chevron" size={18}/>
    </button>
    <div className="mr-pick-glance">
      <span className="mr-glance-date"><CalendarDays size={13}/>{Number.isFinite(kickoff)?dateLabel.format(new Date(kickoff)):row.date||'—'} · {recordPeriod(row,'nfl') ? periodLabel(recordPeriod(row,'nfl'),'nfl') : 'NFL'}</span>
      <span className="mr-glance-form"><small>PRE-GAME FORM</small><MiniForm row={row}/></span>
      <span className="mr-glance-prediction"><small>MODEL EST. HIT RATE</small><b>{rateText(row.modelHitRate)} <i>{forecastLabel(row)} · {observed==null?'prior rate —':`${rateText(observed)} observed · ${row.hits??'—'}/${row.total||history.length||'—'}`}</i></b></span>
    </div>
    {open&&<div className="mr-detail-grid">
      <section className="mr-detail-block"><h3><Activity size={15}/> Locked Performance</h3><dl>
        <div><dt>Line At Publish</dt><dd>{row.kind==='touchdown'?'0.5 TD':`${row.side||'—'} ${row.line??'—'} ${row.label||''}`}</dd></div>
        <div><dt>Sportsbook Price</dt><dd>{row.price==null?'Unavailable':priceText(row.price)}</dd></div>
        <div><dt>Break-Even Rate</dt><dd>{breakeven==null?'—':rateText(breakeven)}</dd></div>
        <div><dt>Model Estimated Hit Rate</dt><dd>{rateText(row.modelHitRate)} <small>{forecastDetail(row)} · saved before kickoff</small></dd></div>
        <div><dt>Ranking Score</dt><dd>{Number.isFinite(Number(row.rankScore))?`${row.rankScore}/100`:'—'} <small>comparative score, not a probability</small></dd></div>
        <div><dt>Observed Prior Hit Rate</dt><dd>{observed==null?'—':rateText(observed)} <small>({row.hits??'—'}/{row.total??'—'})</small></dd></div>
        {baseline!=null&&<div><dt>Smoothed Prior Rate</dt><dd>{rateText(baseline)} <small>adjusted for small samples</small></dd></div>}
        <div><dt>Prior Average</dt><dd>{fmt(row.average)} {row.label||'TD'}</dd></div>
        <div><dt>Model Version</dt><dd>{row.model||'Version not saved'}</dd></div>
      </dl></section>
      <section className="mr-detail-block"><h3><Target size={15}/> Role & Matchup Evidence</h3><dl>
        <div><dt>Workload</dt><dd>{row.role||'No workload snapshot'}</dd></div>
        <div><dt>Defense Rank</dt><dd>{row.defenseRank?`#${row.defenseRank} of ${row.rankCount||32}`:'Unavailable'}</dd></div>
        <div><dt>Red-Zone Opportunities</dt><dd>{row.kind==='touchdown'&&row.chances?`${row.chances.totals?.[0]??0} carries · ${row.chances.totals?.[1]??0} targets over ${row.chances.games} tracked games${row.scoring?.targetShare!=null?` · ${rateText(row.scoring.targetShare)} target share`:''}${row.scoring?.carryShare!=null?` · ${rateText(row.scoring.carryShare)} carry share`:''}`:row.kind==='touchdown'?'Unavailable in saved snapshot':'Not used for this prop type'}</dd></div>
        <div><dt>Top Reason</dt><dd>{row.favoriteReason?.detail?`${row.favoriteReason.label}: ${row.favoriteReason.detail}`:row.context||'No top reason saved'}</dd></div>
        <div><dt>Weather</dt><dd>{row.weather?.details&&row.weather.signal?`${row.weather.details} · ${row.weather.interpretation}`:'No meaningful weather signal saved'}</dd></div>
        <div><dt>Relevant Injuries</dt><dd>{injuryEvidence===null?'Not captured for this archive entry':injuryEvidence.length?injuryEvidence.map(item=>`${item.role} · ${item.name} · ${item.status}${item.injury?' · '+item.injury:''}${item.impact?' · '+item.impact:''}`).join(' / '):'No major role-related injuries identified'}</dd></div>
        <div><dt>Last {history.length||0} Results</dt><dd>{history.length?history.join(' · '):'Unavailable'}</dd></div>
        <div><dt>Published</dt><dd>{Number.isFinite(published)?new Date(published).toLocaleString():'—'}</dd></div>
      </dl></section>
      <p className="mr-caveat">This is the evidence captured with the published pick. Historical hit rate and model ranking are separate measures; neither guarantees the result.</p>
    </div>}
  </article>;
}

export default function ModelRecordPicks({rows=[],kind='props'}){
  const [period,setPeriod]=useState('');
  const [market,setMarket]=useState('all');
  const [status,setStatus]=useState('all');
  const [source,setSource]=useState('all');
  const [model,setModel]=useState('all');
  const [query,setQuery]=useState('');
  const picks=useMemo(()=>rows.filter(row=>kind==='touchdowns'?row.kind==='touchdown':row.kind!=='touchdown'),[rows,kind]);
  const periods=useMemo(()=>[...new Set(picks.map(r=>recordPeriod(r,'nfl')).filter(Boolean))].sort().reverse(),[picks]);
  const selectedPeriod=periods.includes(period)?period:periods[0]||'all';
  const markets=useMemo(()=>[...new Set(picks.map(r=>r.kind==='touchdown'?'Anytime Touchdown':r.label||r.metric).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[picks]);
  const models=useMemo(()=>[...new Set(picks.map(r=>r.model).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[picks]);
  const filtered=useMemo(()=>picks.filter(r=>{
    const label=r.kind==='touchdown'?'Anytime Touchdown':r.label||r.metric;
    const text=`${r.player} ${r.team} ${r.home} ${r.away} ${label}`.toLowerCase();
    return (selectedPeriod==='all'||recordPeriod(r,'nfl')===selectedPeriod)&&(market==='all'||label===market)&&(status==='all'||(r.result||'Pending')===status)&&(source==='all'||sourceType(r)===source)&&(model==='all'||r.model===model)&&(!query||text.includes(query.toLowerCase().trim()));
  }).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||(a.rank||99)-(b.rank||99)),[picks,selectedPeriod,market,status,source,model,query]);
  const hits=filtered.filter(r=>r.result==='Hit').length,misses=filtered.filter(r=>r.result==='Miss').length;
  const pending=filtered.filter(r=>(r.result||'Pending')==='Pending').length,push=filtered.filter(r=>r.result==='Push').length,noStat=filtered.filter(r=>r.result==='No Stat').length;
  const groups=breakdown(filtered);
  const winRate=rate(filtered);
  const allTimeHits=picks.filter(r=>r.result==='Hit').length,allTimeMisses=picks.filter(r=>r.result==='Miss').length;
  const allTimePending=picks.filter(r=>(r.result||'Pending')==='Pending').length;
  const allTimePush=picks.filter(r=>r.result==='Push').length;
  const allTimeNoStat=picks.filter(r=>r.result==='No Stat').length;
  const weekRows=selectedPeriod==='all'?picks:picks.filter(r=>recordPeriod(r,'nfl')===selectedPeriod);
  const weekHits=weekRows.filter(r=>r.result==='Hit').length,weekMisses=weekRows.filter(r=>r.result==='Miss').length;
  const weekPending=weekRows.filter(r=>(r.result||'Pending')==='Pending').length;
  const weekPush=weekRows.filter(r=>r.result==='Push').length;
  const weekNoStat=weekRows.filter(r=>r.result==='No Stat').length;
  const periodTitle=selectedPeriod==='all'?'All Weeks':periodLabel(selectedPeriod,'nfl');
  return <div className="model-record-picks">
    <header className="mr-hero"><div><span className="mr-eyebrow"><span/> PROP BETS · MODEL PERFORMANCE</span><h1>{kind==='touchdowns'?'ANYTIME TOUCHDOWN':'PLAYER PROP'} <em>RECORD</em></h1><p>Each pick keeps its locked line, available odds, model estimate, and pregame evidence.</p></div><div className="mr-hero-mark">{kind==='touchdowns'?<Target size={35}/>:<TrendingUp size={35}/>}<span>LOCKED<br/>PREGAME DATA</span></div></header>
    <div className="mr-period-select"><label><CalendarDays size={16}/> WEEKLY RECORD VIEW <FilterMenu aria-label="Select week for record summary" value={selectedPeriod} onChange={e=>setPeriod(e.target.value)}><option value="all">All Weeks</option>{periods.map(value=><option value={value} key={value}>{periodLabel(value,'nfl')}</option>)}</FilterMenu></label><small>Historical replay picks are excluded from this official record.</small></div>
    <div className="mr-kpis">
      <SummaryTile icon={Activity} label="ALL-TIME SETTLED RECORD" value={`${allTimeHits}–${allTimeMisses}`} detail={`${allTimeHits+allTimeMisses} graded · ${allTimePush} push · ${allTimeNoStat} no stat · ${allTimePending} pending`} tone="purple"/>
      <SummaryTile icon={TrendingUp} label="ALL-TIME HIT RATE" value={rate(picks)==null?'—':rateText(rate(picks))} detail="Official V2 locks · pending excluded" tone={rate(picks)==null?'':rate(picks)>=.55?'green':'red'}/>
      <SummaryTile icon={Target} label={`${periodTitle.toUpperCase()} RECORD`} value={`${weekHits}–${weekMisses}`} detail={`${weekHits+weekMisses} graded · ${weekPush} push · ${weekNoStat} no stat · ${weekPending} pending`} tone="purple"/>
      <SummaryTile icon={Shield} label={`${periodTitle.toUpperCase()} HIT RATE`} value={rate(weekRows)==null?'—':rateText(rate(weekRows))} detail="Selected week · pending excluded" tone={rate(weekRows)==null?'':rate(weekRows)>=.55?'green':'red'}/>
    </div>
    <section className="mr-market-summary"><div className="mr-section-title"><div><span className="mr-eyebrow">PERFORMANCE BREAKDOWN</span><h2>RECORD BY MARKET</h2></div><small>Small samples stay visible so rates are never shown without their count.</small></div>
      {groups.length?<div className="mr-market-grid">{groups.map(([label,group])=>{const graded=group.filter(decided),wins=graded.filter(won).length;return <article className="mr-market-card" key={label}><div><strong>{label}</strong><span>{group.length} PICKS</span></div><b style={rateStyle(rate(group))}>{graded.length?rateText(wins/graded.length):'—'}</b><small>{wins}W – {graded.length-wins}L <i>· {group.filter(r=>(r.result||'Pending')==='Pending').length} pending</i></small><div className="mr-rate-rail"><i style={{width:`${graded.length?100*wins/graded.length:0}%`}}/></div></article>})}</div>:<div className="mr-empty">No market results match these filters yet.</div>}
    </section>
    <section className="mr-archive">
      <div className="mr-section-title"><div><span className="mr-eyebrow">PICK ARCHIVE</span><h2>EVERY LOCKED PICK</h2></div><span className="mr-count">{filtered.length} RECORDS</span></div>
      <div className="mr-filters">
        <label><Target size={15}/> MARKET <FilterMenu aria-label="Filter by market" value={market} onChange={e=>setMarket(e.target.value)}><option value="all">All Markets</option>{markets.map(value=><option value={value} key={value}>{value}</option>)}</FilterMenu></label>
        <label><Filter size={15}/> RESULT <FilterMenu aria-label="Filter by result" value={status} onChange={e=>setStatus(e.target.value)}>{['all','Hit','Miss','Pending','Push','No Stat'].map(value=><option key={value} value={value}>{value==='all'?'All Results':value}</option>)}</FilterMenu></label>
        <label><TrendingUp size={15}/> LINE TYPE <FilterMenu aria-label="Filter by line source" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All Lines</option><option value="book">Sportsbook Lines</option><option value="average">Average Lines</option><option value="unavailable">Odds Unavailable</option></FilterMenu></label>
        <label><Activity size={15}/> MODEL VERSION <FilterMenu aria-label="Filter by model version" value={model} onChange={e=>setModel(e.target.value)}><option value="all">All Versions</option>{models.map(value=><option value={value} key={value}>{value}</option>)}</FilterMenu></label>
        <label className="mr-search"><Search size={16}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, team, market…" aria-label="Search picks"/></label>
      </div>
      <div className="mr-totals"><strong><i>{hits} HIT</i><b>{misses} MISS</b><span>{push} PUSH</span><em>{pending} PENDING</em></strong><small>Hit rate counts only graded wins and losses. Pushes, no-stat games, and pending picks are excluded.</small></div>
      <div className="mr-pick-list">{filtered.length?filtered.map((row,index)=><RecordPick row={row} key={`${row.gameId}-${row.playerId}-${row.metric}-${row.rank}-${index}`}/>):<div className="mr-empty">No archived picks match this selection.</div>}</div>
      <p className="mr-footnote">Game moneyline predictions will have a separate record and evaluation model when the Games tab is built.</p>
    </section>
  </div>;
}
