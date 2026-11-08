import {PickReport} from './MatchReport.jsx';
import {MatchCard} from './Research.jsx';
import ConferenceFilter from './ConferenceFilter.jsx';
import React,{useMemo,useState} from 'react';
import {useCbbFile,markets} from './CbbAnalyzer.jsx';
import HitRate from './HitRate.jsx';
import LineSelect from './LineSelect.jsx';
import {isHit} from '../lib/stats.js';

export default function CbbBoard({ranked,top,onOpen}){
  const index=useCbbFile('index.json');
  const [year,setYear]=useState('');
  const season=year || index.data?.seasons[0];
  const meta=useCbbFile(season ? season+'/teams.json' : null);
  const board=useCbbFile(season ? season+'/board.json' : null);
  const schedule=useCbbFile(top && season ? season+'/schedule.json':null);
  const [team,setTeam]=useState(''),[search,setSearch]=useState('');
  const [metric,setMetric]=useState('points'),[line,setLine]=useState(markets.points.defaultLine);
  const [side,setSide]=useState('over'),[minimum,setMinimum]=useState(top?2:1),[limit,setLimit]=useState(40);
  const [conference,setConference]=useState('');
  const teams=Object.entries(meta.data?.teams || {}).filter(([id])=>!conference || meta.data?.conferences?.[id]===conference).sort((a,b)=>a[1].localeCompare(b[1]));
  const rows=useMemo(()=>{
    const results=[];
    for(const p of board.data || []){
      if(conference && meta.data?.conferences?.[p.team] !== conference) continue;
      if((team&&p.team!==team)||!p.name?.toLowerCase().includes(search.trim().toLowerCase())) continue;
      const values=p.recent[metric];
      if(!values?.length || values.length<minimum) continue;
      const hits=values.filter(n=>isHit(n,line,side)).length;
      results.push({p,hits,total:values.length,rate:hits/values.length,avg:values.reduce((a,b)=>a+b,0)/values.length});
    }
    return results.sort((a,b)=>(ranked && (b.rate-a.rate || b.total-a.total)) || a.p.name.localeCompare(b.p.name));
  },[board.data,meta.data,conference,team,search,metric,line,side,minimum,ranked]);
  const failed=[index,meta,board].find(x=>x.error);
  return <section className="panel props-board cbb-board"><header><h1>CBB {top?'Top 8':ranked?'Best Hit Rates':'Props Board'}</h1>
    <p>Manual Lines · Last 10 Recorded Games · {rows.length} Players</p></header>
    <div className="board-controls">
      <label>Season<select value={season || ''} onChange={e=>{setYear(Number(e.target.value));setConference('');setTeam('');}}>{index.data?.seasons.map(y=><option key={y} value={y}>{y-1}–{String(y).slice(-2)}</option>)}</select></label>
      <ConferenceFilter metadata={meta.data} value={conference} onChange={value=>{setConference(value);setTeam('');setLimit(40);}}/>
      <label>Team<select value={team} onChange={e=>setTeam(e.target.value)}><option value="">All Teams</option>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Stat<select value={metric} onChange={e=>{setMetric(e.target.value);setLine(markets[e.target.value].defaultLine);}}>{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
      <label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      <label>Minimum Games<select value={minimum} onChange={e=>setMinimum(Number(e.target.value))}>{(top?[2,3,5,10]:[1,3,5,10]).map(n=><option key={n}>{n}</option>)}</select></label>
      <label>Player<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find Player"/></label>
    </div><div className="cbb-line"><LineSelect key={metric} markets={markets} metric={metric} value={line} onChange={setLine}/></div>
    {failed ? <p role="status">Box Scores Unavailable. <button onClick={failed.reload}>Retry</button></p> : !board.data || !meta.data ? <p role="status">Loading Player Results…</p> :
    top ? <CollegePicks rows={rows} schedule={schedule} meta={meta.data} metric={metric} line={line} side={side} onOpen={p=>onOpen({player:p.id,team:p.team,season,metric,line,side})}/> :
    <div className="board-scroll"><table className="game-log"><thead><tr>{['Player','Team','Manual Line','Average','Hit Rate'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>
      {rows.slice(0,limit).map(({p,hits,total,rate,avg})=><tr key={p.team+'-'+p.id}><td><button className="board-player" onClick={()=>onOpen({player:p.id,team:p.team,season,metric,line,side})}>{p.name}</button></td><td>{meta.data.teams[p.team]}</td><td>{side==='over'?'Over':'Under'} {line}</td><td>{avg.toFixed(1)}</td><td><HitRate rate={rate}/> ({hits}/{total})</td></tr>)}
    </tbody></table>{!rows.length&&<p>No Players Match These Filters.</p>}</div>}
    {!top && rows.length>limit && <button className="outline-button" onClick={()=>setLimit(n=>n+40)}>Show More Players</button>}
  </section>;
}

function CollegePicks({rows,schedule,meta,metric,line,side,onOpen}){
  const next=new Map();
  for(const game of schedule.data || []){
    const kickoff=Date.parse(game.kickoff);
    if(game.final || kickoff<=Date.now() || kickoff>Date.now()+7*86400000)continue;
    for(const team of [game.away,game.home])if(!next.has(team))next.set(team,game);
  }
  const score=r=>(r.hits+2)/(r.total+4);
  const picks=rows.filter(r=>next.has(r.p.team) && r.p.minutes>=15 && score(r)>.5)
    .sort((a,b)=>score(b)-score(a) || b.p.minutes-a.p.minutes).slice(0,8);
  return <><p>Upcoming Games · Manual Research Line · Ranked by recent hit rate with four games of 50% prior weight. Players must average at least 15 minutes.</p>
    <div className="research-grid picks-grid">{picks.map(({p,hits,total,avg},i)=>{
      const game=next.get(p.team),opp=game.home===p.team?game.away:game.home;
      const rank=meta.ranks?.[opp]?.[metric];
      return <MatchCard key={p.team+p.id} game={game} colors={meta.colors || {}}><PickReport number={i+1} name={p.name} side={side} line={line} metric={markets[metric].label} price="Manual Line" hits={hits} total={total} average={avg} rank={rank} results={p.recent[metric]} reason={'At this line, the sample-adjusted hit rate is '+(100*(hits+2)/(total+4)).toFixed(1)+'%. '+p.name+' averaged '+p.minutes+' minutes per game.'} onOpen={()=>onOpen(p)}/></MatchCard>;
    })}</div>{!picks.length && <p>{schedule.error?<button onClick={schedule.reload}>Schedule Unavailable · Retry</button>:schedule.data?'No Upcoming Players Meet These Filters.':'Loading Schedule…'}</p>}</>;
}
