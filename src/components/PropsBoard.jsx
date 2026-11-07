import React, {useMemo, useState} from 'react';
import {playerKey, priceText} from '../lib/bookLine.js';
import {METRICS, getPlayerGames, summarize, formatRate} from '../lib/stats.js';
import {defenseTable} from '../lib/matchup.js';

const teamCode = t => ({LA:'LAR',WSH:'WAS',JAC:'JAX'}[t] || t);
const day = date => new Date(date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const gameTime = date => new Date(date).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});

export default function PropsBoard({games,players,season,now,onOpen}) {
  const [match,setMatch] = useState('');
  const [team,setTeam] = useState('');
  const [stat,setStat] = useState('');
  const [when,setWhen] = useState('');
  const [side,setSide] = useState('over');
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
    return slate.flatMap(g=>g.lines.map(line=>{
      const matches=(names.get(playerKey(line.player)) || []).filter(x=>x.team===g.home || x.team===g.away);
      const entry=matches.length===1 ? matches[0] : null;
      let rank, summary;
      if (entry) {
        const key=entry.p.position + ':' + line.metric;
        if (!rankCache.has(key)) rankCache.set(key,defenseTable(players,season,entry.p.position,line.metric));
        const opp=entry.team===g.home ? g.away : g.home;
        rank=rankCache.get(key).find(r=>teamCode(r.team)===opp)?.rank;
        summary=summarize(entry.history.slice(-10),line.metric,line.point,side);
      }
      return {g,line,entry,rank,summary};
    }));
  },[slate,players,season,side]);
  const choices=[...new Set(slate.flatMap(g=>[g.home,g.away]))].sort();
  const filtered=rows.filter(({g,line,entry})=>(!match||g.id===match)&&(!team||entry?.team===team)&&(!stat||line.metric===stat)&&(!when||day(g.kickoff)===day(now))&&playerKey(line.player).includes(playerKey(search)));
  function filter(setter,event) {setter(event.target.value);setLimit(30);}
  return <section className="panel props-board" aria-label="Props board">
    <header><h1>Props board</h1><p>DraftKings pregame snapshots · {filtered.length} props</p></header>
    <div className="board-controls">
      <label>Games<select value={when} onChange={e=>filter(setWhen,e)}><option value="">Upcoming</option><option value="today">Today (ET)</option></select></label>
      <label>Matchup<select value={match} onChange={e=>filter(setMatch,e)}><option value="">All matchups</option>{slate.map(g=><option value={g.id} key={g.id}>{g.away} at {g.home}</option>)}</select></label>
      <label>Team<select value={team} onChange={e=>filter(setTeam,e)}><option value="">All teams</option>{choices.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Stat<select value={stat} onChange={e=>filter(setStat,e)}><option value="">All stats</option>{Object.entries(METRICS).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select></label>
      <label>Last 10 side<select value={side} onChange={e=>filter(setSide,e)}><option value="over">Over</option><option value="under">Under</option></select></label>
      <label>Player<input type="search" value={search} onChange={e=>filter(setSearch,e)} placeholder="Find player"/></label>
    </div>
    <div className="board-scroll"><table className="game-log"><thead><tr>{['Player / game','Prop','Over','Under','Last 10','DEF rank'].map(t=><th key={t}>{t}</th>)}</tr></thead>
    <tbody>{filtered.slice(0,limit).map(({g,line,entry,rank,summary})=><tr key={[g.id,line.player,line.metric,line.point].join(':')} className={entry ? "open-prop" : undefined} onClick={entry ? ()=>onOpen(entry.p,line,side,g) : undefined}>
      <td><button type="button" className="board-player" disabled={!entry} title={entry?'Open player chart':'Player history unavailable'} onClick={e=>{e.stopPropagation();onOpen(entry.p,line,side,g);}}>{line.player}</button><small>{g.away} at {g.home} · {gameTime(g.kickoff)}</small></td>
      <td><strong>{line.point}</strong> {METRICS[line.metric]?.label}</td><td>{priceText(line.over)}</td><td>{priceText(line.under)}</td>
      <td>{summary ? `${formatRate(summary.rate)} (${summary.hits}/${summary.total})` : '—'}</td><td>{rank ? '#'+rank : '—'}</td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p className="board-foot">No saved props match these filters.</p>}
    {filtered.length>limit && <button className="outline-button" onClick={()=>setLimit(limit+30)}>Show more props</button>}
    <p className="board-foot">Last 10 uses this season’s recorded games. DEF #1 allows the most of that stat to the player’s position. — means unavailable.</p>
  </section>;
}
