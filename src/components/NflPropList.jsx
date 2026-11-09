import React,{useMemo,useState} from 'react';
import {availableStats} from '../lib/availableStats.js';
import {bookLine,priceText} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {getPlayerGames,formatRate,summarize} from '../lib/stats.js';
import {teamColor} from '../lib/teamColors.js';
import {nextGame} from '../lib/schedule.js';
import {ChartSlate,useChartSlate} from './ChartSlate.jsx';
import {rateStyle,defenseRankStyle} from './HitRate.jsx';
import SortableTable from './SortableTable.jsx';
import ChartSelect from './ChartSelect.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflPropList.css';

export default function NflPropList({players,roster,schedule,season,books,markets,now,loading,error,onOpen}) {
  const future=useMemo(()=>schedule.filter(g=>Date.parse(g.kickoff)>now),[schedule,now]);
  const slate=useChartSlate(future,now);
  const [market,setMarket]=useState('ALL');
  const [side,setSide]=useState('over');
  const [source,setSource]=useState('ALL');
  const [search,setSearch]=useState('');
  const [playerId,setPlayerId]=useState('');
  const [minimum,setMinimum]=useState('1');
  const [sort,setSort]=useState(null);
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
  const matches=rows.filter(r=>r.summary.total>=Number(minimum) && (source==='ALL' || (source==='book')===!!r.quote) && r.player.name.toLowerCase().includes(search.trim().toLowerCase()));
  const choices=[...new Map(matches.map(r=>[r.player.id,r.player])).values()];
  const activeId=choices.some(p=>p.id===playerId)?playerId:'';
  const filtered=activeId?matches.filter(r=>r.player.id===activeId):matches;
  const columns=[
    {label:'Player',value:r=>r.player.name,render:r=><button type="button" className="prop-chart-link"
      aria-label={'Open Charts for '+r.player.name+', '+side+' '+r.point+' '+markets[r.metric].label} onClick={()=>onOpen(r,side)}>
      <PlayerPhoto id={r.player.id} name={r.player.name} url={r.player.photo}/><b>{r.player.name}</b><span aria-hidden="true">↗</span></button>},
    {label:'Market',value:r=>markets[r.metric].label},
    {label:'Line',value:r=>r.point,render:r=><strong className="prop-point">{side} {r.point}</strong>},
    {label:'Hit Rate',value:r=>r.summary.rate,highFirst:true,render:r=><b style={rateStyle(r.summary.rate)}>{formatRate(r.summary.rate)}</b>},
    {label:'Hits',value:r=>r.summary.hits,highFirst:true,render:r=>r.summary.hits+'/'+r.summary.total},
    {label:'Odds',value:r=>r.quote?.[side]??null,highFirst:true,render:r=>priceText(r.quote?.[side])},
    {label:'Source',value:r=>r.quote?'DraftKings':'Player Average'},
    {label:'Team',value:r=>r.player.team},
    {label:'Opponent',value:r=>r.game.opponent,render:r=>(r.game.venue==='Away'?'@ ':'vs. ')+r.game.opponent},
    {label:'DEF Rank',value:r=>r.rank,render:r=><b style={defenseRankStyle(r.rank,r.teams)}>{r.rank?'#'+r.rank:'—'}</b>},
    {label:'Pos',value:r=>r.player.position},
  ];
  return <main className="chart-lab prop-list">
    <header><a href="/preview/"><img src="/preview/assets/mark.svg" alt=""/> PropBets</a><a href="/preview/nfl/">← NFL Menu</a></header>
    <h1>Prop <em>Lists</em></h1>
    {loading || error?<p>{error || 'Loading Player Props…'}</p>:<>
      <ChartSlate slate={slate}/>
      <div className="prop-list-filters">
        <label className="prop-search">Search Players<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPlayerId('')}} placeholder="Type A Name"/></label>
        <ChartSelect label="Player" value={activeId} onChange={setPlayerId}><option value="">All Players</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}</ChartSelect>
        <ChartSelect label="Market" value={market} onChange={setMarket}><option value="ALL">All Markets</option>{Object.entries(markets).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</ChartSelect>
        <ChartSelect label="Line Source" value={source} onChange={setSource}><option value="ALL">All Lines</option><option value="book">DraftKings</option><option value="average">Player Average</option></ChartSelect>
        <ChartSelect label="Minimum Games" value={minimum} onChange={setMinimum}>{[1,3,5,10].map(n=><option key={n} value={n}>{n}+</option>)}</ChartSelect>
        <ChartSelect label="Side" value={side} onChange={setSide}><option value="over">Over</option><option value="under">Under</option></ChartSelect>
      </div>
      <p className="prop-list-note">{filtered.length} Props · {sort ? 'Sorted By '+columns[sort.column].label+(sort.asc?' ↑':' ↓') : 'Sportsbook Lines First, Then Highest Hit Rate'}. Select A Player To Open Charts.</p>
      {filtered.length>0 && <div className="history-scroll prop-table-scroll" role="region" aria-label="Sortable NFL Prop List" tabIndex="0">
        <SortableTable className="prop-research-table" headers={columns.map(c=>c.label)} rows={filtered} limit={limit}
          values={r=>columns.map(c=>c.value(r))} sort={sort} onSort={setSort}
          descending={columns.flatMap((c,i)=>c.highFirst?[i]:[])}
          renderRow={r=><tr key={r.game.id+r.player.id+r.metric} style={{'--club':teamColor(r.player.team)??'#9073a8'}}>
            {columns.map(c=><td key={c.label}>{c.render?c.render(r):c.value(r)}</td>)}
          </tr>}/>
      </div>}
      {filtered.length>0 && <p className="prop-list-note">Player Averages And Hit Rates Use Up To 10 Prior Games This Season. DEF #1 Allows The Most To The Position.</p>}
      {!filtered.length && <p>No Upcoming Props Match These Filters.</p>}
      {filtered.length>limit && <button className="prop-list-more" onClick={()=>setLimit(limit+24)}>Show More Props</button>}
    </>}
  </main>;
}
