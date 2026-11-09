import React,{useMemo,useState} from 'react';
import {ChevronDown,Activity,Info} from 'lucide-react';
import PlayerPhoto from './PlayerPhoto.jsx';
import NflToolHeader from './NflToolHeader.jsx';
import {availableStats} from '../lib/availableStats.js';
import {bookLine} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {getPlayerGames,formatRate,isHit} from '../lib/stats.js';
import {METRICS} from '../lib/stats.js';
import {DefenseRank,rateStyle} from './HitRate.jsx';
import './TopLooks.css';

const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dayLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'short',day:'numeric'}).format(new Date(value));
const ordinal=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';

function makePick(player,game,metric,market,quote,history,defense,side) {
  const line=quote.point;
  const values=history.map(g=>Number(g.stats[metric]??0));
  const recent=values.slice(-5), average=values.reduce((a,b)=>a+b,0)/values.length;
  const recentAverage=recent.reduce((a,b)=>a+b,0)/recent.length;
  const projection=average*.55+recentAverage*.45;
  const variance=values.reduce((sum,n)=>sum+(n-average)**2,0)/Math.max(1,values.length-1);
  const sd=Math.sqrt(variance);
  const hits=values.filter(n=>isHit(n,line,side)).length;
  const raw=(hits+1)/(values.length+2);
  const signedDistance=sd?(side==='over'?projection-line:line-projection)/sd:0;
  const projectionChance=Math.min(.88,Math.max(.12,.5+signedDistance*.18));
  const chance=raw*.65+projectionChance*.35;
  const usageKey=metric==='passingYards'||metric==='passingTDs'?'attempts':metric==='rushingYards'||metric==='rushingAttempts'?'carries':metric==='scoredTDs'?'opportunities':'targets';
  const usage=history.map(g=>g.usage?.[usageKey]).filter(Number.isFinite);
  const recentUsage=usage.slice(-3), previousUsage=usage.slice(-6,-3);
  const usageTrend=recentUsage.length&&previousUsage.length
    ? recentUsage.reduce((a,b)=>a+b,0)/recentUsage.length-previousUsage.reduce((a,b)=>a+b,0)/previousUsage.length:null;
  const defensiveEdge=defense?.rank?Math.max(-1,Math.min(1,(16.5-defense.rank)/15.5))*(side==='over'?1:-1):0;
  const edge=chance-.5;
  const projectionSignal=Math.max(-1,Math.min(1,(side==='over'?projection-line:line-projection)/(sd||Math.max(1,Math.abs(line)*.2))));
  const usageSignal=usageTrend==null?0:Math.max(-1,Math.min(1,usageTrend/Math.max(1,Math.abs(average)*.12)))*(side==='over'?1:-1);
  const score=100*(.62*edge+.22*projectionSignal+.10*defensiveEdge+.06*usageSignal);
  return {player,game,metric,market,line,quote,history,defense,side,projection,values,recent,hits,chance,score,usageKey,usageTrend,average,recentAverage};
}

export default function TopLooks({players,schedule,books,season,now,loading,error,onOpen}) {
  const future=schedule.filter(g=>Date.parse(g.kickoff)>now);
  const days=[...new Set(future.map(g=>dayKey(g.kickoff)))].sort();
  const weeks=[...new Set(future.map(g=>String(g.week)))].sort((a,b)=>Number(a)-Number(b));
  const [mode,setMode]=useState('day'),[selected,setSelected]=useState('');
  const options=mode==='day'?days:weeks;
  const value=options.includes(selected)?selected:options[0]||'';
  const slate=future.filter(g=>mode==='day'?dayKey(g.kickoff)===value:String(g.week)===value);
  const picks=useMemo(()=>{
    const candidates=[],cache=new Map();
    for(const game of slate)for(const player of players){
      if(player.team!==game.home&&player.team!==game.away)continue;
      const opponent=player.team===game.home?game.away:game.home;
      const history=getPlayerGames(player,season).filter(g=>Number(g.week)<Number(game.week)).slice(-10);
      if(history.length<5)continue;
      for(const metric of availableStats(METRICS,history)){
        const quote=bookLine(books,game,player.name,metric);
        if(!Number.isFinite(quote?.point))continue;
        const market={label:METRICS[metric].label,unit:METRICS[metric].unit,short:metric};
        const posMetric=player.position+'|'+metric+'|'+game.week;
        if(!cache.has(posMetric))cache.set(posMetric,defenseTable(players,season,player.position,metric,game.week));
        const defense=cache.get(posMetric).find(row=>row.team===opponent);
        for(const side of ['over','under'])candidates.push(makePick(player,{...game,opponent},metric,market,quote,history,defense,side));
      }
    }
    const ranked=candidates.sort((a,b)=>b.score-a.score);
    const cap=slate.length===1?3:10;
    const used=new Set();
    return ranked.filter(p=>{const key=p.player.id+'|'+p.metric;if(used.has(key)||p.chance<.57||p.score<=2)return false;used.add(key);return true}).slice(0,cap);
  },[slate,players,season,books]);
  const markets={passingYards:'Passing Yards',passingTDs:'Passing Touchdowns',rushingYards:'Rushing Yards',rushingAttempts:'Rushing Attempts',receivingYards:'Receiving Yards',receptions:'Receptions',scoredTDs:'Touchdowns'};
  const kickDate=value&&mode==='day'?dayLabel(value):value?'Week '+value:'Upcoming';
  return <main className="top-looks chart-lab"><NflToolHeader active="top"/><div className="top-looks-heading"><div><span className="top-kicker">MODEL RANKED PLAYER PROPS</span><h1>Top <em>Looks</em></h1><p>Qualified picks ranked by recent production, sportsbook line, and matchup.</p></div><span className="slate-count">{picks.length} QUALIFIED</span></div>
    <section className="top-filter panel"><label>Show Picks By<select value={mode} onChange={e=>{setMode(e.target.value);setSelected('')}}><option value="day">Game Date</option><option value="week">Week</option></select><ChevronDown size={15}/></label><label>{mode==='day'?'Date':'Week'}<select value={value} onChange={e=>setSelected(e.target.value)}>{options.map(o=><option key={o} value={o}>{mode==='day'?dayLabel(o):'Week '+o}</option>)}</select><ChevronDown size={15}/></label><span>{kickDate} · {slate.length} {slate.length===1?'game':'games'}</span></section>
    {loading||error?<p>{error||'Loading Top Looks…'}</p>:picks.length?<section className="top-pick-list">{picks.map((p,i)=><article className="top-pick panel" key={p.game.id+p.player.id+p.metric+p.side}><div className="pick-rank">{String(i+1).padStart(2,'0')}</div><PlayerPhoto id={p.player.id} name={p.player.name} url={p.player.photo}/><div className="top-pick-main"><div className="top-matchup">{p.player.team} · {p.game.opponent} · {new Date(p.game.kickoff).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</div><h2>{p.player.name}</h2><p>{p.side.toUpperCase()} {p.line} {markets[p.metric]}</p></div><div className="top-pick-stat projection-stat"><small>PROJECTION</small><b>{p.projection.toFixed(1)}</b><small>Line {p.line}</small></div><div className="top-pick-stat chance-stat"><small>EST. HIT RATE</small><b style={rateStyle(p.chance)}>{formatRate(p.chance)}</b><small>{p.hits}/{p.history.length} prior</small></div><div className="top-pick-stat defense-stat"><small>DEFENSE</small><b><DefenseRank rank={p.defense?.rank} total={32} label={markets[p.metric]} position={p.player.position+'s'}/></b><small>DK {p.side==='over'?p.quote.over:p.quote.under}</small></div><div className="top-pick-actions"><button type="button" onClick={()=>onOpen(p.player,{metric:p.metric,point:p.line},p.side,p.game)}><Activity size={15}/>Charts</button><details><summary><Info size={15}/>Why This Pick?</summary><div className="pick-reason"><b>Model signals</b><p>{p.player.name} averages {p.average.toFixed(1)} {markets[p.metric].toLowerCase()} across {p.history.length} prior games and {p.recentAverage.toFixed(1)} over the last {p.recent.length}. The model projects {p.projection.toFixed(1)} against a {p.line} sportsbook line. The historical {p.side} hit rate is {formatRate(p.hits/p.history.length)} ({p.hits}/{p.history.length}).</p>{p.defense&&<p>{p.game.opponent} allows {ordinal(p.defense.rank)} most {markets[p.metric].toLowerCase()} to {p.player.position}s ({p.defense.average.toFixed(1)} per game over {p.defense.games} games).</p>}{p.usageTrend!=null&&<p>Recent {p.usageKey} trend: {p.usageTrend>0?'+':''}{p.usageTrend.toFixed(1)} per game versus the prior three.</p>}<small>Estimated hit rate is a model estimate, not a guarantee. It uses prior game outcomes and a recency-weighted projection.</small></div></details></div></article>)}</section>:<section className="no-top-picks panel"><h2>No qualified picks for {kickDate}</h2><p>Top Looks only lists picks with a real sportsbook line, at least five prior games, and an estimated hit rate of 57% or better. A short slate may have fewer than three picks.</p></section>}
  </main>;
}
