import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import NflToolHeader from '../components/NflToolHeader.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import '../styles.css';
import '../components/NflCharts.css';
import './styles.css';

const markets={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'Made threes',turnovers:'Turnovers',steals:'Steals',blocks:'Blocks',PRA:'Points + rebounds + assists',PR:'Points + rebounds',PA:'Points + assists',RA:'Rebounds + assists'};
const pages=['charts','props','top','games','record'];
const venueOptions=['All','Home','Away','Neutral'];
const money=v=>v==null?'—':(v>0?'+':'')+v;
const pct=v=>v==null?'—':Math.round(v*100)+'%';
const dateFmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',weekday:'short'});
const timeFmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const etDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const labelDay=d=>dateFmt.format(new Date(d+'T12:00Z'));
function useFile(file){
  const [state,set]=useState({});
  useEffect(()=>{
    if(!file)return;
    const ctrl=new AbortController();
    fetch('/data/cbb-v2/'+file,{signal:ctrl.signal,cache:'no-cache'}).then(r=>{
      if(!r.ok)throw Error();return r.json();
    }).then(value=>set({file,value})).catch(()=>{if(!ctrl.signal.aborted)set({file,error:true});});
    return ()=>ctrl.abort();
  },[file]);
  return state.file===file?state:{};
}
const current=()=>window.location.hash.replace('#cbb-','');
function Select({label,value,onChange,children}){
  return <label className="cb-select">{label}<select value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>;
}
function Team({id,teams}){
  const info=teams[id];
  return <span className="cb-team" style={{'--team':'#'+(info?.color||'b69bd8')}}><TeamLogo team={id} sport="cbb"/>{info?.name||id}</span>;
}
function Shell(){
  const [page,setPage]=useState(current);
  const meta=useFile('index.json');
  useEffect(()=>{
    const onHash=()=>{const next=current();if(!pages.includes(next)){location.replace('/preview/cbb/');return;}setPage(next);window.scrollTo(0,0);};
    window.addEventListener('hashchange',onHash);return ()=>window.removeEventListener('hashchange',onHash);
  },[]);
  return <main className="chart-lab cb"><NflToolHeader league="CBB" active={page}/>{meta.value?<League page={page} meta={meta.value}/>:<p role="status">{meta.error?'CBB snapshot unavailable.':'Loading college basketball…'}</p>}</main>;
}
function League({page,meta}){
  const today=etDay(Date.now());
  const [chosenDay,setDay]=useState('');
  const day=meta.days.includes(chosenDay)?chosenDay:(meta.firstDay>=today?meta.firstDay:meta.days.find(d=>d>=today))||meta.days.at(-1);
  const slate=useFile(day+'.json'),record=useFile(['top','record'].includes(page)?'record.json':null);
  const [selected,pickGame]=useState('');
  const [target,setTarget]=useState(null);
  const games=slate.value||[];
  const game=games.find(g=>g.id===selected);
  function chart(g,p,k){pickGame(g.id);setTarget({id:p,metric:k});location.hash='cbb-charts';}
  return <>
    {page!=='record'&&<div className="cb-controls"><Select label="Game date" value={day} onChange={d=>{setDay(d);pickGame('');setTarget(null);}}>{meta.days.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select>
      {page!=='top'&&<Select label="Matchup · Eastern time" value={game?.id||''} onChange={id=>{pickGame(id);setTarget(null);}}><option value="">All games</option>{games.map(g=><option key={g.id} value={g.id}>{timeFmt.format(new Date(g.time))} · {meta.teams[g.away].name} @ {meta.teams[g.home].name}</option>)}</Select>}</div>}
    {page==='record'||page==='top'?record.value?<Ledger rows={record.value} top={page==='top'} day={day} evaluation={meta.evaluation}/>:<p>{record.error?'Record unavailable.':'Loading picks…'}</p>:
      !slate.value?<p>{slate.error?'Slate unavailable.':'Loading slate…'}</p>:!games.length?<p>No upcoming games in this snapshot for {labelDay(day)}.</p>:
      page==='games'?game?<Detail game={game} meta={meta} back={()=>pickGame('')} chart={chart}/>:<div className="cb-slate">{games.map(g=><GameCard key={g.id} game={g} teams={meta.teams} open={()=>pickGame(g.id)}/>)}</div>:
      page==='props'?<PropList games={game?[game]:games} teams={meta.teams} chart={chart}/>:<Charts key={target?.id+':'+(target?.metric||'')+day} games={game?[game]:games} teams={meta.teams} target={target}/>}
    <p className="cb-foot">Pregame snapshot · {dateFmt.format(new Date(meta.updated))}, {timeFmt.format(new Date(meta.updated))} · hoopR box scores · DraftKings where posted</p>
  </>;
}
function GameCard({game:g,teams,open}){
  const win=g.homeWin>=.5?g.home:g.away;
  return <button className="cb-game" onClick={open}><small>{timeFmt.format(new Date(g.time))} · {g.neutral?'Neutral court':'Home court'}</small><Team id={g.away} teams={teams}/><Team id={g.home} teams={teams}/>
    <span className="cb-score">{g.awayScore} – {g.homeScore}</span><span>Winner · {teams[win].name} ({pct(Math.max(g.homeWin,1-g.homeWin))})</span>
    <span>{g.picks.length?g.picks.map(p=>p.market+' '+p.label+(p.market==='Spread'?' '+money(p.line):p.market==='Total'?' '+p.line:'')+' ('+money(p.price)+')').join(' · '):'DraftKings game lines unavailable'}</span></button>;
}
function Detail({game:g,meta,back,chart}){
  const {teams}=meta;
  const [tab,set]=useState('Game picks');
  return <><button className="cb-back" onClick={back}>← All games</button><div className="cb-panel"><h2><Team id={g.away} teams={teams}/> @ <Team id={g.home} teams={teams}/></h2><p>{g.arena||'Venue unlisted'} · {g.neutral?'Neutral court':'Home court'} · {timeFmt.format(new Date(g.time))}</p><strong className="cb-score">Projected score {g.awayScore} – {g.homeScore}</strong></div>
  <div className="cb-tabs">{['Game picks','Player props','Matchup breakdown'].map(t=><button aria-pressed={t===tab} key={t} onClick={()=>set(t)}>{t}</button>)}</div>
  {tab==='Player props'?<PropList games={[g]} teams={teams} chart={chart}/>:tab==='Game picks'?<section className="cb-panel"><h2>Pregame markets</h2><p>Model total {(g.homeScore+g.awayScore).toFixed(1)} · Home margin {(g.homeScore-g.awayScore).toFixed(1)} · Home win {pct(g.homeWin)}</p>{g.picks.map(p=><p key={p.market}><b>{p.market} · {p.label} {p.market==='Moneyline'?'':p.line}</b> · DK {money(p.price)} · {pct(p.prob)} model probability{p.quoted?' · Quote '+dateFmt.format(new Date(p.quoted))+', '+timeFmt.format(new Date(p.quoted)):''}{p.ev<=0?' · No positive estimated value':''}</p>)}{!g.picks.length&&<p>DraftKings game markets unavailable.</p>}</section>:
  <section className="cb-panel"><h2>Matchup breakdown</h2><p>{g.pace} projected possessions · {g.court} points home-court adjustment</p><div className="cb-scroll"><table><thead><tr><th>Profile</th>{[g.away,g.home].map(t=><th key={t}><Team id={t} teams={teams}/></th>)}</tr></thead><tbody>{[['AdjO','adjO'],['AdjD','adjD'],['AdjT','adjT']].map(([label,k])=><tr key={k}><th>{label}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k]}</td>)}</tr>)}{['Effective FG','Turnover rate','Offensive rebound rate','FT attempts / FG attempts'].flatMap((label,i)=>['offense','defense'].map(k=><tr key={k+i}><th>{label} · {k==='offense'?'offense':'allowed'}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k][i]==null?'—':g.ratings[t][k][i]+'%'}</td>)}</tr>))}<tr><th>Days since last game</th>{[g.away,g.home].map(t=><td key={t}>{g.rest[t]??'—'}</td>)}</tr></tbody></table></div><h3>Availability</h3>{[g.away,g.home].map(t=>g.missingScoring?.[t]>0&&<p key={t}>{teams[t].name} · projected scoring reduced by {g.missingScoring[t]} points for reported absences.</p>)}{g.injuries.length?g.injuries.map((r,i)=><p key={i}>{r.name} · {r.status}</p>):<p>{meta.injuryFeed?'No players listed in the available report.':'Injury feed unavailable.'}</p>}</section>}</>;
}
function rowsFor(games,metric){
  return games.flatMap(g=>g.priced?g.lines.filter(l=>metric==='ALL'||l.metric===metric).map(l=>({...l,g,book:true})):
    g.roster.flatMap(p=>(metric==='ALL'?Object.keys(markets):[metric]).map(k=>({pid:p.id,name:p.name,team:p.team,metric:k,proj:p.estimate[k],line:p.average[k],minutes:p.minutes,g}))));
}
function PropList({games,teams,chart}){
  const [market,setMarket]=useState('points'),[search,setSearch]=useState(''),[sort,setSort]=useState(['proj',-1]),[limit,setLimit]=useState(40);
  const rows=useMemo(()=>rowsFor(games,market).filter(r=>r.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>{
    const [k,dir]=sort;if(a[k]==null)return b[k]==null?0:1;if(b[k]==null)return -1;
    return dir*(typeof a[k]==='string'?a[k].localeCompare(b[k]):a[k]-b[k]);
  }),[games,market,search,sort]);
  const headers=[['name','Player'],['line','Line'],['proj','Model'],['minutes','Min']];
  return <section className="cb-panel"><div className="cb-controls"><Select label="Market" value={market} onChange={v=>{setMarket(v);setLimit(40);}}><option value="ALL">All markets</option>{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><label className="cb-select">Find player<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player name"/></label></div><table className="cb-props"><thead><tr>{headers.map(([k,v])=><th key={k} aria-sort={sort[0]===k?(sort[1]===1?'ascending':'descending'):'none'}><button onClick={()=>setSort([k,sort[0]===k?-sort[1]:k==='name'?1:-1])}>{v} {sort[0]===k?(sort[1]>0?'↑':'↓'):'↕'}</button></th>)}</tr></thead><tbody>{rows.slice(0,limit).map((r,i)=><tr key={r.g.id+r.name+r.metric+i}><td style={{borderLeft:r.team?'3px solid #'+teams[r.team]?.color:undefined}}><button className="cb-player" disabled={!r.pid} onClick={()=>chart(r.g,r.pid,r.metric)}><TeamLogo sport="cbb" team={r.team}/>{r.name}</button><small>{teams[r.team]?.name} · {markets[r.metric]}</small></td><td>{r.line}<small>{r.book?'DK · O '+money(r.over)+' / U '+money(r.under):'Player avg'}</small></td><td>{r.proj??'—'}</td><td>{r.minutes??'—'}</td></tr>)}</tbody></table>{!rows.length&&<p>No players match this selection.</p>}{rows.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more ({rows.length-limit})</button>}</section>;
}
function valueOf(g,k){if(k==='PRA')return g.points+g.rebounds+g.assists;if(k==='PR')return g.points+g.rebounds;if(k==='PA')return g.points+g.assists;if(k==='RA')return g.rebounds+g.assists;return g[k];}
function Charts({games,teams,target}){
  const available=useMemo(()=>games.flatMap(g=>g.roster.filter(p=>!g.priced||g.lines.some(l=>l.pid===p.id)).map(p=>({p,g}))),[games]);
  const [id,select]=useState(target?.id||''),[k,setK]=useState(target?.metric||'points'),[venue,setV]=useState('All'),[line,setL]=useState(''),[side,setSide]=useState('over');
  const item=available.find(x=>x.p.id===id)||available[0],p=item?.p,g=item?.g;
  const hist=useFile(p?'teams/'+p.team+'.json':null);
  if(!p)return <p>No rotation history for this selection.</p>;
  const listed=g.lines.filter(l=>l.pid===p.id),keys=g.priced?[...new Set(listed.map(l=>l.metric))]:Object.keys(markets),metric=keys.includes(k)?k:keys[0];
  const book=listed.find(l=>l.metric===metric),base=book?.line??p.average[metric],point=line===''?base:Number(line);
  const logs=(hist.value?.[p.id]||[]).filter(l=>venue==='All'||l.venue===venue).slice(-15);
  const vals=logs.map(l=>valueOf(l,metric)),max=Math.max(1,point,...vals),hit=v=>side==='over'?v>point:v<point;
  const adj=p.adjustment[metric],pos=p.positionEffect[metric];
  return <section className="cb-panel"><div className="cb-controls"><Select label="Player" value={p.id} onChange={v=>{select(v);setL('');}}>{available.map(({p,g})=><option key={g.id+p.id} value={p.id}>{p.name} · {teams[p.team]?.name}</option>)}</Select><Select label="Market" value={metric} onChange={v=>{setK(v);setL('');}}>{keys.map(k=><option key={k} value={k}>{markets[k]}</option>)}</Select><Select label="Venue history" value={venue} onChange={setV}>{venueOptions.map(v=><option key={v}>{v}</option>)}</Select><Select label="Side" value={side} onChange={setSide}><option value="over">Over</option><option value="under">Under</option></Select><label className="cb-select">Research line<input type="number" min="0" step=".5" value={line} placeholder={String(base)} onChange={e=>setL(e.target.value)}/></label></div>
  <h2>{p.name}</h2><Team id={p.team} teams={teams}/><p>{p.role} · {p.venue} · {p.minutes} projected minutes · {p.sample} games played · recent minutes {p.minuteRange?.join('–')} · {p.starts} recent starts · {p.foulRate} fouls per 40</p>
  <div className="cb-kpis"><span><small>Model projection</small><b>{p.estimate[metric]}</b></span><span><small>{line!==''?'Research line':book?'DraftKings line':'Player average'}</small><b>{point}</b></span><span><small>Historical {side}</small><b>{vals.length?vals.filter(hit).length+'/'+vals.length:'—'}</b></span></div>
  {hist.error?<p>Game log unavailable.</p>:logs.length?<><div className="cb-bars" aria-label={markets[metric]+' by game'}>{logs.map((l,i)=><div key={l.game} title={l.date+' · '+l.venue+' · '+vals[i]}><b>{vals[i]}</b><i style={{height:(vals[i]/max*75+2)+'px',background:hit(vals[i])?'#c6a1f2':'#595461'}}/><small>{l.date.slice(5)}</small></div>)}</div><details><summary>Game log</summary>{logs.slice().reverse().map(l=><p key={l.game}>{l.date} · {l.venue} vs {teams[l.opp]?.name||l.opp} · {l.min} min · {valueOf(l,metric)} {markets[metric]}</p>)}</details></>:<p>{hist.value?'No games in this venue split.':'Loading game log…'}</p>}
  <p>Estimated middle range · {p.range?.[metric]?.join('–')} {markets[metric].toLowerCase()}</p><h3>Opponent defense vs {p.role.toLowerCase()}</h3>{adj?<p>{adj[0]>0?'+':''}{adj[0]}% versus expected {markets[metric].toLowerCase()} across {adj[1]} prior player appearances in this role. {adj[1]>0&&<>Allowed {adj[2]} per appearance versus {adj[3]} expected. </>}{p.defenseRank?.[metric]&&<>Ranks {p.defenseRank[metric][0]} of {p.defenseRank[metric][1]} eligible defenses, most allowed relative to expectation first. </>}Position adjustment {pos[0]>0?'+':''}{pos[0]}% ({pos[1]} appearances).</p>:<p>Combination projections use the individual stat matchups.</p>}</section>;
}
function weekOf(time){
  const d=new Date(etDay(time)+'T12:00Z');
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
function Ledger({rows,top,day,evaluation}){
  const [market,setMarket]=useState('All'),[date,setDate]=useState('All'),[limit,setLimit]=useState(40);
  const dates=[...new Set(rows.map(r=>weekOf(r.time)))].sort().reverse();
  const show=rows.filter(r=>(top?etDay(r.time)===day&&r.market==='Player prop'&&r.top:date==='All'||weekOf(r.time)===date)&&(top||market==='All'||market===r.market))
    .sort((a,b)=>top?b.ev-a.ev:b.time.localeCompare(a.time));
  const counts=s=>show.filter(r=>r.result===s).length;
  return <section className="cb-panel">{top?<><h2>Ranked player props</h2><p>Posted DraftKings lines · positive estimated value · at least five player games</p></>:<><div className="cb-tabs">{['All','Player prop','Moneyline','Total','Spread'].map(m=><button key={m} aria-pressed={m===market} onClick={()=>setMarket(m)}>{m}</button>)}</div><Select label="Week starting Monday" value={date} onChange={setDate}><option>All</option>{dates.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select><p>{counts('Win')} wins · {counts('Loss')} losses · {counts('Push')} pushes · {counts('Void')} void · {show.filter(r=>!r.result).length} pending</p></>}
    {!show.length&&<p>{top?'No qualifying priced player props in this snapshot.':'No saved picks in this selection.'}</p>}
    {show.slice(0,limit).map((r,i)=><article className="cb-pick" key={r.game+r.market+r.label+r.side+i}><small>{r.matchup} · {dateFmt.format(new Date(r.time))}</small><h3>{r.label} {r.market==='Player prop'?r.side+' '+r.line+' '+markets[r.metric]:r.market==='Moneyline'?'ML':r.line}</h3><p>DK {money(r.price)} · {pct(r.prob)} model · {r.result||'Pending'}</p><small>{Date.parse(r.time)<=Date.now()?'Locked':'Pregame'} · Saved {dateFmt.format(new Date(r.saved))}, {timeFmt.format(new Date(r.saved))}</small></article>)}
    {show.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more</button>}
    {!top&&<details><summary>Historical game-model check</summary><p>{evaluation.games} games in the season ending {evaluation.season}, predicted chronologically. Winner accuracy {pct(evaluation.winner)} · margin error {evaluation.marginMAE} points · total error {evaluation.totalMAE} points.</p>{evaluation.playerCount>0&&<p>Current-season player check · {evaluation.playerCount} projected players who appeared in sampled games. Average absolute errors · minutes {evaluation.playerErrors.minutes}, points {evaluation.playerErrors.points}, rebounds {evaluation.playerErrors.rebounds}, assists {evaluation.playerErrors.assists}.</p>}</details>}</section>;
}
document.documentElement.dataset.theme='dark';
createRoot(document.getElementById('root')).render(<Shell/>);
