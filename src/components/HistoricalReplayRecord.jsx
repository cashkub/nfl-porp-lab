import React,{useEffect,useMemo,useState} from 'react';
import {Activity,CalendarDays,Filter,Info,Search,Target,TrendingUp} from 'lucide-react';
import FilterMenu from './FilterMenu.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {teamColor} from '../lib/teamColors.js';
import {METRICS} from '../lib/stats.js';
import {formatRate} from '../lib/stats.js';
import {rateStyle} from './HitRate.jsx';
import './HistoricalReplayRecord.css';

const RESULT_OPTIONS=['Hit','Miss','No Stat','Pending','Push'];
const labelFor=pick=>pick.metric==='scoredTDs'?'Anytime Touchdown':METRICS[pick.metric]?.label||pick.metric;
const statusFor=pick=>pick.settlement?.result||'Pending';
const estText=value=>Number.isFinite(Number(value))?formatRate(Number(value)):'—';

function Summary({icon:Icon,label,value,detail,tone=''}){
  return <article className={'hrr-stat '+tone}><span><Icon size={17}/></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}

export default function HistoricalReplayRecord(){
  const [archive,setArchive]=useState(null);
  const [type,setType]=useState('all');
  const [date,setDate]=useState('all');
  const [market,setMarket]=useState('all');
  const [result,setResult]=useState('all');
  const [source,setSource]=useState('all');
  const [query,setQuery]=useState('');
  useEffect(()=>{let active=true;fetch((import.meta.env.BASE_URL||'/')+'data/nfl-v2-replay.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(active&&data?.schemaVersion===1)setArchive(data);}).catch(()=>{});return()=>{active=false;};},[]);
  const allRows=useMemo(()=>archive?.days?.flatMap(day=>['props','anytime'].flatMap(kind=>(day.picks?.[kind]||[]).map(pick=>({...pick,replayKind:kind,replayDate:day.date,replayLabel:day.label,replayAsOf:day.asOf}))))||[],[archive]);
  const dates=useMemo(()=>archive?.days?.map(day=>({value:day.date,label:day.label}))||[],[archive]);
  const markets=useMemo(()=>[...new Set(allRows.map(labelFor))].sort((a,b)=>a.localeCompare(b)),[allRows]);
  const rows=useMemo(()=>allRows.filter(pick=>{
    const text=`${pick.player?.name||''} ${pick.player?.team||''} ${pick.game?.home||''} ${pick.game?.away||''} ${labelFor(pick)}`.toLowerCase();
    const lineSource=pick.quote?.isBookLine?'book':pick.quote?.anytime?'unavailable':'average';
    return (type==='all'||pick.replayKind===type)&&(date==='all'||pick.replayDate===date)&&(market==='all'||labelFor(pick)===market)&&(result==='all'||statusFor(pick)===result)&&(source==='all'||lineSource===source)&&(!query||text.includes(query.toLowerCase().trim()));
  }),[allRows,type,date,market,result,source,query]);
  if(!archive)return <div className="hrr-loading">{allRows.length?'Loading replay record…':'Loading Week 9 replay archive…'}</div>;
  const wins=rows.filter(p=>statusFor(p)==='Hit').length,losses=rows.filter(p=>statusFor(p)==='Miss').length;
  const pushes=rows.filter(p=>statusFor(p)==='Push').length,noStat=rows.filter(p=>statusFor(p)==='No Stat').length,pending=rows.filter(p=>statusFor(p)==='Pending').length;
  const graded=wins+losses,hitRate=graded?wins/graded:null;
  return <div className="historical-replay-record">
    <header className="hrr-header"><div><span className="hrr-kicker"><i/> SEPARATE HISTORICAL TRACKER · V2</span><h1>WEEK 9 <em>REPLAY RECORD</em></h1><p>Simulated picks are tracked here with outcomes, while the official V2 record only counts prospective locks.</p></div><div className="hrr-stamp"><Activity size={24}/><b>REPLAY<br/>ARCHIVE</b></div></header>
    <aside className="hrr-disclaimer"><strong><Info size={16}/> HISTORICAL REPLAY · NOT LIVE PICKS</strong><p>{archive.disclaimer}</p><small>{archive.coverageNote} This section is excluded from the official all-time and weekly records.</small></aside>
    <div className="hrr-filter-panel"><label><CalendarDays size={15}/> SLATE <FilterMenu aria-label="Filter replay by date" value={date} onChange={e=>setDate(e.target.value)}><option value="all">All Replay Dates</option>{dates.map(day=><option value={day.value} key={day.value}>{day.label}</option>)}</FilterMenu></label><label><Target size={15}/> PICK TYPE <FilterMenu aria-label="Filter replay by pick type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All Types</option><option value="anytime">Anytime Touchdowns</option><option value="props">Player Props</option></FilterMenu></label><label><TrendingUp size={15}/> MARKET <FilterMenu aria-label="Filter replay by market" value={market} onChange={e=>setMarket(e.target.value)}><option value="all">All Markets</option>{markets.map(item=><option value={item} key={item}>{item}</option>)}</FilterMenu></label><label><Filter size={15}/> RESULT <FilterMenu aria-label="Filter replay by result" value={result} onChange={e=>setResult(e.target.value)}><option value="all">All Results</option>{RESULT_OPTIONS.map(item=><option value={item} key={item}>{item}</option>)}</FilterMenu></label><label><Activity size={15}/> LINE SOURCE <FilterMenu aria-label="Filter replay by line source" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All Lines</option><option value="unavailable">Odds Unavailable</option><option value="average">Player Average Lines</option><option value="book">Sportsbook Lines</option></FilterMenu></label><label className="hrr-search"><Search size={15}/><input type="search" placeholder="Search player, team, or matchup" aria-label="Search replay picks" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="hrr-stats"><Summary icon={Activity} label="REPLAY RECORD" value={`${wins}–${losses}`} detail={`${graded} graded · ${pushes} push · ${noStat} no stat · ${pending} pending`} tone="purple"/><Summary icon={TrendingUp} label="REPLAY HIT RATE" value={hitRate==null?'—':formatRate(hitRate)} detail={`${wins} hits of ${graded} graded · filters applied`} tone={hitRate==null?'':hitRate>=.55?'green':'red'}/><Summary icon={Target} label="TRACKED PICKS" value={rows.length} detail="Replay picks in this view"/><Summary icon={Info} label="MODEL ESTIMATE" value="Saved V2" detail="Original pregame projection retained"/></div>
    <div className="hrr-table-wrap"><table className="hrr-table"><thead><tr><th>RANK</th><th>PLAYER</th><th>SLATE / MATCHUP</th><th>REPLAY PICK</th><th>MODEL EST.</th><th>RESULT</th><th>ACTUAL</th><th>TOP REASON</th></tr></thead><tbody>{rows.length?rows.map((pick,index)=>{
      const settlement=pick.settlement||{};const status=settlement.result||'Pending';const kind=pick.replayKind==='anytime';const team=pick.player?.team;const source=pick.quote?.anytime?(pick.quote.isBookLine?'ANYTIME TD ODDS':'MODEL ESTIMATE · NO ODDS'):pick.quote?.isBookLine?'SPORTSBOOK LINE':'PLAYER AVERAGE LINE';
      return <tr key={`${pick.replayDate}-${pick.replayKind}-${pick.game?.id}-${pick.player?.id}-${pick.metric}-${index}`}>
        <td><span className="hrr-rank">{String(pick.replayRank||index+1).padStart(2,'0')}</span></td>
        <td><div className="hrr-player" style={{'--hrr-team':teamColor(team)||'#a775cf'}}><PlayerPhoto id={pick.player?.id} name={pick.player?.name} url={pick.player?.photo}/><span><b>{pick.player?.name}</b><small>{team} · {pick.player?.position}</small></span></div></td>
        <td><b>{pick.replayLabel}</b><small>{pick.game?.away} at {pick.game?.home}</small></td>
        <td><b>{kind?'ANYTIME TD · YES':`${String(pick.side||'').toUpperCase()} ${pick.line} ${labelFor(pick)}`}</b><small>{source}{pick.quote?.over!=null?' · '+(pick.side==='under'?'NO ':'YES ')+(pick.side==='under'?pick.quote.under:pick.quote.over):' · Odds unavailable'}</small></td>
        <td><b className="hrr-est" style={rateStyle(pick.chance)}>{estText(pick.chance)}</b><small>{Number.isFinite(pick.projection)?`Proj. ${pick.projection.toFixed(1)}`:'Pregame estimate'}</small></td>
        <td><span className={'hrr-result '+status.toLowerCase().replaceAll(' ','-')}>{status}</span></td>
        <td><b>{settlement.actual==null?'—':kind?`${settlement.actual} TD`:settlement.actual}</b></td>
        <td><details className="hrr-reason"><summary>{pick.favoriteReason?.label||'Pick Rationale'}</summary><p>{pick.favoriteReason?.detail||'No saved top reason.'}</p><small>Snapshot: {new Date(pick.replayAsOf).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} ET · {pick.replaySnapshot}</small></details></td>
      </tr>;
    }):<tr><td colSpan="8" className="hrr-no-rows">No replay picks match these filters.</td></tr>}</tbody></table></div>
    <p className="hrr-footnote">Replay hit rate uses only settled wins and losses in the selected view. Pushes, no-stat games, and pending picks are excluded. It is not part of the official V2 record.</p>
  </div>;
}
