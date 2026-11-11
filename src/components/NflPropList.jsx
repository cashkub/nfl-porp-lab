import NflToolHeader from './NflToolHeader.jsx';
import React,{useMemo,useState} from 'react';
import {availableStats} from '../lib/availableStats.js';
import {bookLine,fairSideProbability,priceText} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {getPlayerGames,formatRate,isHit,summarize,estimateModelHitRate} from '../lib/stats.js';
import {teamColor} from '../lib/teamColors.js';
import {nextGame} from '../lib/schedule.js';
import {buildPlayerForecast} from '../lib/nflForecast.js';
import {hasMeaningfulProjectionRole} from '../lib/playerProjection.js';
import {WeekAndMatchup,TeamFilter,useChartSlate} from './ChartSlate.jsx';
import {rateStyle,DefenseRank} from './HitRate.jsx';
import SortableTable from './SortableTable.jsx';
import PropPlayerFilter from './PropPlayerFilter.jsx';
import ChartSelect from './ChartSelect.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import './NflPropList.css';

function LastFive({row,side}) {
  return <span className="last-five" aria-label="Last five games, oldest to newest">{row.lastFive.map(game=>{
    const value=game.stats[row.metric] ?? 0;
    const result=value===row.point?'Push':isHit(value,row.point,side)?'Hit':'Miss';
    const detail=`Week ${game.week} vs. ${game.opponent} · ${value} · ${result} (${side} ${row.point})`;
    return <span key={game.gameId} className="last-five-game" data-result={result} title={detail} aria-label={detail}>
      <i aria-hidden="true"/>{value}
    </span>;
  })}</span>;
}

export default function NflPropList({players,roster,schedule,season,books,markets,now,loading,error,onOpen,distributions=null}) {
  const future=useMemo(()=>schedule.filter(g=>Date.parse(g.kickoff)>now),[schedule,now]);
  const slate=useChartSlate(future,now);
  const [market,setMarket]=useState('ALL');
  const [side,setSide]=useState('over');
  const [venue,setVenue]=useState('ALL');
  const venueLabel=({ALL:'All Games',H:'Home Games',A:'Away Games'})[venue];
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
      const recent=getPlayerGames(player,season,'ALL',venue).filter(g=>Number(g.week)<Number(game.week)).slice(-10);
      if(!recent.length)continue;
      for(const metric of availableStats(markets,recent)){
        if(market!=='ALL' && metric!==market)continue;
        const saved=bookLine(books,game,player.name,metric);
        const quote=Number.isFinite(saved?.point)?saved:null;
        const average=recent.reduce((n,g)=>n+(g.stats[metric]??0),0)/recent.length;
        if(!quote && average<=0)continue;
        const point=quote?.point??Number(average.toFixed(1));
        const forecast=buildPlayerForecast({players,player,game,market:metric,line:point,side,distributions});
        const expectedStarter=player.position==='QB'&&[
          game.context?.home?.qbId,game.context?.away?.qbId
        ].some(id=>String(id||'')===String(player.id));
        if(!forecast||!hasMeaningfulProjectionRole({position:player.position,market:metric,
          projectedUsage:forecast.projectedUsage,historyGames:forecast.sampleGames,expectedStarter}))continue;
        const key=player.position+'|'+metric;
        if(!ranks.has(key))ranks.set(key,defenseTable(players,season,player.position,metric,game.week));
        const table=ranks.get(key);
        const opponent=({LAR:'LA',WAS:'WSH',JAX:'JAC'})[game.opponent];
        const defense=table.find(d=>d.team===game.opponent)??table.find(d=>d.team===opponent);
        const modelEstimate=estimateModelHitRate(recent,metric,point,side,{marketProbability:fairSideProbability(quote,side,point),
          position:player.position,projection:forecast?.projection,distributionModels:distributions,forceExploratory:Boolean(forecast?.injuryAdjustment)});
        result.push({player,game,metric,point,quote,lastFive:recent.slice(-5),summary:summarize(recent,metric,point,side),forecast,modelEstimate,rank:defense?.rank,teams:table.length});
      }
    }
    return result.sort((a,b)=>Number(!!b.quote)-Number(!!a.quote) || b.summary.rate-a.summary.rate || b.summary.total-a.summary.total || a.player.name.localeCompare(b.player.name));
  },[players,roster,season,books,markets,now,slate.week,slate.game,slate.team,future,market,side,venue,distributions]);
  const matches=rows.filter(r=>r.summary.total>=Number(minimum) && (source==='ALL' || (source==='book')===!!r.quote) && r.player.name.toLowerCase().includes(search.trim().toLowerCase()));
  const choices=[...new Map(matches.map(r=>[r.player.id,r.player])).values()].sort((a,b)=>a.name.localeCompare(b.name) || a.team.localeCompare(b.team));
  const activeId=choices.some(p=>p.id===playerId)?playerId:'';
  const filtered=activeId?matches.filter(r=>r.player.id===activeId):matches;
  const columns=[
    {label:'Player',value:r=>r.player.name,render:r=><button type="button" className="prop-chart-link"
      aria-label={'Open Charts for '+r.player.name+', '+side+' '+r.point+' '+markets[r.metric].label} onClick={()=>onOpen(r,side,venue)}>
      <PlayerPhoto id={r.player.id} name={r.player.name} url={r.player.photo}/><b>{r.player.name}</b><span className="prop-charts-tag">Charts</span></button>},
    {label:'Market',value:r=>markets[r.metric].label},
    {label:'Line',value:r=>r.point,render:r=><strong className="prop-point">{side} {r.point}</strong>},
    {label:'Historical Hit Rate',value:r=>r.summary.rate,highFirst:true,render:r=><b style={rateStyle(r.summary.rate)}>{formatRate(r.summary.rate)}</b>},
    {label:'Model Estimate',value:r=>r.modelEstimate.rate,highFirst:true,render:r=><span className="model-rate-cell"><b style={rateStyle(r.modelEstimate.rate)}>{formatRate(r.modelEstimate.rate)}</b><small>{r.modelEstimate.calibrated?'CALIBRATED · '+r.modelEstimate.distributionSample.toLocaleString()+' ERRORS':'EXPLORATORY · '+r.modelEstimate.sample+' G'}</small></span>},
    {label:'Last 5',value:r=>summarize(r.lastFive,r.metric,r.point,side).rate,highFirst:true,render:r=><LastFive row={r} side={side}/>},
    {label:'Hits',value:r=>r.summary.hits,highFirst:true,render:r=>r.summary.hits+'/'+r.summary.total},
    {label:'Odds',value:r=>r.quote?.[side]??null,highFirst:true,render:r=>priceText(r.quote?.[side])},
    {label:'Source',value:r=>r.quote?'DraftKings':'Player Average'},
    {label:'Team',value:r=>r.player.team},
    {label:'Opponent',value:r=>r.game.opponent,render:r=>(r.game.venue==='Away'?'@ ':'vs. ')+r.game.opponent},
    {label:'DEF Rank',value:r=>r.rank,highFirst:true,render:r=><DefenseRank rank={r.rank} total={r.teams} label={markets[r.metric].label} position={r.player.position+'s'} side={side}/>},
    {label:'Pos',value:r=>r.player.position},
  ];
  return <main className="chart-lab prop-list">
    <NflToolHeader active="props"/>
    <h1>Prop <em>Lists</em></h1>
    {loading || error?<p>{error || 'Loading Player Props…'}</p>:<>
      <div className="prop-list-filters prop-primary">
        <WeekAndMatchup slate={slate}/>
        <PropPlayerFilter choices={choices} value={activeId} query={search}
          onQuery={text=>{setSearch(text);setPlayerId('')}}
          onSelect={id=>{setPlayerId(id);setSearch('')}}/>
      </div>
      <details className="prop-advanced">
        <summary className="chart-disclosure"><b>Filters</b><span>{slate.team || 'All Teams'} · {market==='ALL'?'All Markets':markets[market].label} · {venueLabel} · {side==='over'?'Over':'Under'}{source!=='ALL' && ' · '+(source==='book'?'DraftKings':'Player Average')}{minimum!=='1' && ' · '+minimum+'+ Games'}</span></summary>
        <div className="prop-list-filters">
        <TeamFilter slate={slate}/>
        <ChartSelect label="Game History" value={venue} onChange={setVenue}><option value="ALL">All Games</option><option value="H">Home Games</option><option value="A">Away Games</option></ChartSelect>
        <ChartSelect label="Market" value={market} onChange={setMarket}><option value="ALL">All Markets</option>{Object.entries(markets).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</ChartSelect>
        <ChartSelect label="Line Source" value={source} onChange={setSource}><option value="ALL">All Lines</option><option value="book">DraftKings</option><option value="average">Player Average</option></ChartSelect>
        <ChartSelect label="Minimum Games" value={minimum} onChange={setMinimum}>{[1,3,5,10].map(n=><option key={n} value={n}>{n}+</option>)}</ChartSelect>
        <ChartSelect label="Side" value={side} onChange={setSide}><option value="over">Over</option><option value="under">Under</option></ChartSelect>
      </div>
      </details>
      <p className="prop-list-note">{filtered.length} Props · {sort ? 'Sorted By '+columns[sort.column].label+(sort.asc?' (Ascending)':' (Descending)') : 'Sportsbook Lines First, Then Highest Hit Rate'}. Tap A Header To Sort Or Open A Player’s Charts.</p>
      {filtered.length>0 && <div className="history-scroll prop-table-scroll" role="region" aria-label="Sortable NFL Prop List" tabIndex="0">
        <SortableTable quietSort className="prop-research-table" headers={columns.map(c=>c.label)} rows={filtered} limit={limit}
          values={r=>columns.map(c=>c.value(r))} sort={sort} onSort={setSort}
          descending={columns.flatMap((c,i)=>c.highFirst?[i]:[])}
          renderRow={r=><tr key={r.game.id+r.player.id+r.metric} style={{'--club':teamColor(r.player.team)??'#9073a8'}}>
            {columns.map(c=><td key={c.label}>{c.render?c.render(r):c.value(r)}</td>)}
          </tr>}/>
      </div>}
      {filtered.length>0 && <p className="prop-list-note">Validated estimates use chronological forecast-error profiles only for markets that beat a prior-rate baseline in held-out tests; alternate-line performance is not separately established. Other markets are clearly marked exploratory. Historical Hit Rates Use Up To 10 Prior {venue==='H'?'Home Games':venue==='A'?'Away Games':'Games'} This Season. Last 5 Runs Oldest To Newest · Green = Hit · Red = Miss · Gold = Push.</p>}
      {!filtered.length && <p>No Upcoming Props Match These Filters.</p>}
      {filtered.length>limit && <button className="prop-list-more" onClick={()=>setLimit(limit+24)}>Show More Props</button>}
    </>}
  </main>;
}
