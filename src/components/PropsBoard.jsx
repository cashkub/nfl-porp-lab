import FilterMenu from './FilterMenu.jsx';
import {BoardPlayerPicker} from './PlayerStepper.jsx';
import GameFilter from './GameFilter.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {teamColor} from '../lib/teamColors.js';
import {availableStats} from '../lib/availableStats.js';
import HitRate, {DefenseRank} from './HitRate.jsx';
import React, {useMemo, useState} from 'react';
import {fairSideProbability,playerKey, priceText} from '../lib/bookLine.js';
import {METRICS, getPlayerGames, summarize,estimateModelHitRate} from '../lib/stats.js';
import {defenseTable} from '../lib/matchup.js';

const teamCode = t => ({LA:'LAR',WSH:'WAS',JAC:'JAX'}[t] || t);
const day = date => new Date(date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const gameTime = date => new Date(date).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});

export default function PropsBoard({gameFilter,fixedGame,title = fixedGame ? 'Matchup Player Props' : 'Props Board',initialRanked=false,games,schedule,players,season,now,onOpen}) {
  const [team,setTeam] = useState('');
  const [stat,setStat] = useState('');
  const [side,setSide] = useState(initialRanked ? 'both' : 'over');
  const [sort,setSort] = useState(initialRanked ? 'rate' : 'kickoff');
  const [ascending,setAscending] = useState(!initialRanked);
  const [minimum,setMinimum] = useState(initialRanked?'5':'0');
  const [search,setSearch] = useState('');
  const [limit,setLimit] = useState(30);
  const touchdown = stat==='passingTDs' || stat==='scoredTDs';
  const slate = useMemo(()=>{
    const upcoming=games.filter(g=>Date.parse(g.kickoff)>now);
    if(touchdown){
      for(const g of schedule || []){
        const start=Date.parse(g.kickoff);
        if(start<=now || start-now>7*86400000)continue;
        if(!upcoming.some(b=>b.home===g.home && b.away===g.away && Math.abs(Date.parse(b.kickoff)-start)<12*3600000)){
          upcoming.push({...g,lines:[]});
        }
      }
    }
    return upcoming.sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  },[games,schedule,now,touchdown]);
  const rows = useMemo(()=>{
    const names = new Map(), rankCache = new Map();
    for (const p of players) {
      const history = getPlayerGames(p,season);
      if (!history.length) continue;
      const key = playerKey(p.name);
      if (!names.has(key)) names.set(key,[]);
      names.get(key).push({p,team:teamCode(history.at(-1).team || p.team),history});
    }
    return slate.flatMap(g=>{
      const lines=[...g.lines];
      if(touchdown){
        const priced=new Set(lines.filter(l=>l.metric===stat).map(l=>playerKey(l.player)));
        for(const [key,entries] of names){
          if(priced.has(key))continue;
          for(const e of entries){
            if(e.team!==g.home && e.team!==g.away)continue;
            if(!availableStats({[stat]:METRICS[stat]},e.history).length)continue;
            lines.push({player:e.p.name,metric:stat,point:METRICS[stat].defaultLine,preset:true});
          }
        }
      }
      return lines.flatMap(line=>{
      const matches=(names.get(playerKey(line.player)) || []).filter(x=>x.team===g.home || x.team===g.away);
      const entry=matches.length===1 ? matches[0] : null;
      let rank,rankCount;
      if (entry) {
        const key=entry.p.position + ':' + line.metric;
        if (!rankCache.has(key)) rankCache.set(key,defenseTable(players,season,entry.p.position,line.metric));
        const opp=entry.team===g.home ? g.away : g.home;
        rankCount=rankCache.get(key).length;
        rank=rankCache.get(key).find(r=>teamCode(r.team)===opp)?.rank;

      }
      const sides = side === 'both' ? ['over','under'] : [side];
      return sides.map(pick => {
        const history=entry?.history.slice(-10)||[];
        const modelEstimate=entry?estimateModelHitRate(history,line.metric,line.point,pick,{marketProbability:fairSideProbability(line,pick,line.point)}):null;
        return {g,line,entry,rank,rankCount,pick,modelEstimate,summary:entry ? summarize(history,line.metric,line.point,pick) : null};
      });
    });});
  },[slate,players,season,side,stat,touchdown]);
  const matchup = fixedGame || gameFilter.game;
  const visibleGames = slate.filter(g=>fixedGame || !gameFilter.date || day(g.kickoff)===gameFilter.date);
  const choices = matchup ? [matchup.away,matchup.home] : [...new Set(visibleGames.flatMap(g=>[g.home,g.away]))].sort();
  const currentTeam = choices.includes(team) ? team : '';
  const included = new Set(visibleGames.filter(g=>!matchup || (g.home===matchup.home && g.away===matchup.away && day(g.kickoff)===day(matchup.kickoff))));
  const candidates = rows.filter(({g,line,entry,summary}) =>
    included.has(g) && (!currentTeam || entry?.team === currentTeam) &&
    (!stat || line.metric === stat) &&
    (minimum==='0' || (summary && summary.total >= Number(minimum))));
  const filtered = candidates.filter(({line})=>playerKey(line.player).includes(playerKey(search)));
  const sortValues = {
    kickoff:r=>Date.parse(r.g.kickoff), player:r=>r.line.player,
    category:r=>METRICS[r.line.metric]?.label, line:r=>r.line.point,
    over:r=>r.line.over, under:r=>r.line.under, rate:r=>r.summary?.rate, modelRate:r=>r.modelEstimate?.rate, rank:r=>r.rank
  };
  filtered.sort((a,b) => {
    const x=sortValues[sort](a), y=sortValues[sort](b);
    if (x == null || y == null) return Number(x == null)-Number(y == null);
    const difference=typeof x === 'string' ? x.localeCompare(y) : x-y;
    return (ascending ? difference : -difference) ||
      (sort === 'rate' ? (b.summary?.total || 0)-(a.summary?.total || 0) : 0) ||
      a.line.player.localeCompare(b.line.player);
  });
  function changeSort(key) {
    setAscending(key === sort ? !ascending : !['rate','modelRate','over','under'].includes(key));
    setSort(key);setLimit(30);
  }
  function filter(setter,event) {setter(event.target.value);setLimit(30);}
  return <section className="panel props-board" aria-label={title}>
    <header><h1>{title}</h1><p>{touchdown?'DraftKings Lines and Research Presets':'DraftKings Pregame Snapshots'} · {filtered.length} {side==='both' ? 'prop sides' : 'props'}</p></header>
    <div className="board-controls">
      {!fixedGame && <GameFilter filter={gameFilter} onChange={()=>{setTeam('');setLimit(30);}}/>}
      <label>Team<FilterMenu value={currentTeam} onChange={e=>filter(setTeam,e)}><option value="">{matchup ? "Both Teams" : "All Teams"}</option>{choices.map(t=><option key={t}>{t}</option>)}</FilterMenu></label>
      <label>Stat<FilterMenu value={stat} onChange={e=>filter(setStat,e)}><option value="">All Stats</option>{Object.entries(METRICS).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</FilterMenu></label>
      <label>Last 10 Side<FilterMenu value={side} onChange={e=>filter(setSide,e)}><option value="both">Both Sides</option><option value="over">Over</option><option value="under">Under</option></FilterMenu></label>
      <label>Minimum Games<FilterMenu value={minimum} onChange={e=>filter(setMinimum,e)}><option value="0">Any</option>{[1,5,10].map(n=><option key={n}>{n}</option>)}</FilterMenu></label>
      <BoardPlayerPicker names={candidates.map(r=>r.line.player)} value={search} onSelect={value=>{setSearch(value);setLimit(30);}}/>
    </div>
    <div className="board-sort">
      <label>Sort By <FilterMenu value={sort} onChange={e=>changeSort(e.target.value)}>{Object.entries({kickoff:'Kickoff',player:'Player',category:'Stat Category',line:'Prop Line',over:'Over Price',under:'Under Price',rate:'Last 10 Hit Rate',modelRate:'Model Estimate',rank:'Defense Rank'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</FilterMenu></label>
      <button className="outline-button" type="button" onClick={()=>changeSort(sort)}>{ascending ? '↑ Ascending' : '↓ Descending'}</button>
    </div>
    <div className="board-scroll"><table className="game-log"><thead><tr>{[['player','Player / Game'],['line','Prop'],['over','Over'],['under','Under'],['rate','Last 10'],['modelRate','Model Estimate'],['rank','DEF Rank']].map(([key,t])=><th key={key} aria-sort={sort===key ? (ascending?'ascending':'descending') : undefined}><button type="button" onClick={()=>changeSort(key)}>{t} {sort===key && (ascending?'↑':'↓')}</button></th>)}</tr></thead>
    <tbody>{filtered.slice(0,limit).map(({g,line,entry,rank,rankCount,summary,modelEstimate,pick})=><tr key={[g.id,line.player,line.metric,line.point,pick].join(':')} className={entry ? "open-prop" : undefined} onClick={entry ? ()=>onOpen(entry.p,line,pick,g) : undefined}>
      <td className="team-edge" style={{'--team-color':teamColor(entry?.team)}}><button type="button" className="board-player" disabled={!entry} title={entry?'Open player chart':'Player history unavailable'} onClick={e=>{e.stopPropagation();onOpen(entry.p,line,pick,g);}}>{entry && <PlayerPhoto id={entry.p.id} name={line.player} url={entry.p.photo}/>} {line.player}</button><small>{g.away} at {g.home} · {gameTime(g.kickoff)}</small></td>
      <td><strong>{pick==='over' ? 'Over ' : 'Under '}{line.point}</strong> {METRICS[line.metric]?.label}{touchdown && <small>{line.preset?'Research Preset':'DraftKings'}</small>}</td><td>{priceText(line.over)}</td><td>{priceText(line.under)}</td>
      <td>{summary ? <><b><HitRate rate={summary.rate}/></b> ({summary.hits}/{summary.total})</> : '—'}</td><td>{modelEstimate?<span className="model-rate-cell"><HitRate rate={modelEstimate.rate}/><small>MODEL · {modelEstimate.sample} G</small></span>:'—'}</td><td><DefenseRank rank={rank} total={rankCount} side={pick}/></td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p className="board-foot">No saved props match these filters.</p>}
    {filtered.length>limit && <button className="outline-button" onClick={()=>setLimit(limit+30)}>Show More Props</button>}
    <p className="board-foot">Last 10 and Model Estimate use prior player games. Model Estimate recalculates for the selected line; sportsbook odds are used only when they match that exact line. — means unavailable.</p>
  </section>;
}
