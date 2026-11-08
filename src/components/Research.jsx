import FilterMenu from './FilterMenu.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {useLeague} from './ManualLeague.jsx';
import {recordPeriod,periodLabel} from '../lib/recordWeeks.js';
import {ChevronDown} from 'lucide-react';
import {defenseRankStyle} from './HitRate.jsx';
import {priceText} from '../lib/bookLine.js';
import {nflColors,teamColor} from '../lib/teamColors.js';
import {MatchReport} from './MatchReport.jsx';
import {collegeRatings,projection} from '../lib/projection.js';
import React,{useMemo,useState,useSyncExternalStore} from 'react';
import {useCbbFile} from './CbbAnalyzer.jsx';

const dayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const etDay = value => dayFormatter.format(new Date(value));
const when = value => new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const phone=window.matchMedia('(max-width: 650px)');
const subscribePhone=notify=>{
  phone.addEventListener('change',notify);
  return ()=>phone.removeEventListener('change',notify);
};
const isPhone=()=>phone.matches;

export function MatchCard({game:g,colors=nflColors,compact,children}) {
  const mobile=useSyncExternalStore(subscribePhone,isPhone,()=>false);
  const style={'--team-color':teamColor(g.team,colors),'--away-color':teamColor(g.away,colors) || 'var(--rule)','--home-color':teamColor(g.home,colors) || 'var(--rule)'};
  const content=<><small>{when(g.kickoff)}{g.neutral?' · Neutral Site':''}{g.final?' · Final':''}</small>
    <h3>{g.awayName || g.away} <small>{g.neutral?'vs':'at'}</small> {g.homeName || g.home}</h3>{children}</>;
  if(mobile && compact)return <article className="research-card compact-card" style={style}><details>
    <summary>
      <span className="compact-rank" style={defenseRankStyle(compact.rank,9)}>#{compact.rank}</span>
      <span className="compact-pick"><b>{g.playerId && <PlayerPhoto id={g.playerId} name={g.player} url={g.photo}/>} {compact.title}</b><small>{compact.pick}</small></span>
      <span className="compact-price">{compact.price}</span><ChevronDown size={16} aria-hidden="true"/>
    </summary>
    <div className="compact-body">{content}</div>
  </details></article>;
  return <article className="research-card" style={style}>{content}</article>;
}

function gameSummary(game,model,rank,college=false){
  if(!rank || !model)return undefined;
  const [away,home]=model.overall;
  const homeWins=home>away;
  const winner=homeWins?(game.homeName || game.home):(game.awayName || game.away);
  const price=homeWins?game.homePrice:game.awayPrice;
  return {rank,title:winner+' by '+Math.abs(home-away).toFixed(1),pick:(game.awayName || game.away)+' at '+(game.homeName || game.home),
    price:college?'':Number.isFinite(price)?priceText(price):'Odds —'};
}

function featuredGames(games,project){
  return games.map(game=>({game,model:project(game)})).filter(({model})=>model && model.overall[0]!==model.overall[1])
    .sort((a,b)=>Math.abs(b.model.overall[1]-b.model.overall[0])-Math.abs(a.model.overall[1]-a.model.overall[0]) || Date.parse(a.game.kickoff)-Date.parse(b.game.kickoff))
    .slice(0,9).map(({game})=>game);
}

export function CbbGames(){
  const sport=useLeague(),football=sport==='cfb';
  const [chosenWeek,setWeek]=useState('');
  const index=useCbbFile('index.json');
  const [date,setDate]=useState(()=>etDay(Date.now()));
  const y=football?index.data?.seasons[0]:Number(date.slice(0,4))+(Number(date.slice(5,7))>=(sport==='nba'?10:8)?1:0);
  const valid=index.data?.seasons.includes(y);
  const schedule=useCbbFile(valid ? y+'/schedule.json':null);
  const meta=useCbbFile(valid ? y+'/teams.json':null);
  const [conf,setConf]=useState('');
  const weeks=football?[...new Set((schedule.data || []).map(g=>recordPeriod(g,sport)))]:[];
  const nearest=(schedule.data || []).find(g=>Date.parse(g.kickoff)>=Date.now()) || schedule.data?.at(-1);
  const week=weeks.includes(chosenWeek)?chosenWeek:nearest?recordPeriod(nearest,sport):'';
  const rows=(schedule.data || []).filter(g=>(football?recordPeriod(g,sport)===week:etDay(g.kickoff)===date) && (!conf || [g.home,g.away].some(t=>meta.data?.conferences?.[t]===conf)));
  const ratingsByDay=useMemo(()=>{
    const ratings=new Map();
    for(const g of schedule.data || []){
      const day=etDay(g.kickoff);
      if(football?recordPeriod(g,sport)!==week:day!==date)continue;
      if(!ratings.has(day))ratings.set(day,collegeRatings(schedule.data.filter(x=>x.final && etDay(x.kickoff)<day),Date.now(),sport!=='cbb'));
    }
    return ratings;
  },[schedule.data,date,football,week,sport]);
  const ratingsFor=g=>ratingsByDay.get(etDay(g.kickoff)) || {};
  const [showAll,setShowAll]=useState(false);
  const featured=featuredGames(rows,g=>projection(g,ratingsFor(g)[g.away],ratingsFor(g)[g.home],true));
  const error=index.error?index:schedule.error?schedule:null;
  return <section className="panel props-board"><h1>{sport.toUpperCase()} Games</h1><div className="board-controls">{football?<label>Game Week<FilterMenu value={week} onChange={e=>setWeek(e.target.value)}>{weeks.map(w=><option key={w} value={w}>{periodLabel(w,sport)}</option>)}</FilterMenu></label>:<label>Game Date (ET)<input type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label>}{sport!=='nba' && <label>Conference<FilterMenu value={conf} onChange={e=>setConf(e.target.value)}><option value="">All Conferences</option>{[...new Set(Object.values(meta.data?.conferences || {}))].sort().map(c=><option key={c}>{c}</option>)}</FilterMenu></label>}{!football && <button className="outline-button" onClick={()=>setDate(etDay(Date.now()))}>Today</button>}</div>
    <p className="report-note">Pregame estimates use scoring and points allowed against past opponents, blended with four league-average games. {sport==='cbb'?'Home court adds three points of margin.':'The home advantage is estimated from earlier games this season.'} Neutral games have no home adjustment. Only finals from earlier dates enter the model.</p>
    <button type="button" className="outline-button" aria-pressed={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'Show Top 9 Game Winners':'Show All Matchups'}</button>
    {!showAll && <p>Top Game Winners · Ranked by projected margin · {featured.length} picks</p>}
    <div className="research-grid matchup-grid">{(showAll?rows:featured).map((g,i)=><MatchCard compact={showAll?undefined:gameSummary(g,projection(g,ratingsFor(g)[g.away],ratingsFor(g)[g.home],true),i+1,true)} key={g.id} game={g} colors={meta.data?.colors || {}}>{g.final && <b>Final · {g.awayScore} – {g.homeScore}</b>}<MatchReport game={g} college away={ratingsFor(g)[g.away]} home={ratingsFor(g)[g.home]} names={{...meta.data?.teams,[g.away]:g.awayName,[g.home]:g.homeName}}/></MatchCard>)}</div>
    {!rows.length && <p>{error?<button onClick={error.reload}>Schedule Unavailable · Retry</button>:!index.data || valid&&!schedule.data?'Loading Games…':'No Scheduled Games for This Selection.'}</p>}</section>;
}

export function Moneylines({games,now,updated}){
  const upcoming=(games || []).filter(g=>Date.parse(g.kickoff)>now);
  const weeks=[...new Set(upcoming.map(g=>g.season+' · Week '+g.week))];
  const [selection,setSelection]=useState('');
  const week=weeks.includes(selection)?selection:weeks[0];
  const slate=upcoming.filter(g=>g.season+' · Week '+g.week===week);
  const featured=featuredGames(slate,g=>projection(g,g.awayRating,g.homeRating));
  const [showAll,setShowAll]=useState(false);
  return <section className="panel props-board"><h1>NFL Moneylines</h1><p>Market Snapshot · {updated}</p>
    <div className="board-controls"><label>Game Week<FilterMenu value={week || ''} onChange={e=>setSelection(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu></label></div>
    <button type="button" className="outline-button" aria-pressed={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'Show Top 9 Game Winners':'Show All Matchups'}</button>
    {!showAll && <p>Top Game Winners · Ranked by projected margin · {featured.length} picks</p>}
    <div className="research-grid matchup-grid">{(showAll?slate:featured).map((g,i)=>
      <MatchCard compact={showAll?undefined:gameSummary(g,projection(g,g.awayRating,g.homeRating),i+1)} key={g.kickoff+g.home} game={g}><MatchReport game={g} away={g.awayRating} home={g.homeRating}/></MatchCard>
    )}</div>{!upcoming.length && <p>No Upcoming Games Available.</p>}
    <p className="board-foot">The model adjusts scoring and points allowed for opponent strength, blends each team with four league-average games and gives the home team 1.5 points outside neutral venues. Projections start after three games per team. Confirmed Out players reduce projected offense in proportion to their share of team workload over the previous four team games. A full share of pass attempts is worth 3 points, carries 1 point and targets 1 point. These are heuristic weights. When an identified starting QB is out and a depth-chart alternate is available, the QB efficiency difference replaces his workload deduction. Other designations and defensive absences appear in the injury report for context. Prices come from the nflverse schedule snapshot. A dash indicates an unavailable price.</p></section>;
}

export function UsageTrends({games,label,value}){
  const rows=games.slice(-10).map(g=>({label:g.date || ('Week '+g.week),value:value(g)}));
  const numbers=rows.map(r=>r.value);
  const max=Math.max(1,...numbers.filter(Number.isFinite));
  function average(values){return values.length===3 && values.every(Number.isFinite)?(values.reduce((a,b)=>a+b,0)/3).toFixed(1):'—'}
  return <section className="usage-trend"><h2>Usage Trends</h2><p>{label} · Last 3 Avg <b>{average(numbers.slice(-3))}</b> · Previous 3 Avg <b>{average(numbers.slice(-6,-3))}</b></p>
    <div className="usage-bars">{rows.map((r,i)=><div key={i} title={r.label}><b>{r.value ?? '—'}</b><i style={{height:(Number.isFinite(r.value)?2+40*r.value/max:0)+'px'}}/><small>{r.label}</small></div>)}</div></section>;
}
