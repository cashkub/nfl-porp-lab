import {MatchCard} from './Research.jsx';
import HitRate, {defenseRankStyle} from './HitRate.jsx';
import React, {useMemo, useState} from 'react';
import {playerKey, priceText} from '../lib/bookLine.js';
import {METRICS, getPlayerGames, summarize} from '../lib/stats.js';
import {defenseTable} from '../lib/matchup.js';

const teamCode = t => ({LA:'LAR',WSH:'WAS',JAC:'JAX'}[t] || t);
const day = date => new Date(date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const gameTime = date => new Date(date).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});

export default function PropsBoard({ranked=false,top=false,games,players,season,now,onOpen}) {
  const [match,setMatch] = useState('');
  const [team,setTeam] = useState('');
  const [stat,setStat] = useState('');
  const [when,setWhen] = useState('');
  const [side,setSide] = useState(ranked ? 'both' : 'over');
  const [sort,setSort] = useState(ranked ? 'rate' : 'kickoff');
  const [ascending,setAscending] = useState(!ranked);
  const [minimum,setMinimum] = useState('5');
  const [search,setSearch] = useState('');
  const [limit,setLimit] = useState(30);
  const slate = useMemo(()=>games.filter(g=>Date.parse(g.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)),[games,now]);
  const rows = useMemo(()=>{
    const names = new Map(), rankCache = new Map();
    for (const p of players) {
      const history = getPlayerGames(p,season);
      if (!history.length) continue;
      const key = playerKey(p.name);
      if (!names.has(key)) names.set(key,[]);
      names.get(key).push({p,team:teamCode(history.at(-1).team || p.team),history});
    }
    return slate.flatMap(g=>g.lines.flatMap(line=>{
      const matches=(names.get(playerKey(line.player)) || []).filter(x=>x.team===g.home || x.team===g.away);
      const entry=matches.length===1 ? matches[0] : null;
      let rank;
      if (entry) {
        const key=entry.p.position + ':' + line.metric;
        if (!rankCache.has(key)) rankCache.set(key,defenseTable(players,season,entry.p.position,line.metric));
        const opp=entry.team===g.home ? g.away : g.home;
        rank=rankCache.get(key).find(r=>teamCode(r.team)===opp)?.rank;

      }
      const sides = side === 'both' ? ['over','under'] : [side];
      return sides.map(pick => ({g,line,entry,rank,pick,
        summary:entry ? summarize(entry.history.slice(-10),line.metric,line.point,pick) : null
      }));
    }));
  },[slate,players,season,side]);
  const visibleGames = slate.filter(g => !when || day(g.kickoff) === day(now));
  const matchup = visibleGames.find(g => g.id === match);
  const choices = matchup ? [matchup.away,matchup.home] :
    [...new Set(visibleGames.flatMap(g=>[g.home,g.away]))].sort();
  const currentTeam = choices.includes(team) ? team : matchup?.away || '';
  const filtered = rows.filter(({g,line,entry,summary}) =>
    (!matchup || g.id === matchup.id) && (!currentTeam || entry?.team === currentTeam) &&
    (!stat || line.metric === stat) && (!when || day(g.kickoff) === day(now)) &&
    playerKey(line.player).includes(playerKey(search)) &&
    (!ranked || (summary && summary.total >= Number(minimum))));
  const sortValues = {
    kickoff:r=>Date.parse(r.g.kickoff), player:r=>r.line.player,
    category:r=>METRICS[r.line.metric]?.label, line:r=>r.line.point,
    over:r=>r.line.over, under:r=>r.line.under, rate:r=>r.summary?.rate, rank:r=>r.rank
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
    setAscending(key === sort ? !ascending : !['rate','over','under'].includes(key));
    setSort(key);setLimit(30);
  }
  const title = ranked ? 'Best Hit Rates' : 'Props Board';
  function filter(setter,event) {setter(event.target.value);setLimit(30);}
  if(top){
    const score=r=>{
      const price=r.line[r.pick];
      const implied=price<0?-price/(100-price):100/(100+price);
      return (r.summary.hits+2)/(r.summary.total+4)-implied;
    };
    const seen=new Set();
    const picks=filtered.filter(r=>Number.isFinite(r.line[r.pick]) && Math.abs(r.line[r.pick])>=100 && score(r)>0)
      .sort((a,b)=>score(b)-score(a)).filter(r=>{
        if(seen.has(r.entry.p.id))return false;
        seen.add(r.entry.p.id);return true;
      }).slice(0,5);
    return <section className="panel props-board"><h1>NFL Top 5</h1><p>DraftKings · Ranked by last-10 hit rate, adjusted toward 50%, minus the price’s break-even rate. Minimum five games.</p>
      <div className="research-grid">{picks.map(({entry,g,line,pick,summary,rank})=><MatchCard key={entry.p.id} game={g}><button className="board-player" onClick={()=>onOpen(entry.p,line,pick,g)}>{line.player}</button><p><b>{pick==='over'?'Over':'Under'} {line.point} {METRICS[line.metric].label} · {priceText(line[pick])}</b></p><p>This side hit in {summary.hits} of {summary.total} games (<HitRate rate={summary.rate}/>). {line.player} averaged {summary.average.toFixed(1)}. {rank?'The opponent ranks #'+rank+' in this stat allowed to '+entry.p.position+'s (#1 allows the most).':''}</p></MatchCard>)}</div>{!picks.length && <p>No Upcoming Priced Props Meet the Screen.</p>}</section>;
  }
  return <section className="panel props-board" aria-label={title}>
    <header><h1>{title}</h1><p>DraftKings Pregame Snapshots · {filtered.length} {ranked ? 'ranked sides' : 'props'}</p></header>
    <div className="board-controls">
      <label>Games<select value={when} onChange={e=>{filter(setWhen,e);setMatch('');setTeam('');}}><option value="">Upcoming</option><option value="today">Today (ET)</option></select></label>
      <label>Matchup<select value={matchup?.id || ''} onChange={e=>{filter(setMatch,e);setTeam('');}}><option value="">All Matchups</option>{visibleGames.map(g=><option value={g.id} key={g.id}>{g.away} at {g.home}</option>)}</select></label>
      <label>Team<select value={currentTeam} onChange={e=>filter(setTeam,e)}>{!matchup && <option value="">All Teams</option>}{choices.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Stat<select value={stat} onChange={e=>filter(setStat,e)}><option value="">All Stats</option>{Object.entries(METRICS).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select></label>
      <label>Last 10 Side<select value={side} onChange={e=>filter(setSide,e)}>{ranked && <option value="both">Both Sides</option>}<option value="over">Over</option><option value="under">Under</option></select></label>
      {ranked && <label>Minimum Games<select value={minimum} onChange={e=>filter(setMinimum,e)}>{[1,5,10].map(n=><option key={n}>{n}</option>)}</select></label>}
      <label>Player<input type="search" value={search} onChange={e=>filter(setSearch,e)} placeholder="Find Player"/></label>
    </div>
    <div className="board-sort">
      <label>Sort By <select value={sort} onChange={e=>changeSort(e.target.value)}>{Object.entries({kickoff:'Kickoff',player:'Player',category:'Stat Category',line:'Prop Line',over:'Over Price',under:'Under Price',rate:'Last 10 Hit Rate',rank:'Defense Rank'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <button className="outline-button" type="button" onClick={()=>changeSort(sort)}>{ascending ? '↑ Ascending' : '↓ Descending'}</button>
    </div>
    <div className="board-scroll"><table className="game-log"><thead><tr>{[['player','Player / Game'],['line','Prop'],['over','Over'],['under','Under'],['rate','Last 10'],['rank','DEF Rank']].map(([key,t])=><th key={key} aria-sort={sort===key ? (ascending?'ascending':'descending') : undefined}><button type="button" onClick={()=>changeSort(key)}>{t} {sort===key && (ascending?'↑':'↓')}</button></th>)}</tr></thead>
    <tbody>{filtered.slice(0,limit).map(({g,line,entry,rank,summary,pick})=><tr key={[g.id,line.player,line.metric,line.point,pick].join(':')} className={entry ? "open-prop" : undefined} onClick={entry ? ()=>onOpen(entry.p,line,pick,g) : undefined}>
      <td><button type="button" className="board-player" disabled={!entry} title={entry?'Open player chart':'Player history unavailable'} onClick={e=>{e.stopPropagation();onOpen(entry.p,line,pick,g);}}>{line.player}</button><small>{g.away} at {g.home} · {gameTime(g.kickoff)}</small></td>
      <td><strong>{ranked && (pick==='over' ? 'Over ' : 'Under ')}{line.point}</strong> {METRICS[line.metric]?.label}</td><td>{priceText(line.over)}</td><td>{priceText(line.under)}</td>
      <td>{summary ? <><b><HitRate rate={summary.rate}/></b> ({summary.hits}/{summary.total})</> : '—'}</td><td style={defenseRankStyle(rank)}>{rank ? '#'+rank : '—'}</td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p className="board-foot">No saved props match these filters.</p>}
    {filtered.length>limit && <button className="outline-button" onClick={()=>setLimit(limit+30)}>Show More Props</button>}
    <p className="board-foot">Last 10 uses this season’s recorded games. DEF #1 allows the most of that stat to the player’s position. — means unavailable.</p>
  </section>;
}
