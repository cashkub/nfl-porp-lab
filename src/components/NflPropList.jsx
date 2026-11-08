import React,{useMemo,useState} from 'react';
import {availableStats} from '../lib/availableStats.js';
import {bookLine,priceText} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {getPlayerGames,formatRate,summarize} from '../lib/stats.js';
import {teamColor} from '../lib/teamColors.js';
import {nextGame} from '../lib/schedule.js';
import {ChartSlate,useChartSlate} from './ChartSlate.jsx';
import {rateStyle,defenseRankStyle} from './HitRate.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflPropList.css';

export default function NflPropList({players,roster,schedule,season,books,markets,now,loading,error,onOpen}) {
  const future=useMemo(()=>schedule.filter(g=>Date.parse(g.kickoff)>now),[schedule,now]);
  const slate=useChartSlate(future,now);
  const [market,setMarket]=useState('ALL');
  const [side,setSide]=useState('over');
  const [source,setSource]=useState('ALL');
  const [search,setSearch]=useState('');
  const [minimum,setMinimum]=useState('1');
  const [limit,setLimit]=useState(24);
  const rows=useMemo(()=>{
    const result=[],ranks=new Map();
    const games=slate.game?[slate.game]:slate.games;
    for(const player of roster){
      const game=nextGame(games,player.team,season,now);
      if(!game)continue;
      const team=game.opponent===game.home?game.away:game.home;
      if(slate.team && slate.team!==team)continue;
      const recent=getPlayerGames(player,season).filter(g=>Number(g.week)<Number(game.week)).slice(-10);
      if(!recent.length)continue;
      for(const metric of availableStats(markets,recent)){
        if(market!=='ALL' && metric!==market)continue;
        const saved=bookLine(books,game,player.name,metric);
        const quote=Number.isFinite(saved?.point)?saved:null;
        const average=recent.reduce((n,g)=>n+(g.stats[metric]??0),0)/recent.length;
        if(!quote && average<=0)continue;
        const point=quote?.point??Number(average.toFixed(1));
        const key=player.position+'|'+metric;
        if(!ranks.has(key))ranks.set(key,defenseTable(players,season,player.position,metric,game.week));
        const table=ranks.get(key);
        const opponent=({LAR:'LA',WAS:'WSH',JAX:'JAC'})[game.opponent];
        const defense=table.find(d=>d.team===game.opponent)??table.find(d=>d.team===opponent);
        result.push({player,game,metric,point,quote,summary:summarize(recent,metric,point,side),rank:defense?.rank,teams:table.length});
      }
    }
    return result.sort((a,b)=>Number(!!b.quote)-Number(!!a.quote) || b.summary.rate-a.summary.rate || b.summary.total-a.summary.total || a.player.name.localeCompare(b.player.name));
  },[players,roster,season,books,markets,now,slate.week,slate.game,slate.team,future,market,side]);
  const filtered=rows.filter(r=>r.summary.total>=Number(minimum) && (source==='ALL' || (source==='book')===!!r.quote) && r.player.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <main className="chart-lab prop-list">
    <header><a href="/preview/"><img src="/preview/assets/mark.svg" alt=""/> PropBets</a><a href="/preview/nfl/">← NFL Menu</a></header>
    <h1>Prop <em>Lists</em></h1>
    {loading || error?<p>{error || 'Loading Player Props…'}</p>:<>
      <ChartSlate slate={slate}/>
      <div className="prop-list-filters">
        <label>Player<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Players"/></label>
        <label>Market<select value={market} onChange={e=>setMarket(e.target.value)}><option value="ALL">All Markets</option>{Object.entries(markets).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select></label>
        <label>Line Source<select value={source} onChange={e=>setSource(e.target.value)}><option value="ALL">All Lines</option><option value="book">DraftKings</option><option value="average">Player Average</option></select></label>
        <label>Minimum Games<select value={minimum} onChange={e=>setMinimum(e.target.value)}>{[1,3,5,10].map(n=><option key={n} value={n}>{n}+</option>)}</select></label>
        <label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
      </div>
      <p className="prop-list-note">{filtered.length} Props · Sportsbook Lines First, Then Highest Hit Rate. Player Averages And Hits Use Up To 10 Prior Games This Season. DEF #1 Allows The Most To The Position.</p>
      <div className="prop-list-grid">{filtered.slice(0,limit).map(row=>{
        const {player,game,metric,point,quote,summary,rank,teams}=row;
        return <article key={game.id+player.id+metric} style={{'--club':teamColor(player.team)??'#9073a8'}}>
          <div className="prop-list-player"><PlayerPhoto id={player.id} name={player.name} url={player.photo}/><div><small>{player.team} · {player.position} · {game.venue==='Away'?'at':'vs.'} {game.opponent}</small><h2>{player.name}</h2></div></div>
          <div className="prop-list-market"><strong>{side} {point}</strong> {markets[metric].label}</div>
          <div className="prop-list-source">{quote?'DraftKings Snapshot':'Player Average'}{quote && Number.isFinite(quote[side]) && <b> · {priceText(quote[side])}</b>}</div>
          <footer><span style={rateStyle(summary.rate)}>{summary.hits}/{summary.total} Hits · {formatRate(summary.rate)}</span><span style={defenseRankStyle(rank,teams)}>DEF {rank?'#'+rank:'—'}</span>
          <button onClick={()=>onOpen(row,side)} aria-label={'Open Charts for '+player.name+', '+side+' '+point+' '+markets[metric].label}>Charts ↗</button></footer>
        </article>;
      })}</div>
      {!filtered.length && <p>No Upcoming Props Match These Filters.</p>}
      {filtered.length>limit && <button className="prop-list-more" onClick={()=>setLimit(limit+24)}>Show More Props</button>}
    </>}
  </main>;
}
