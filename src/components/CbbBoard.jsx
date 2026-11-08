import PlayerPhoto from './PlayerPhoto.jsx';
import {teamColor} from '../lib/teamColors.js';
import TrackedPicks from './TrackedPicks.jsx';
import {PickReport} from './MatchReport.jsx';
import {MatchCard} from './Research.jsx';
import ConferenceFilter from './ConferenceFilter.jsx';
import React,{useMemo,useState} from 'react';
import {manualMarkets,seasonLabel} from '../lib/manualSports.js';
import {useLeague} from './ManualLeague.jsx';
import {useCbbFile} from './CbbAnalyzer.jsx';
import HitRate from './HitRate.jsx';
import LineSelect from './LineSelect.jsx';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
import {isHit} from '../lib/stats.js';

export default function CbbBoard({initialRanked=false,top,onOpen}){
  const sport=useLeague(),markets=manualMarkets(sport);
  const fallback=sport==='cfb'?'passingYards':'points';
  const [sort,setSort]=useState(initialRanked?'rate':'player');
  const [custom,setCustom]=useState(false);
  const index=useCbbFile('index.json');
  const [year,setYear]=useState('');
  const season=year || index.data?.seasons[0];
  const meta=useCbbFile(season ? season+'/teams.json' : null);
  const board=useCbbFile(season ? season+'/board.json' : null);
  const schedule=useCbbFile(top && season ? season+'/schedule.json':null);
  const [team,setTeam]=useState(''),[search,setSearch]=useState('');
  const [metric,setMetric]=useState(fallback),[line,setLine]=useState(markets[fallback].defaultLine);
  const [side,setSide]=useState('over'),[minimum,setMinimum]=useState(top?2:1),[limit,setLimit]=useState(40);
  const [conference,setConference]=useState('');
  const teams=Object.entries(meta.data?.teams || {}).filter(([id])=>!conference || meta.data?.conferences?.[id]===conference).sort((a,b)=>a[1].localeCompare(b[1]));
  const rows=useMemo(()=>{
    const results=[];
    for(const p of board.data || []){
      if(conference && meta.data?.conferences?.[p.team] !== conference) continue;
      if((team&&p.team!==team)||!p.name?.toLowerCase().includes(search.trim().toLowerCase())) continue;
      const values=p.recent[metric];
      if(!values?.length || (sport==='cfb' && !values.some(v=>v!==0)) || values.length<minimum) continue;
      const hits=values.filter(n=>isHit(n,line,side)).length;
      results.push({p,hits,total:values.length,rate:hits/values.length,avg:values.reduce((a,b)=>a+b,0)/values.length});
    }
    return results.sort((a,b)=>(sort==='rate' && (b.rate-a.rate || b.total-a.total)) || a.p.name.localeCompare(b.p.name));
  },[sport,board.data,meta.data,conference,team,search,metric,line,side,minimum,sort]);
  const failed=[index,meta,board].find(x=>x.error);
  if(top && !custom)return <><TrackedPicks sport={sport} onOpen={r=>onOpen({player:r.playerId,team:r.team,season:r.season,metric:r.metric,line:r.line,side:r.side})}/><button className="outline-button" onClick={()=>setCustom(true)}>Explore Custom Lines</button></>;
  return <section className="panel props-board cbb-board">{top&&<button className="outline-button" onClick={()=>setCustom(false)}>← Published Top Props</button>}<header><h1>{sport.toUpperCase()} {top?'Custom Line Research':'Props Board'}</h1>
    <p>Manual Lines · Last 10 Recorded Games · {rows.length} Players</p></header>
    <div className="board-controls">
      <label>Season<select value={season || ''} onChange={e=>{setYear(Number(e.target.value));setConference('');setTeam('');}}>{index.data?.seasons.map(y=><option key={y} value={y}>{seasonLabel(sport,y)}</option>)}</select></label>
      {sport!=='nba' && <ConferenceFilter metadata={meta.data} value={conference} onChange={value=>{setConference(value);setTeam('');setLimit(40);}}/>}
      <label>Team<select value={team} onChange={e=>setTeam(e.target.value)}><option value="">All Teams</option>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Stat<select value={metric} onChange={e=>{setMetric(e.target.value);setLine(markets[e.target.value].defaultLine);}}>{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
      <label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      {!top && <label>Sort By<select value={sort} onChange={e=>setSort(e.target.value)}><option value="player">Player Name</option><option value="rate">Last 10 Hit Rate</option></select></label>}
      <label>Minimum Games<select value={minimum} onChange={e=>setMinimum(Number(e.target.value))}>{(top?[2,3,5,10]:[1,3,5,10]).map(n=><option key={n}>{n}</option>)}</select></label>
      <label>Player<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find Player"/></label>
    </div><div className="cbb-line"><LineSelect key={metric} markets={markets} metric={metric} value={line} onChange={setLine}/></div>
    {failed ? <p role="status">Box Scores Unavailable. <button onClick={failed.reload}>Retry</button></p> : !board.data || !meta.data ? <p role="status">Loading Player Results…</p> :
    top ? <CollegePicks rows={rows} schedule={schedule} meta={meta.data} metric={metric} line={line} side={side} onOpen={p=>onOpen({player:p.id,team:p.team,season,metric,line,side})}/> :
    <div className="board-scroll"><table className="game-log"><thead><tr>{['Player','Team','Manual Line','Average','Hit Rate'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>
      {rows.slice(0,limit).map(({p,hits,total,rate,avg})=><tr key={p.team+'-'+p.id}><td className="team-edge" style={{'--team-color':teamColor(p.team,meta.data?.colors || {})}}><button className="board-player" onClick={()=>onOpen({player:p.id,team:p.team,season,metric,line,side})}><PlayerPhoto id={p.id} name={p.name}/> {p.name}</button></td><td>{meta.data.teams[p.team]}</td><td>{side==='over'?'Over':'Under'} {line}</td><td>{avg.toFixed(1)}</td><td><HitRate rate={rate}/> ({hits}/{total})</td></tr>)}
    </tbody></table>{!rows.length&&<p>No Players Match These Filters.</p>}</div>}
    {!top && rows.length>limit && <button className="outline-button" onClick={()=>setLimit(n=>n+40)}>Show More Players</button>}
  </section>;
}

function CollegePicks({rows,schedule,meta,metric,line,side,onOpen}){
  const sport=useLeague(),markets=manualMarkets(sport);
  const [selectedDate,setSelectedDate]=useState('');
  const upcoming=(schedule.data || []).filter(game=>!game.final && Date.parse(game.kickoff)>Date.now());
  const dates=[...new Set(upcoming.map(game=>recordPeriod(game,sport)).filter(Boolean))].sort();
  const date=dates.includes(selectedDate)?selectedDate:dates[0];
  const next=new Map();
  for(const game of upcoming){
    if(recordPeriod(game,sport)!==date)continue;
    for(const team of [game.away,game.home])if(!next.has(team))next.set(team,game);
  }
  const score=r=>(r.hits+2)/(r.total+4);
  const picks=rows.filter(r=>next.has(r.p.team) && (sport==='cfb' || r.p.minutes>=15) && score(r)>.5)
    .sort((a,b)=>score(b)-score(a) || b.p.minutes-a.p.minutes).slice(0,9);
  return <><div className="board-controls"><label>Game {sport==='cfb'?'Week':'Date'}<select value={date || ''} disabled={!dates.length} onChange={e=>setSelectedDate(e.target.value)}>
      {!dates.length && <option value="">No Dates Available</option>}{dates.map(d=><option key={d} value={d}>{periodLabel(d,sport)}</option>)}
    </select></label></div><p>Manual Research Line · Ranked by recent hit rate with four games of 50% prior weight. {sport!=='cfb' && 'Players must average at least 15 minutes.'}</p>
    <div className="research-grid picks-grid">{picks.map(({p,hits,total,avg},i)=>{
      const game=next.get(p.team),opp=game.home===p.team?game.away:game.home;
      const rank=meta.ranks?.[opp]?.[metric];
      return <MatchCard key={p.team+p.id} game={game} colors={meta.colors || {}}><PickReport playerId={p.id} number={i+1} name={p.name} side={side} line={line} metric={markets[metric].label} price="Manual Line" hits={hits} total={total} average={avg} rank={rank} rankCount={Object.keys(meta.ranks || {}).length} results={p.recent[metric]} reason={<>At this line, the sample-adjusted hit rate is <HitRate rate={(hits+2)/(total+4)}/>. {sport!=='cfb' && p.name+' averaged '+p.minutes+' minutes per game.'}</>} onOpen={()=>onOpen(p)}/></MatchCard>;
    })}</div>{!picks.length && <p>{schedule.error?<button onClick={schedule.reload}>Schedule Unavailable · Retry</button>:schedule.data?'No Upcoming Players Meet These Filters.':'Loading Schedule…'}</p>}</>;
}
