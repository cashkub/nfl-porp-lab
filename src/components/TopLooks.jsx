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
function defenseFit(rank,total,side,metric,position){
  if(!rank||!total)return '';
  if(side==='over'&&rank<=Math.ceil(total/4)){
    const label=rank===1?'most':`${ordinal(rank)} most`;
    return `Allows ${label} ${metric.toLowerCase()} to ${position}s`;
  }
  if(side==='under'&&rank>=(total-Math.ceil(total/4)+1)){
    const place=total-rank+1,label=place===1?'fewest':`${ordinal(place)} fewest`;
    return `Allows ${label} ${metric.toLowerCase()} to ${position}s`;
  }
  return '';
}
const impliedProbability=price=>Number.isFinite(price)?(price>0?100/(price+100):Math.abs(price)/(Math.abs(price)+100)):null;
function gameContext(game,team,opponent){
  const weather=game.context?.weather;
  const conditions=weather?`Forecast: ${weather.temp}°F · Wind ${weather.wind} mph · Rain chance ${weather.rain}%.`:'';
  const injuries=[...(game.injuries?.[team]||[]),...(game.injuries?.[opponent]||[])]
    .filter(p=>['out','doubtful','questionable'].includes(String(p.gameStatus||p.status).toLowerCase()));
  const injuryText=injuries.length?injuries.map(p=>`${p.name} ${p.gameStatus||p.status}${p.injury?' · '+p.injury:''}`).join('; '):'';
  return {conditions,injuryText};
}

function makePick(player,game,metric,market,quote,history,defense,side) {
  const line=quote.point;
  const values=history.map(g=>Number(g.stats[metric]??0));
  const recent=values.slice(-5), average=values.reduce((a,b)=>a+b,0)/values.length;
  const recentAverage=recent.reduce((a,b)=>a+b,0)/recent.length;
  const projection=average*.55+recentAverage*.45;
  const variance=values.reduce((sum,n)=>sum+(n-average)**2,0)/Math.max(1,values.length-1);
  const sd=Math.sqrt(variance);
  const hits=values.filter(n=>isHit(n,line,side)).length;
  const observed=(hits+2)/(values.length+4);
  const signedDistance=sd?(side==='over'?projection-line:line-projection)/sd:0;
  const projectionChance=Math.min(.88,Math.max(.12,.5+signedDistance*.18));
  const overImplied=impliedProbability(quote.over),underImplied=impliedProbability(quote.under);
  const fairSide=overImplied!=null&&underImplied!=null
    ? (side==='over'?overImplied:underImplied)/(overImplied+underImplied)
    : side==='over'?overImplied:underImplied;
  const chance=observed*.65+projectionChance*.2+(fairSide??.5)*.15;
  const usageKey=metric==='passingYards'||metric==='passingTDs'?'attempts':metric==='rushingYards'||metric==='rushingAttempts'?'carries':metric==='scoredTDs'?'opportunities':'targets';
  const usage=history.map(g=>g.usage?.[usageKey]).filter(Number.isFinite);
  const recentUsage=usage.slice(-3), previousUsage=usage.slice(-6,-3);
  const usageTrend=recentUsage.length&&previousUsage.length
    ? recentUsage.reduce((a,b)=>a+b,0)/recentUsage.length-previousUsage.reduce((a,b)=>a+b,0)/previousUsage.length:null;
  const defensiveEdge=defense?.rank
    ? side==='over'?Math.max(0,(16.5-defense.rank)/15.5):Math.max(0,(defense.rank-16.5)/15.5)
    :0;
  const edge=chance-(fairSide??.5);
  const projectionSignal=Math.max(-1,Math.min(1,(side==='over'?projection-line:line-projection)/(sd||Math.max(1,Math.abs(line)*.2))));
  const usageSignal=usageTrend==null?0:Math.max(-1,Math.min(1,usageTrend/Math.max(1,Math.abs(average)*.12)))*(side==='over'?1:-1);
  const score=100*(.62*edge+.22*projectionSignal+.10*defensiveEdge+.06*usageSignal);
  const matchup=defenseFit(defense?.rank,32,side,market.label,player.position);
  return {player,game,metric,market,line,quote,history,defense,side,projection,values,recent,hits,chance,fairSide,edge,score,usageKey,usageTrend,average,recentAverage,matchup};
}

export default function TopLooks({players,schedule,books,season,now,loading,error,onOpen}) {
  const future=schedule.filter(g=>Date.parse(g.kickoff)>now);
  const available=future;
  const days=[...new Set(available.map(g=>dayKey(g.kickoff)))].sort();
  const weeks=[...new Set(available.map(g=>String(g.week)))].sort((a,b)=>Number(a)-Number(b));
  const [mode,setMode]=useState('day'),[selected,setSelected]=useState('');
  const options=mode==='day'?days:weeks;
  const value=options.includes(selected)?selected:options[0]||'';
  const slate=available.filter(g=>mode==='day'?dayKey(g.kickoff)===value:String(g.week)===value);
  const picks=useMemo(()=>{
    const candidates=[],cache=new Map();
    for(const game of slate)for(const player of players){
      if(player.team!==game.home&&player.team!==game.away)continue;
      const opponent=player.team===game.home?game.away:game.home;
      const history=getPlayerGames(player,season).filter(g=>Number(g.week)<Number(game.week)).slice(-10);
      if(history.length<5)continue;
      for(const metric of availableStats(METRICS,history)){
        const quote=bookLine(books,game,player.name,metric);
        const average=history.reduce((sum,g)=>sum+(g.stats[metric]??0),0)/history.length;
        if(!Number.isFinite(quote?.point)&&average<=0)continue;
        const line=Number.isFinite(quote?.point)?quote.point:Number(average.toFixed(1));
        const selectedQuote=quote?{...quote,isBookLine:true}:{point:line,over:null,under:null,isBookLine:false};
        const market={label:METRICS[metric].label,unit:METRICS[metric].unit,short:metric};
        const posMetric=player.position+'|'+metric+'|'+game.week;
        if(!cache.has(posMetric))cache.set(posMetric,defenseTable(players,season,player.position,metric,game.week));
        const defense=cache.get(posMetric).find(row=>row.team===opponent);
        const unavailable=(game.injuries?.[player.team]??[]).find(item=>item.id===player.id&&String(item.gameStatus).toLowerCase()==='out');
        if(unavailable)continue;
        for(const side of ['over','under'])candidates.push(makePick(player,{...game,opponent},metric,market,selectedQuote,history,defense,side));
      }
    }
    const ranked=candidates.sort((a,b)=>Number(b.quote.isBookLine)-Number(a.quote.isBookLine)||b.score-a.score);
    const cap=slate.length===1?3:10;
    const used=new Set();
    return ranked.filter(p=>{const key=p.player.id+'|'+p.metric;if(used.has(key)||p.edge<.015||p.score<=2)return false;used.add(key);return true}).slice(0,cap);
  },[slate,players,season,books]);
  const markets=Object.fromEntries(Object.entries(METRICS).map(([key,market])=>[key,market.label]));
  const kickDate=value&&mode==='day'?dayLabel(value):value?'Week '+value:'Upcoming';
  return <main className="top-looks chart-lab"><NflToolHeader active="top"/><div className="top-looks-heading"><div><span className="top-kicker">MODEL RANKED PLAYER PROPS</span><h1>Top <em>Looks</em></h1><p>Qualified picks ranked by recent production, sportsbook line, and matchup.</p></div><span className="slate-count">{picks.length} QUALIFIED</span></div>
    <section className="top-filter panel"><label>Show Picks By<select value={mode} onChange={e=>{setMode(e.target.value);setSelected('')}}><option value="day">Game Date</option><option value="week">Week</option></select><ChevronDown size={15}/></label><label>{mode==='day'?'Date':'Week'}<select value={value} onChange={e=>setSelected(e.target.value)}>{options.map(o=><option key={o} value={o}>{mode==='day'?dayLabel(o):'Week '+o}</option>)}</select><ChevronDown size={15}/></label><span>{kickDate} · {slate.length} {slate.length===1?'game':'games'}</span></section>
    {loading||error?<p>{error||'Loading Top Looks…'}</p>:picks.length?<section className="top-pick-list">{picks.map((p,i)=>{const context=gameContext(p.game,p.player.team,p.game.opponent);return <article className="top-pick panel" key={p.game.id+p.player.id+p.metric+p.side}><div className="pick-rank">{String(i+1).padStart(2,'0')}</div><PlayerPhoto id={p.player.id} name={p.player.name} url={p.player.photo}/><div className="top-pick-main"><div className="top-matchup">{p.player.team} · {p.game.opponent} · {new Date(p.game.kickoff).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</div><h2>{p.player.name}</h2><p>{p.side.toUpperCase()} {p.line} {markets[p.metric]}</p><small className={'line-origin '+(p.quote.isBookLine?'sportsbook':'average')}>{p.quote.isBookLine?'DRAFTKINGS LINE':'PLAYER AVERAGE LINE'}</small></div><div className="top-pick-stat projection-stat"><small>PROJECTION</small><b>{p.projection.toFixed(1)}</b><small>vs. {p.line} Line</small></div><div className="top-pick-stat chance-stat"><small>EST. HIT RATE</small><b style={rateStyle(p.chance)}>{formatRate(p.chance)}</b><small>{p.hits}/{p.history.length} prior</small></div><div className="top-pick-stat defense-stat"><small>MATCHUP</small><b>{p.matchup||'—'}</b><small>{p.quote.isBookLine?'DK '+(p.side==='over'?p.quote.over:p.quote.under):'Odds unavailable'}</small></div><div className="top-pick-actions"><button type="button" onClick={()=>onOpen(p.player,{metric:p.metric,point:p.line,source:p.quote.isBookLine?'DraftKings':'Player Average'},p.side,p.game)}><Activity size={15}/>Charts</button><details><summary><Info size={15}/>Why This Pick?</summary><div className="pick-reason"><b>Model signals</b><p>{p.player.name} averages {p.average.toFixed(1)} {markets[p.metric].toLowerCase()} across {p.history.length} prior games and {p.recentAverage.toFixed(1)} over the last {p.recent.length}. The model projects {p.projection.toFixed(1)} against a {p.line} {p.quote.isBookLine?'DraftKings':'player average'} line. The historical {p.side} hit rate is {formatRate(p.hits/p.history.length)} ({p.hits}/{p.history.length}). The no-vig market estimate is {p.fairSide==null?'unavailable':formatRate(p.fairSide)}.</p>{p.matchup&&<p>{p.game.opponent} {p.matchup.toLowerCase()} ({p.defense.average.toFixed(1)} per game over {p.defense.games} games).</p>}{p.usageTrend!=null&&<p>Recent {p.usageKey} trend: {p.usageTrend>0?'+':''}{p.usageTrend.toFixed(1)} per game versus the prior three.</p>}{context.conditions&&<p>{context.conditions}</p>}{context.injuryText&&<p>Injury report: {context.injuryText}</p>}<small>Estimated hit rate blends the player’s recent outcomes, projection, and no-vig sportsbook price. It has not yet been calibrated against completed Top Looks slates.</small></div></details></div></article>})}</section>:<section className="no-top-picks panel"><h2>No qualified picks for {kickDate}</h2><p>Top Looks lists sportsbook lines first. Player-average lines appear when a real prop line is unavailable, and only when the model finds a positive edge. A short slate can have fewer than three picks.</p></section>}
  </main>;
}
