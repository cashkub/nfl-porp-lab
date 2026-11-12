import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import NflToolHeader from '../components/NflToolHeader.jsx';
import FilterMenu from '../components/FilterMenu.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import {BarChart3} from 'lucide-react';
import '../components/ModelRecordPicks.css';
import '../components/NflGames.css';
import '../components/NflPropList.css';
import '../components/TopLooks.css';
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
function Select({label,value,onChange,children,disabled=false}){
  return <label className="cb-select chart-filter">{label}<FilterMenu aria-label={label} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}>{children}</FilterMenu></label>;
}
function Headshot({id,team,large=false}){
  const [failed,setFailed]=useState(null);
  return <span className={'cb-face'+(large?' cb-face-large':'')}>{id&&failed!==id?
    <img alt="" loading="lazy" decoding="async" src={'https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/'+id+'.png'} onError={()=>setFailed(id)}/>:
    <TeamLogo sport="cbb" team={team}/>}</span>;
}
function Team({id,teams}){
  const info=teams[id];
  return <span className="cb-team" style={{'--team':'#'+(info?.color||'b69bd8')}}><TeamLogo team={id} sport="cbb"/>{info?.rank?'#'+info.rank+' ':''}{info?.name||id}</span>;
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
  const directory=useFile('team-directory.json').value;
  const [ranked,setRanked]=useState(false),[conference,setConference]=useState('');
  const ranks=directory?.ranks||{},conferences=directory?.conferences||{};
  const teams=Object.fromEntries(Object.entries(meta.teams).map(([id,t])=>[id,{...t,rank:ranks[id]}]));
  const match=id=>(!ranked||Boolean(ranks[id]))&&(!conference||conferences[id]===conference);
  const games=(slate.value||[]).filter(g=>match(g.home)||match(g.away));
  const playerGames=games.map(g=>({...g,roster:g.roster.filter(p=>match(p.team)),lines:[],priced:false}));
  const filteredPlayers=selected&&games.some(g=>g.id===selected)?playerGames.filter(g=>g.id===selected):playerGames;
  const game=games.find(g=>g.id===selected);
  function chart(g,p,k){pickGame(g.id);setTarget({id:p,metric:k});location.hash='cbb-charts';}
  return <>
    {page!=='record'&&<div className="cb-controls panel"><Select label="Game date" value={day} onChange={d=>{setDay(d);pickGame('');setTarget(null);}}>{meta.days.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select>
      {['games','charts','props'].includes(page)&&<>
        <Select label="Team ranking" value={ranked?'ranked':'all'} disabled={!directory?.ranks} onChange={v=>{setRanked(v==='ranked');pickGame('');setTarget(null);}}>
          <option value="all">All teams</option><option value="ranked">AP Top 25</option>
        </Select>
        <Select label="Conference" value={conference} onChange={c=>{setConference(c);pickGame('');setTarget(null);}}><option value="">All conferences</option>{[...new Set(Object.values(conferences))].sort().map(c=><option key={c}>{c}</option>)}</Select>
      </>}
      {page!=='top'&&<Select label="Matchup · Eastern time" value={game?.id||''} onChange={id=>{pickGame(id);setTarget(null);}}><option value="">All games</option>{games.map(g=><option key={g.id} value={g.id}>{timeFmt.format(new Date(g.time))} · {ranks[g.away]?'#'+ranks[g.away]+' ':''}{teams[g.away].name} @ {ranks[g.home]?'#'+ranks[g.home]+' ':''}{teams[g.home].name}</option>)}</Select>}</div>}
    {page==='record'||page==='top'?record.value?<Ledger teams={teams} rows={record.value} top={page==='top'} day={day} evaluation={meta.evaluation}/>:<p>{record.error?'Record unavailable.':'Loading picks…'}</p>:
      !slate.value?<p>{slate.error?'Slate unavailable.':'Loading slate…'}</p>:!games.length?<p>No matching games for {labelDay(day)}.</p>:
      page==='games'?game?<Detail game={{...game,roster:filteredPlayers[0].roster,priced:false,lines:[]}} meta={{...meta,teams}} back={()=>pickGame('')} chart={chart}/>:<div className="weekly-slate">{games.map(g=><GameCard key={g.id} game={g} teams={teams} open={()=>pickGame(g.id)}/>)}</div>:
      page==='props'?<PropList games={filteredPlayers} teams={teams} chart={chart}/>:<Charts key={target?.id+':'+(target?.metric||'')+day} games={filteredPlayers} teams={teams} target={target}/>}
    <p className="cb-foot">Pregame snapshot · {dateFmt.format(new Date(meta.updated))}, {timeFmt.format(new Date(meta.updated))} · hoopR box scores</p>
  </>;
}
function GameCard({game:g,teams,open}){
  const win=g.homeWin>=.5?g.home:g.away;
  const leader=g.homeScore>=g.awayScore?g.home:g.away;
  const margin=Math.abs(g.homeScore-g.awayScore);
  return <button className="slate-fixture" onClick={open}>
    <span className="slate-pair"><b><Team id={g.away} teams={teams}/> @ <Team id={g.home} teams={teams}/></b><small>{timeFmt.format(new Date(g.time))} · {g.neutral?'Neutral court':'Home court'}</small></span>
    <span><small>Projected winner</small><b>{teams[win].name}</b><em>{pct(Math.max(g.homeWin,1-g.homeWin))} model win</em></span>
    <span><small>Projected margin</small><b>{margin?teams[leader].name+' by '+margin.toFixed(1):'Even'}</b></span>
    <span><small>Projected total</small><b>{(g.homeScore+g.awayScore).toFixed(1)}</b><em>{g.awayScore} – {g.homeScore}</em></span>
    <span className="slate-chevron" aria-hidden="true">›</span>
  </button>;
}
function Detail({game:g,meta,back,chart}){
  const {teams}=meta;
  const [tab,set]=useState('Game picks');
  return <><button className="cb-back" onClick={back}>← All games</button><div className="cb-panel lab-block"><h2><Team id={g.away} teams={teams}/> @ <Team id={g.home} teams={teams}/></h2><p>{g.arena||'Venue unlisted'} · {g.neutral?'Neutral court':'Home court'} · {timeFmt.format(new Date(g.time))}</p><strong className="cb-score">Projected score {g.awayScore} – {g.homeScore}</strong></div>
  <div className="cb-tabs">{['Game picks','Player props','Matchup breakdown'].map(t=><button aria-pressed={t===tab} key={t} onClick={()=>set(t)}>{t}</button>)}</div>
  {tab==='Player props'?<PropList games={[g]} teams={teams} chart={chart}/>:tab==='Game picks'?<section className="cb-panel lab-block"><h2>Pregame markets</h2><p>Model total {(g.homeScore+g.awayScore).toFixed(1)} · Home margin {(g.homeScore-g.awayScore).toFixed(1)} · Home win {pct(g.homeWin)}</p>{g.picks.map(p=><p key={p.market}><b>{p.market} · {p.label} {p.market==='Moneyline'?'':p.line}</b> · DK {money(p.price)} · {pct(p.prob)} model probability{p.quoted?' · Quote '+dateFmt.format(new Date(p.quoted))+', '+timeFmt.format(new Date(p.quoted)):''}{p.ev<=0?' · No positive estimated value':''}</p>)}{!g.picks.length&&<p>CBB sportsbook updates are paused.</p>}</section>:
  <section className="cb-panel lab-block"><h2>Matchup breakdown</h2><p>{g.pace} projected possessions · {g.court} points home-court adjustment</p><div className="cb-scroll"><table><thead><tr><th>Profile</th>{[g.away,g.home].map(t=><th key={t}><Team id={t} teams={teams}/></th>)}</tr></thead><tbody>{[['AdjO','adjO'],['AdjD','adjD'],['AdjT','adjT']].map(([label,k])=><tr key={k}><th>{label}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k]}</td>)}</tr>)}{['Effective FG','Turnover rate','Offensive rebound rate','FT attempts / FG attempts'].flatMap((label,i)=>['offense','defense'].map(k=><tr key={k+i}><th>{label} · {k==='offense'?'offense':'allowed'}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k][i]==null?'—':g.ratings[t][k][i]+'%'}</td>)}</tr>))}<tr><th>Days since last game</th>{[g.away,g.home].map(t=><td key={t}>{g.rest[t]??'—'}</td>)}</tr></tbody></table></div><h3>Availability</h3>{[g.away,g.home].map(t=>g.missingScoring?.[t]>0&&<p key={t}>{teams[t].name} · projected scoring reduced by {g.missingScoring[t]} points for reported absences.</p>)}{g.injuries.length?g.injuries.map((r,i)=><p key={i}>{r.name} · {r.status}</p>):<p>{meta.injuryFeed?'No players listed in the available report.':'Injury feed unavailable.'}</p>}</section>}</>;
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
  return <section className="cb-panel lab-block"><div className="cb-controls panel"><Select label="Market" value={market} onChange={v=>{setMarket(v);setLimit(40);}}><option value="ALL">All markets</option>{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><label className="cb-select">Find player<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player name"/></label></div><div className="prop-table-scroll cb-scroll"><table className="cb-props prop-research-table"><thead><tr>{headers.map(([k,v])=><th key={k} aria-sort={sort[0]===k?(sort[1]===1?'ascending':'descending'):'none'}><button className="column-sort" onClick={()=>setSort([k,sort[0]===k?-sort[1]:k==='name'?1:-1])}>{v} {sort[0]===k?(sort[1]>0?'↑':'↓'):'↕'}</button></th>)}</tr></thead><tbody>{rows.slice(0,limit).map((r,i)=><tr key={r.g.id+r.name+r.metric+i}><td style={{'--club':'#'+(teams[r.team]?.color||'aa77cc')}}><button className="cb-player" disabled={!r.pid} onClick={()=>chart(r.g,r.pid,r.metric)}><Headshot id={r.pid} team={r.team}/><span className="cb-player-copy"><b>{r.name}</b><small>{teams[r.team]?.name} · {markets[r.metric]}</small></span></button></td><td>{r.line}<small>{r.book?'DK · O '+money(r.over)+' / U '+money(r.under):'Player avg'}</small></td><td>{r.proj??'—'}</td><td>{r.minutes??'—'}</td></tr>)}</tbody></table></div>{!rows.length&&<p>No players match this selection.</p>}{rows.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more ({rows.length-limit})</button>}</section>;
}
function valueOf(g,k){if(k==='PRA')return g.points+g.rebounds+g.assists;if(k==='PR')return g.points+g.rebounds;if(k==='PA')return g.points+g.assists;if(k==='RA')return g.rebounds+g.assists;return g[k];}
function Charts({games,teams,target}){
  const [selectedLog,setSelectedLog]=useState('');
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
  return <section className="cb-panel lab-block"><div className="cb-controls panel"><Select label="Player" value={p.id} onChange={v=>{select(v);setL('');}}>{available.map(({p,g})=><option key={g.id+p.id} value={p.id}>{p.name} · {teams[p.team]?.name}</option>)}</Select><Select label="Market" value={metric} onChange={v=>{setK(v);setL('');}}>{keys.map(k=><option key={k} value={k}>{markets[k]}</option>)}</Select><Select label="Venue history" value={venue} onChange={setV}>{venueOptions.map(v=><option key={v}>{v}</option>)}</Select><Select label="Side" value={side} onChange={setSide}><option value="over">Over</option><option value="under">Under</option></Select><label className="cb-select">Research line<input type="number" min="0" step=".5" value={line} placeholder={String(base)} onChange={e=>setL(e.target.value)}/></label></div>
  <div className="lab-player" style={{'--club':'#'+teams[p.team]?.color}}><div><h2 className="cb-identity"><Headshot id={p.id} team={p.team} large/>{p.name}</h2><Team id={p.team} teams={teams}/><p>{p.role} · {p.venue} · {p.minutes} projected minutes · {p.sample} games played · recent minutes {p.minuteRange?.join('–')} · {p.starts} recent starts · {p.foulRate} fouls per 40</p></div></div>
  <div className="cb-kpis"><span><small>Model projection</small><b>{p.estimate[metric]}</b></span><span><small>{line!==''?'Research line':book?'DraftKings line':'Player average'}</small><b>{point}</b></span><span><small>Historical {side}</small><b>{vals.length?vals.filter(hit).length+'/'+vals.length:'—'}</b></span></div>
  {hist.error?<p>Game log unavailable.</p>:logs.length?<><div className="plot-heading"><span>{markets[metric]}</span><small>{logs.length} games shown</small></div>
    <div className="margin-scroll"><div className="margin-bars" style={{'--count':logs.length,'--target':(8+75*point/max)+'%'}}>
      {logs.map((l,i)=>{
        const result=vals[i]===point?'Push':hit(vals[i])?'Hit':'Miss';
        return <button type="button" key={l.game} data-result={result} aria-pressed={selectedLog===l.game} aria-label={l.date+' vs '+(teams[l.opp]?.name||l.opp)+', '+vals[i]+' '+markets[metric]+', '+result} onClick={()=>setSelectedLog(selectedLog===l.game?'':l.game)}>
          <span className="bar-space"><i style={{bottom:'8%',height:Math.max(1,75*vals[i]/max)+'%'}}/><strong style={{bottom:(8+75*vals[i]/max)+'%'}}>{vals[i]}</strong>{i===logs.length-1&&<span className="chart-reference">{side} {point}</span>}</span>
          <span className="chart-opponent"><TeamLogo sport="cbb" className="chart-logo" team={l.opp}/></span><span>{l.date.slice(5)}</span><span>{result}</span>
        </button>;
      })}
    </div></div>
    {logs.filter(l=>l.game===selectedLog).map(l=><p key={l.game} role="status">{l.date} · {l.venue} vs {teams[l.opp]?.name||l.opp} · {l.min} minutes · {valueOf(l,metric)} {markets[metric].toLowerCase()}</p>)}<details><summary>Game log</summary>{logs.slice().reverse().map(l=><p key={l.game}>{l.date} · {l.venue} vs {teams[l.opp]?.name||l.opp} · {l.min} min · {valueOf(l,metric)} {markets[metric]}</p>)}</details></>:<p>{hist.value?'No games in this venue split.':'Loading game log…'}</p>}
  <p>Estimated middle range · {p.range?.[metric]?.join('–')} {markets[metric].toLowerCase()}</p><h3>Opponent defense vs {p.role.toLowerCase()}</h3>{adj?<p>{adj[0]>0?'+':''}{adj[0]}% versus expected {markets[metric].toLowerCase()} across {adj[1]} prior player appearances in this role. {adj[1]>0&&<>Allowed {adj[2]} per appearance versus {adj[3]} expected. </>}{p.defenseRank?.[metric]&&<>Ranks {p.defenseRank[metric][0]} of {p.defenseRank[metric][1]} eligible defenses, most allowed relative to expectation first. </>}Position adjustment {pos[0]>0?'+':''}{pos[0]}% ({pos[1]} appearances).</p>:<p>Combination projections use the individual stat matchups.</p>}</section>;
}
function weekOf(time){
  const d=new Date(etDay(time)+'T12:00Z');
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
function RecordPick({row:r,teams,byName}){
  const [awayName,homeName]=r.matchup.split(' @ ');
  const away=r.away||byName.get(awayName),home=r.home||byName.get(homeName);
  const player=r.market==='Player prop';
  const picked=player?r.team:r.side==='away'?away:r.side==='home'?home:null;
  const color=id=>teams[id]?.color?'#'+teams[id].color:'#9f79b7';
  const description=player?r.side+' '+r.line+' '+markets[r.metric]:r.market==='Moneyline'?'ML':r.line;
  return <article className="cb-pick cb-record-pick" style={{'--away-color':color(away),'--home-color':color(home),'--pick-color':color(picked)}}>
    <div className="cb-record-match">{away&&home?<><span><TeamLogo sport="cbb" team={away}/>{awayName}</span><small>@</small><span><TeamLogo sport="cbb" team={home}/>{homeName}</span></>:r.matchup}</div>
    <small>{dateFmt.format(new Date(r.time))}</small>
    <h3 className="cb-record-selection">{player?<Headshot id={r.pid} team={picked}/>:picked&&<TeamLogo sport="cbb" team={picked}/>}<span>{r.label} {description}</span></h3>
    <p>DK {money(r.price)} · {pct(r.prob)} model · {r.result||'Pending'}</p>
    <small>{Date.parse(r.time)<=Date.now()?'Locked':'Pregame'} · Saved {dateFmt.format(new Date(r.saved))}, {timeFmt.format(new Date(r.saved))}</small>
  </article>;
}
function Ledger({teams,rows,top,day,evaluation}){
  const [market,setMarket]=useState('All'),[date,setDate]=useState('All'),[limit,setLimit]=useState(40);
  const dates=[...new Set(rows.map(r=>weekOf(r.time)))].sort().reverse();
  const show=rows.filter(r=>(top?etDay(r.time)===day&&r.market==='Player prop'&&r.top:date==='All'||weekOf(r.time)===date)&&(top||market==='All'||market===r.market))
    .sort((a,b)=>top?b.ev-a.ev:b.time.localeCompare(a.time));
  const byName=new Map(Object.entries(teams).map(([id,t])=>[t.name,id]));
  const counts=s=>show.filter(r=>r.result===s).length;
  return <section className="cb-panel lab-block">{top?<><div className="top-looks-heading"><h2>Ranked player props</h2><span className="slate-count">{show.length} qualified</span></div><p>CBB sportsbook updates are paused. Player Charts and Prop Lists show projections and season averages.</p></>:<><RecordHeader title={market==='All'?'College basketball':market} icon={BarChart3}>Saved pregame picks and settled results by week.</RecordHeader><div className="cb-tabs">{['All','Player prop','Moneyline','Total','Spread'].map(m=><button key={m} aria-pressed={m===market} onClick={()=>setMarket(m)}>{m}</button>)}</div><Select label="Week starting Monday" value={date} onChange={setDate}><option>All</option>{dates.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select><p>{counts('Win')} wins · {counts('Loss')} losses · {counts('Push')} pushes · {counts('Void')} void · {show.filter(r=>!r.result).length} pending</p></>}
    {!show.length&&<p>{top?'No saved Top Looks for this date.':'No saved picks in this selection.'}</p>}
    {show.slice(0,limit).map(r=><RecordPick key={[r.game,r.market,r.pid,r.metric,r.side,r.line].join('-')} row={r} teams={teams} byName={byName}/>)}
    {show.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more</button>}
    {!top&&<details><summary>Historical game-model check</summary><p>{evaluation.games} games in the season ending {evaluation.season}, predicted chronologically. Winner accuracy {pct(evaluation.winner)} · margin error {evaluation.marginMAE} points · total error {evaluation.totalMAE} points.</p>{evaluation.playerCount>0&&<p>Current-season player check · {evaluation.playerCount} projected players who appeared in sampled games. Average absolute errors · minutes {evaluation.playerErrors.minutes}, points {evaluation.playerErrors.points}, rebounds {evaluation.playerErrors.rebounds}, assists {evaluation.playerErrors.assists}.</p>}</details>}</section>;
}
document.documentElement.dataset.theme='dark';
createRoot(document.getElementById('root')).render(<Shell/>);
