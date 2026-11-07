import React,{useState} from 'react';
import {priceText} from '../lib/bookLine.js';
import {useCbbFile} from './CbbAnalyzer.jsx';

const nflColors={ARI:'97233f',ATL:'a71930',BAL:'563a88',BUF:'1865bc',CAR:'0085ca',CHI:'c83803',CIN:'fb4f14',CLE:'ff3c00',DAL:'256594',DEN:'fb4f14',DET:'0076b6',GB:'237052',HOU:'aa192f',IND:'155aa8',JAX:'00999a',KC:'e31837',LAC:'0080c6',LAR:'245ed1',LV:'90959a',MIA:'008e97',MIN:'6937a0',NE:'ba2436',NO:'bba46b',NYG:'2245a0',NYJ:'158453',PHI:'00796c',PIT:'ffb612',SEA:'69be28',SF:'c62127',TB:'d50a0a',TEN:'4595d2',WAS:'773141'};
const dayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const etDay = value => dayFormatter.format(new Date(value));
const when = value => new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const color = value => /^#?[a-f0-9]{6}$/i.test(value || '') ? '#'+value.replace('#','') : '#717d90';

export function MatchCard({game:g,colors=nflColors,children}) {
  return <article className="research-card" style={{'--away-color':color(colors[g.away]),'--home-color':color(colors[g.home])}}>
    <small>{when(g.kickoff)}{g.neutral?' · Neutral Site':''}{g.final?' · Final':''}</small>
    <h3>{g.awayName || g.away} <small>{g.neutral?'vs':'at'}</small> {g.homeName || g.home}</h3>{children}
  </article>;
}

export function CbbGames(){
  const index=useCbbFile('index.json');
  const [date,setDate]=useState(()=>etDay(Date.now()));
  const y=Number(date.slice(0,4))+(Number(date.slice(5,7))>=8?1:0);
  const valid=index.data?.seasons.includes(y);
  const schedule=useCbbFile(valid ? y+'/schedule.json':null);
  const meta=useCbbFile(valid ? y+'/teams.json':null);
  const [conf,setConf]=useState('');
  const rows=(schedule.data || []).filter(g=>etDay(g.kickoff)===date && (!conf || [g.home,g.away].some(t=>meta.data?.conferences?.[t]===conf)));
  const error=index.error?index:schedule.error?schedule:null;
  return <section className="panel props-board"><h1>CBB Games</h1><div className="board-controls"><label>Game Date (ET)<input type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label><label>Conference<select value={conf} onChange={e=>setConf(e.target.value)}><option value="">All Conferences</option>{[...new Set(Object.values(meta.data?.conferences || {}))].sort().map(c=><option key={c}>{c}</option>)}</select></label><button className="outline-button" onClick={()=>setDate(etDay(Date.now()))}>Today</button></div>
    <div className="research-grid">{rows.map(g=><MatchCard key={g.id} game={g} colors={meta.data?.colors || {}}>{g.final && <strong>{g.awayScore} – {g.homeScore}</strong>}</MatchCard>)}</div>
    {!rows.length && <p>{error?<button onClick={error.reload}>Schedule Unavailable · Retry</button>:!index.data || valid&&!schedule.data?'Loading Games…':'No Scheduled Games for This Selection.'}</p>}</section>;
}

export function Moneylines({games,now,updated}){
  const upcoming=(games || []).filter(g=>Date.parse(g.kickoff)>now);
  const weeks=[...new Set(upcoming.map(g=>g.season+' · Week '+g.week))];
  const [selection,setSelection]=useState('');
  const week=weeks.includes(selection)?selection:weeks[0];
  return <section className="panel props-board"><h1>NFL Moneylines</h1><p>Market Snapshot · {updated}</p>
    <div className="board-controls"><label>Game Week<select value={week || ''} onChange={e=>setSelection(e.target.value)}>{weeks.map(w=><option key={w}>{w}</option>)}</select></label></div>
    <div className="research-grid">{upcoming.filter(g=>g.season+' · Week '+g.week===week).map(g=>{
      const a=g.awayRating,h=g.homeRating;
      const ready=a?.games>=3 && h?.games>=3;
      const home=ready?h.offense+a.defense-h.baseline+(g.neutral?0:.75):0;
      const away=ready?a.offense+h.defense-h.baseline-(g.neutral?0:.75):0;
      const margin=Number((home-away).toFixed(1));
      return <MatchCard key={g.kickoff+g.home} game={g}><strong>{ready?(margin===0?'Model Projects a Tie':(margin>0?g.home:g.away)+' by '+Math.abs(margin)):'Projection Pending'}</strong>
        {ready && <p>Projected Score · {g.away} {away.toFixed(1)} / {g.home} {home.toFixed(1)}</p>}
        <p>Moneyline · {g.away} {priceText(g.awayPrice)} / {g.home} {priceText(g.homePrice)}<br/>Market Spread · {g.home} {priceText(g.homeSpread)}</p>
        {ready && <details><summary>Offense &amp; Defense Breakdown</summary>{[[g.away,a,g.home,h],[g.home,h,g.away,a]].map(([team,r,opp,o])=><p key={team}><b>{team}</b> scores {r.offense.toFixed(1)} adjusted points per game. {opp} allows {o.defense.toFixed(1)}. Across {r.games} games, {team} faced opponents averaging {priceText(r.scheduleStrength)} points relative to league average. Wins against {r.wins.join(', ') || 'no opponents yet'}.</p>)}</details>}
        <details><summary>Injury Report</summary>{[g.away,g.home].map(t=><p key={t}><b>{t}</b> · {g.injuries?.[t]?.map(x=>x.name+' ('+x.status+')').join(' · ') || 'No weekly report available.'}</p>)}<a href="https://www.nfl.com/injuries/">Official NFL Injury Report ↗</a></details></MatchCard>;
    })}</div>{!upcoming.length && <p>No Upcoming Games Available.</p>}
    <p className="board-foot">The model adjusts scoring and points allowed for opponent strength, blends each team with four league-average games and gives the home team 1.5 points outside neutral venues. Projections start after three games per team. Injuries are shown for context. Prices come from the nflverse schedule snapshot. A dash indicates an unavailable price.</p></section>;
}

export function UsageTrends({games,label,value}){
  const rows=games.slice(-10).map(g=>({label:g.date || ('Week '+g.week),value:value(g)}));
  const numbers=rows.map(r=>r.value);
  const max=Math.max(1,...numbers.filter(Number.isFinite));
  function average(values){return values.length===3 && values.every(Number.isFinite)?(values.reduce((a,b)=>a+b,0)/3).toFixed(1):'—'}
  return <section className="usage-trend"><h2>Usage Trends</h2><p>{label} · Last 3 Avg <b>{average(numbers.slice(-3))}</b> · Previous 3 Avg <b>{average(numbers.slice(-6,-3))}</b></p>
    <div className="usage-bars">{rows.map((r,i)=><div key={i} title={r.label}><b>{r.value ?? '—'}</b><i style={{height:(Number.isFinite(r.value)?2+40*r.value/max:0)+'px'}}/><small>{r.label}</small></div>)}</div></section>;
}
