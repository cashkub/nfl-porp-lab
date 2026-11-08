import {BoardPlayerPicker} from './PlayerStepper.jsx';
import GameFilter, {useGameFilter} from './GameFilter.jsx';
import SortableTable from './SortableTable.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {teamColor} from '../lib/teamColors.js';
import TrackedPicks from './TrackedPicks.jsx';
import {PickReport} from './MatchReport.jsx';
import {MatchCard} from './Research.jsx';
import ConferenceFilter from './ConferenceFilter.jsx';
import React,{useMemo,useState} from 'react';
import {cfbRoleGames,manualMarkets,seasonLabel} from '../lib/manualSports.js';
import {useLeague} from './ManualLeague.jsx';
import {useCbbFile} from './CbbAnalyzer.jsx';
import HitRate from './HitRate.jsx';
import LineSelect from './LineSelect.jsx';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
import {isHit} from '../lib/stats.js';

export default function CbbBoard({initialRanked=false,top,onOpen}){
  const sport=useLeague(),markets=manualMarkets(sport);
  const fallback=sport==='cfb'?'passingYards':'points';
  const [sort,setSort]=useState({column:initialRanked?4:0,asc:!initialRanked});
  const [custom,setCustom]=useState(false);
  const index=useCbbFile('index.json');
  const [year,setYear]=useState('');
  const season=year || index.data?.seasons[0];
  const meta=useCbbFile(season ? season+'/teams.json' : null);
  const board=useCbbFile(season ? season+'/board.json' : null);
  const schedule=useCbbFile(season ? season+'/schedule.json':null);
  const [team,setTeam]=useState(''),[search,setSearch]=useState('');
  const [metric,setMetric]=useState(fallback),[line,setLine]=useState(markets[fallback].defaultLine);
  const [side,setSide]=useState('over'),[minimum,setMinimum]=useState(top?2:1),[limit,setLimit]=useState(40);
  const [conference,setConference]=useState('');
  const gameFilter=useGameFilter(sport,season,schedule.data);
  const teams=Object.entries(meta.data?.teams || {}).filter(([id])=>top || gameFilter.allows(id)).filter(([id])=>!conference || meta.data?.conferences?.[id]===conference).sort((a,b)=>a[1].localeCompare(b[1]));
  const candidates=useMemo(()=>{
    const results=[];
    for(const p of board.data || []){
      if(!top && !gameFilter.allows(p.team)) continue;
      if(conference && meta.data?.conferences?.[p.team] !== conference) continue;
      if((team&&p.team!==team)||!p.name) continue;
      for (const category of metric ? [metric] : Object.keys(markets)) {
      const threshold = metric ? line : markets[category].defaultLine;
      const values=p.recent[category];
      if(!values?.length || (sport==='cfb' && cfbRoleGames(p,category)<minimum) || values.length<minimum) continue;
      const hits=values.filter(n=>isHit(n,threshold,side)).length;
      results.push({p,metric:category,line:threshold,hits,total:values.length,rate:hits/values.length,avg:values.reduce((a,b)=>a+b,0)/values.length});
      }
    }
    return results;
  },[top,gameFilter.date,gameFilter.match,schedule.data,sport,board.data,meta.data,conference,team,metric,line,side,minimum]);
  const rows=candidates.filter(({p})=>p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const failed=[index,meta,board].find(x=>x.error);
  if(top && !custom)return <><TrackedPicks sport={sport} onOpen={r=>onOpen({player:r.playerId,team:r.team,season:r.season,metric:r.metric,line:r.line,side:r.side})}/><button className="outline-button" onClick={()=>setCustom(true)}>Explore Custom Lines</button></>;
  return <section className="panel props-board cbb-board">{top&&<button className="outline-button" onClick={()=>setCustom(false)}>← Published Top Props</button>}<header><h1>{sport.toUpperCase()} {top?'Custom Line Research':'Props Board'}</h1>
    <p>Manual Lines · Last 10 Recorded Games · {rows.length} Props</p></header>
    <div className="board-controls">
      <label>Season<select value={season || ''} onChange={e=>{setYear(Number(e.target.value));setConference('');setTeam('');}}>{index.data?.seasons.map(y=><option key={y} value={y}>{seasonLabel(sport,y)}</option>)}</select></label>
      {sport!=='nba' && <ConferenceFilter metadata={meta.data} value={conference} onChange={value=>{setConference(value);setTeam('');setLimit(40);}}/>}
      {!top && <GameFilter filter={gameFilter} onChange={()=>{setConference('');setTeam('');setSearch('');setMetric('');setLimit(40);}}/>}
      <label>Team<select value={team} onChange={e=>{setTeam(e.target.value);setLimit(40)}}><option value="">{gameFilter.game && !top ? "Both Teams" : "All Teams"}</option>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Stat<select value={metric} onChange={e=>{setMetric(e.target.value);if(e.target.value)setLine(markets[e.target.value].defaultLine);}}>{!top && <option value="">All Stats</option>}{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
      <label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      {!top && <label>Sort By<select value={sort.column} onChange={e=>{const column=Number(e.target.value);setSort({column,asc:column<3});}}>{['Player','Team','Manual Line','Average','Hit Rate',...(sport==='cfb'?['Games With Role']:[])].map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label>}
      <label>{sport==='cfb'?'Min. Games With Role':'Minimum Games'}<select value={minimum} onChange={e=>setMinimum(Number(e.target.value))}>{(top?[2,3,5,10]:[1,3,5,10]).map(n=><option key={n}>{n}</option>)}</select></label>
      <BoardPlayerPicker names={candidates.map(r=>r.p.name)} value={search} onSelect={value=>{setSearch(value);setLimit(40);}}/>
    </div>{metric && <div className="cbb-line"><LineSelect key={metric} markets={markets} metric={metric} value={line} onChange={setLine}/></div>}
    {failed ? <p role="status">Box Scores Unavailable. <button onClick={failed.reload}>Retry</button></p> : !board.data || !meta.data ? <p role="status">Loading Player Results…</p> :
    top ? <CollegePicks rows={rows} schedule={schedule} meta={meta.data} metric={metric} line={line} side={side} onOpen={p=>onOpen({player:p.id,team:p.team,season,metric,line,side})}/> :
    <div className="board-scroll"><SortableTable headers={['Player','Team','Manual Line','Average','Hit Rate',...(sport==='cfb'?['Games With Role']:[])]} rows={rows} sort={sort} onSort={setSort} limit={limit} descending={[3,4,5]}
      values={({p,avg,rate,metric,line})=>[p.name,meta.data.teams[p.team],line,avg,rate,sport==='cfb'?cfbRoleGames(p,metric):null]}
      renderRow={({p,hits,total,rate,avg,metric,line})=><tr key={p.team+'-'+p.id+'-'+metric}><td className="team-edge" style={{'--team-color':teamColor(p.team,meta.data?.colors || {})}}><button className="board-player" onClick={()=>onOpen({player:p.id,team:p.team,season,metric,line,side})}><PlayerPhoto id={p.id} name={p.name}/> {p.name}</button></td><td>{meta.data.teams[p.team]}</td><td>{markets[metric].label} · {side==='over'?'Over':'Under'} {line}</td><td>{avg.toFixed(1)}</td><td><HitRate rate={rate}/> ({hits}/{total})</td>{sport==='cfb' && <td>{cfbRoleGames(p,metric)} of {total}</td>}</tr>}/>{!rows.length&&<p>No Players Match These Filters.</p>}</div>}
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
