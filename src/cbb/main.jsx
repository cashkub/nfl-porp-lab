import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import NflToolHeader from '../components/NflToolHeader.jsx';
import GameBars from '../components/GameBars.jsx';
import LineControl,{ControlLabel} from '../components/LineControl.jsx';
import ChartSelect from '../components/ChartSelect.jsx';
import {rateStyle} from '../components/HitRate.jsx';
import FilterMenu from '../components/FilterMenu.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import {BarChart3,Target,Shield,ChartNoAxesCombined} from 'lucide-react';
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
  return <label className="cb-select">{label}<FilterMenu aria-label={label} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}>{children}</FilterMenu></label>;
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
  return <main className={'chart-lab cb '+({props:'prop-list',top:'top-looks',games:'model-record-preview',record:'model-record-preview'}[page]||'')}><NflToolHeader league="CBB" active={page}/>{meta.value?<League page={page} meta={meta.value}/>:<p role="status">{meta.error?'CBB snapshot unavailable.':'Loading college basketball…'}</p>}</main>;
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
  const slateFilters=<div className={page==='top'?'cb-filter-grid cb-single':'cb-filter-grid cb-slate'}><Select label="Game date" value={day} onChange={d=>{setDay(d);pickGame('');setTarget(null);}}>{meta.days.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select>
      {['games','charts','props'].includes(page)&&<>
        <Select label="Team ranking" value={ranked?'ranked':'all'} disabled={!directory?.ranks} onChange={v=>{setRanked(v==='ranked');pickGame('');setTarget(null);}}>
          <option value="all">All teams</option><option value="ranked">AP Top 25</option>
        </Select>
        <Select label="Conference" value={conference} onChange={c=>{setConference(c);pickGame('');setTarget(null);}}><option value="">All conferences</option>{[...new Set(Object.values(conferences))].sort().map(c=><option key={c}>{c}</option>)}</Select>
      </>}
      {page!=='top'&&<Select label="Matchup · Eastern time" value={game?.id||''} onChange={id=>{pickGame(id);setTarget(null);}}><option value="">All games</option>{games.map(g=><option key={g.id} value={g.id}>{timeFmt.format(new Date(g.time))} · {ranks[g.away]?'#'+ranks[g.away]+' ':''}{teams[g.away].name} @ {ranks[g.home]?'#'+ranks[g.home]+' ':''}{teams[g.home].name}</option>)}</Select>}</div>;
  return <>
    {page!=='record'&&(page!=='charts'||!filteredPlayers.some(g=>g.roster.length))&&slateFilters}
    {page==='record'||page==='top'?record.value?<Ledger teams={teams} rows={record.value} top={page==='top'} day={day} evaluation={meta.evaluation}/>:<p>{record.error?'Record unavailable.':'Loading picks…'}</p>:
      !slate.value?<p>{slate.error?'Slate unavailable.':'Loading slate…'}</p>:!games.length?<p>No matching games for {labelDay(day)}.</p>:
      page==='games'?game?<Detail game={{...game,roster:filteredPlayers[0].roster,priced:false,lines:[]}} meta={{...meta,teams}} back={()=>pickGame('')} chart={chart}/>:<div className="panel nfl-games"><div className="weekly-slate"><section><h3>{labelDay(day)}</h3>{games.map(g=><GameCard key={g.id} game={g} teams={teams} open={()=>pickGame(g.id)}/>)}</section></div></div>:
      page==='props'?<PropList games={filteredPlayers} teams={teams} chart={chart}/>:<Charts slateFilters={slateFilters} key={target?.id+':'+(target?.metric||'')+day} games={filteredPlayers} teams={teams} target={target}/>}
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
  return <section className="panel nfl-games"><button className="slate-back" onClick={back}>← All games</button>
    <section className="match-score"><div className="match-score-caption"><h2>Projected final score</h2><span>{g.arena} · {g.neutral?'Neutral court':'Home court'} · {timeFmt.format(new Date(g.time))}</span></div>
      <div className="match-score-teams">{['away','home'].map(side=><div key={side} style={{'--club':'#'+teams[g[side]].color}}><TeamLogo team={g[side]} sport="cbb"/><span><small>{side}</small><b>{teams[g[side]].name}</b></span><strong>{g[side+'Score']}</strong></div>)}</div></section>
    <nav className="nfl-analysis-tabs" aria-label="Game analysis" role="tablist">{[['Game picks',Target],['Player props',ChartNoAxesCombined],['Matchup breakdown',Shield]].map(([t,Icon])=><button type="button" role="tab" aria-selected={t===tab} key={t} onClick={()=>set(t)}><Icon size={17}/>{t}</button>)}</nav>
    <div className="nfl-tab-panel" role="tabpanel">
  {tab==='Player props'?<PropList games={[g]} teams={teams} chart={chart}/>:tab==='Game picks'?<section className="nfl-view-panel"><div className="nfl-predictions-heading"><h3>Game projections</h3></div><div className="nfl-pick-grid">{[['Projected total',(g.homeScore+g.awayScore).toFixed(1)],['Home margin',(g.homeScore-g.awayScore).toFixed(1)],['Home win probability',pct(g.homeWin)]].map(([label,v])=><article key={label} className="nfl-pick-tile"><small>{label}</small><b>{v}</b></article>)}</div>{g.picks.map(p=><p key={p.market}><b>{p.market} · {p.label} {p.market==='Moneyline'?'':p.line}</b> · DK {money(p.price)} · {pct(p.prob)} model probability{p.quoted?' · Quote '+dateFmt.format(new Date(p.quoted))+', '+timeFmt.format(new Date(p.quoted)):''}{p.ev<=0?' · No positive estimated value':''}</p>)}{!g.picks.length&&<p>CBB sportsbook updates are paused.</p>}</section>:
  <section className="cb-panel lab-block"><h2>Matchup breakdown</h2><p>{g.pace} projected possessions · {g.court} points home-court adjustment</p><div className="cb-scroll"><table><thead><tr><th>Profile</th>{[g.away,g.home].map(t=><th key={t}><Team id={t} teams={teams}/></th>)}</tr></thead><tbody>{[['AdjO','adjO'],['AdjD','adjD'],['AdjT','adjT']].map(([label,k])=><tr key={k}><th>{label}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k]}</td>)}</tr>)}{['Effective FG','Turnover rate','Offensive rebound rate','FT attempts / FG attempts'].flatMap((label,i)=>['offense','defense'].map(k=><tr key={k+i}><th>{label} · {k==='offense'?'offense':'allowed'}</th>{[g.away,g.home].map(t=><td key={t}>{g.ratings[t][k][i]==null?'—':g.ratings[t][k][i]+'%'}</td>)}</tr>))}<tr><th>Days since last game</th>{[g.away,g.home].map(t=><td key={t}>{g.rest[t]??'—'}</td>)}</tr></tbody></table></div><h3>Availability</h3>{[g.away,g.home].map(t=>g.missingScoring?.[t]>0&&<p key={t}>{teams[t].name} · projected scoring reduced by {g.missingScoring[t]} points for reported absences.</p>)}{g.injuries.length?g.injuries.map((r,i)=><p key={i}>{r.name} · {r.status}</p>):<p>{meta.injuryFeed?'No players listed in the available report.':'Injury feed unavailable.'}</p>}</section>}</div></section>;
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
  return <section className="cb-prop-list"><div className="cb-filter-grid cb-pair"><Select label="Market" value={market} onChange={v=>{setMarket(v);setLimit(40);}}><option value="ALL">All markets</option>{Object.entries(markets).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select><label className="cb-select">Find player<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player name"/></label></div><p className="prop-list-note">{rows.length} props · Select a player for charts or a column to sort.</p><div className="prop-table-scroll cb-scroll"><table className="cb-props prop-research-table"><thead><tr>{headers.map(([k,v])=><th key={k} aria-sort={sort[0]===k?(sort[1]===1?'ascending':'descending'):'none'}><button className="column-sort" onClick={()=>setSort([k,sort[0]===k?-sort[1]:k==='name'?1:-1])}>{v} {sort[0]===k?(sort[1]>0?'↑':'↓'):'↕'}</button></th>)}</tr></thead><tbody>{rows.slice(0,limit).map((r,i)=><tr key={r.g.id+r.name+r.metric+i}><td style={{'--club':'#'+(teams[r.team]?.color||'aa77cc')}}><button className="cb-player" disabled={!r.pid} onClick={()=>chart(r.g,r.pid,r.metric)}><Headshot id={r.pid} team={r.team}/><span className="cb-player-copy"><b>{r.name}</b><small>{teams[r.team]?.name} · {markets[r.metric]}</small></span></button></td><td>{r.line}<small>{r.book?'DK · O '+money(r.over)+' / U '+money(r.under):'Player avg'}</small></td><td>{r.proj??'—'}</td><td>{r.minutes??'—'}</td></tr>)}</tbody></table></div>{!rows.length&&<p>No players match this selection.</p>}{rows.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more ({rows.length-limit})</button>}</section>;
}
function valueOf(g,k){if(k==='PRA')return g.points+g.rebounds+g.assists;if(k==='PR')return g.points+g.rebounds;if(k==='PA')return g.points+g.assists;if(k==='RA')return g.rebounds+g.assists;return g[k];}
function Charts({games,teams,target,slateFilters}){
  const [filters,setFilters]=useState(false),[expanded,setExpanded]=useState(false),[windowSize,setWindow]=useState('10');
  const [selectedLog,setSelectedLog]=useState('');
  const available=useMemo(()=>games.flatMap(g=>g.roster.filter(p=>!g.priced||g.lines.some(l=>l.pid===p.id)).map(p=>({p,g}))),[games]);
  const [id,select]=useState(target?.id||''),[k,setK]=useState(target?.metric||'points'),[venue,setV]=useState('All'),[line,setL]=useState(''),[side,setSide]=useState('over');
  const item=available.find(x=>x.p.id===id)||available[0],p=item?.p,g=item?.g;
  const hist=useFile(p?'teams/'+p.team+'.json':null);
  if(!p)return <p>No rotation history for this selection.</p>;
  const listed=g.lines.filter(l=>l.pid===p.id),keys=g.priced?[...new Set(listed.map(l=>l.metric))]:Object.keys(markets),metric=keys.includes(k)?k:keys[0];
  const book=listed.find(l=>l.metric===metric),base=book?.line??p.average[metric],point=line===''?base:Number(line);
  const history=(hist.value?.[p.id]||[]).filter(l=>venue==='All'||l.venue===venue);
  const logs=windowSize==='season'?history:history.slice(-Number(windowSize));
  const rows=logs.map(log=>{
    const value=valueOf(log,metric),outcome=value===point?'Push':(side==='over'?value>point:value<point)?'Hit':'Miss';
    const opponent=teams[log.opp]?.name||log.opp;
    return {log,id:log.game,opponent:log.opp,opponentLabel:(log.venue==='Away'?'@ ':'vs ')+opponent,date:log.date.slice(5),value,outcome,footer:outcome,description:log.date+' vs '+opponent+', '+value+' '+markets[metric]+', '+outcome};
  });
  const values=rows.map(r=>r.value).sort((a,b)=>a-b);
  const median=values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;
  const hits=rows.filter(r=>r.outcome==='Hit').length,pushes=rows.filter(r=>r.outcome==='Push').length;
  const active=rows.find(r=>r.id===selectedLog),opp=p.team===g.home?g.away:g.home;
  const adj=p.adjustment[metric],pos=p.positionEffect[metric];
  return <div style={{'--club':'#'+teams[p.team].color}}>
    <div className="lab-controls primary-controls">
      <ChartSelect label="Player" value={p.id} onChange={v=>{select(v);setL('');setSelectedLog('');}}>{available.map(({p,g})=><option key={g.id+p.id} value={p.id}>{p.name} · {teams[p.team]?.name}</option>)}</ChartSelect>
      <ChartSelect label="Market" value={metric} onChange={v=>{setK(v);setL('');}}>{keys.map(k=><option key={k} value={k}>{markets[k]}</option>)}</ChartSelect>
    </div>
    <button className="filter-toggle chart-disclosure" aria-expanded={filters} aria-controls="cbb-chart-filters" onClick={()=>setFilters(!filters)}><ControlLabel>Filters</ControlLabel><span>{dateFmt.format(new Date(g.time))} · {venue} · {windowSize==='season'?'Full history':'Last '+windowSize}</span></button>
    <div className="extra-filters" id="cbb-chart-filters" data-open={filters}>{slateFilters}<div className="lab-controls secondary-controls">
      <ChartSelect label="Side" value={side} onChange={setSide}><option value="over">Over</option><option value="under">Under</option></ChartSelect>
      <ChartSelect label="Venue" value={venue} onChange={setV}>{venueOptions.map(v=><option key={v}>{v}</option>)}</ChartSelect>
      <ChartSelect label="Window" value={windowSize} onChange={setWindow}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full history</option></ChartSelect>
    </div></div>
    <LineControl key={p.id+metric} line={point} setLine={setL} resetLine={()=>setL('')} manual={line!==''} manualLabel="Research line" median={median} games={rows.map(r=>({stats:{[metric]:r.value}}))} metric={metric} direction={side}/>
    <section className="lab-player"><div className="player-identity"><Headshot id={p.id} team={p.team} large/><div><small>{teams[p.team].name} · {p.role}</small><h2>{p.name}</h2>
      <div className="player-prop"><strong>{side} {point}</strong><span>{markets[metric]}</span><small>{line!==''?'Research line':'Player average'}</small></div>
      <div className="player-next"><TeamLogo sport="cbb" team={opp}/><span><b>Next game</b> · {p.venue} vs {teams[opp].name}<br/>{dateFmt.format(new Date(g.time))} · {timeFmt.format(new Date(g.time))}</span></div></div></div>
      <div className="player-numbers"><div><small>Median</small><b>{median??'—'}</b></div><div><small>Hit rate</small><b style={values.length?rateStyle(hits/values.length):undefined}>{values.length?pct(hits/values.length):'—'}</b><small>{hits} hits · {rows.length-hits-pushes} misses · {pushes} pushes</small></div>
      <div><small>Model projection</small><b>{p.estimate[metric]}</b><small>Range {p.range?.[metric]?.join('–')}</small></div><div><small>Games shown</small><b>{rows.length}</b></div></div></section>
    <section className="lab-block"><h2>Game By Game</h2>{rows.length?<><GameBars rows={rows} label={markets[metric]} caption={rows.length+' games shown'} line={point} direction={side} sport="cbb" selected={selectedLog} onSelect={setSelectedLog} expanded={expanded} onExpand={()=>setExpanded(!expanded)}
      details={r=><><span className="bar-detail-item"><b>{r.log.min}</b><small>Minutes</small></span><span className="bar-detail-item"><b>{r.log.fga}</b><small>Field goal attempts</small></span></>}/>
      {active?<section className="bar-report game-report"><header className="game-report-header"><div className="game-report-title"><TeamLogo sport="cbb" team={active.opponent}/><div><small>Selected game · {active.log.date}</small><h3>{p.name}</h3><p>{active.opponentLabel}</p></div></div><button className="game-report-clear" onClick={()=>setSelectedLog('')}>Clear selection</button></header><dl className="game-report-stats">{[['Result',active.outcome],['Minutes',active.log.min],['Points',active.log.points],['Rebounds',active.log.rebounds],['Assists',active.log.assists],['Made threes',active.log.threes]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>:<p className="bar-hint">Select a game bar for player stats.</p>}</>:<p>{hist.error?'Game log unavailable.':hist.value?'No games in this venue split.':'Loading game log…'}</p>}</section>
    <section className="lab-block matchup-lab"><h2>Matchup research</h2><h3><Team id={opp} teams={teams}/> · Defense vs {p.role.toLowerCase()}</h3>{adj?<p>{adj[0]>0?'+':''}{adj[0]}% versus expected {markets[metric].toLowerCase()} across {adj[1]} prior player appearances in this role. {adj[1]>0&&<>Allowed {adj[2]} per appearance versus {adj[3]} expected. </>}{p.defenseRank?.[metric]&&<>Ranks {p.defenseRank[metric][0]} of {p.defenseRank[metric][1]} eligible defenses, most allowed relative to expectation first. </>}Position adjustment {pos[0]>0?'+':''}{pos[0]}% ({pos[1]} appearances).</p>:<p>Combination projections use the individual stat matchups.</p>}</section>
    <section className="lab-block"><h2>Production &amp; workload</h2><dl>{[['Projected minutes',p.minutes],['Recent minutes range',p.minuteRange?.join('–')],['Recent starts',p.starts],['Fouls per 40 minutes',p.foulRate]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
    <section className="lab-block player-log"><h2>Game log</h2><div className="history-scroll log-table"><table><thead><tr>{['Date','Opponent','Minutes',markets[metric],'Result'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice().reverse().map(r=><tr key={r.id}><td>{r.log.date}</td><td><TeamLogo sport="cbb" team={r.opponent}/>{r.opponentLabel}</td><td>{r.log.min}</td><td>{r.value}</td><td><span className="log-outcome" data-result={r.outcome}>{r.outcome}</span></td></tr>)}</tbody></table></div></section>
  </div>;
}
function RecordPick({row:r,teams,byName}){
  const [awayName,homeName]=r.matchup.split(' @ ');
  const away=r.away||byName.get(awayName),home=r.home||byName.get(homeName);
  const player=r.market==='Player prop';
  const picked=player?r.team:r.side==='away'?away:r.side==='home'?home:null;
  const color=id=>teams[id]?.color?'#'+teams[id].color:'#9f79b7';
  const description=player?r.side+' '+r.line+' '+markets[r.metric]:r.market==='Moneyline'?(r.price==null?'to win':'ML'):r.line;
  return <article className="cb-pick cb-record-pick" style={{'--away-color':color(away),'--home-color':color(home),'--pick-color':color(picked)}}>
    <div className="cb-record-match">{away&&home?<><span><TeamLogo sport="cbb" team={away}/>{awayName}</span><small>@</small><span><TeamLogo sport="cbb" team={home}/>{homeName}</span></>:r.matchup}</div>
    <small>{dateFmt.format(new Date(r.time))}</small>
    <h3 className="cb-record-selection">{player?<Headshot id={r.pid} team={picked}/>:picked&&<TeamLogo sport="cbb" team={picked}/>}<span>{r.label} {description}</span></h3>
    <p>{r.price==null?'Model winner':'DK '+money(r.price)} · {pct(r.prob)} model · {r.result||'Pending'}</p>
    <small>{Date.parse(r.time)<=Date.now()?'Locked':'Pregame'} · Saved {dateFmt.format(new Date(r.saved))}, {timeFmt.format(new Date(r.saved))}</small>
  </article>;
}
function Ledger({teams,rows,top,day,evaluation}){
  const [market,setMarket]=useState('All'),[chosenDate,setDate]=useState(''),[limit,setLimit]=useState(40);
  const today=etDay(Date.now());
  const dailyRows=rows.filter(r=>etDay(r.time)>='2026-11-12'&&etDay(r.time)<=today);
  const dates=[...new Set(dailyRows.map(r=>etDay(r.time)))].sort().reverse();
  const date=chosenDate||dates[0]||'All';
  const show=(top?rows:dailyRows).filter(r=>(top?etDay(r.time)===day&&r.market==='Player prop'&&r.top:date==='All'||etDay(r.time)===date)&&(top||market==='All'||market===r.market))
    .sort((a,b)=>top?b.ev-a.ev:b.time.localeCompare(a.time));
  const byName=new Map(Object.entries(teams).map(([id,t])=>[t.name,id]));
  const counts=s=>show.filter(r=>r.result===s).length;
  return <section className={top?"top-pick-list":"panel props-board model-record-shell"}>{top?<><div className="top-looks-heading"><h2>Ranked player props</h2><span className="slate-count">{show.length} qualified</span></div><p>CBB sportsbook updates are paused. Player Charts and Prop Lists show projections and season averages.</p></>:<><div className="board-sort model-record-tabs">{['All','Player prop','Moneyline','Total','Spread'].map(m=><button className="outline-button" key={m} aria-pressed={m===market} onClick={()=>setMarket(m)}>{m}</button>)}</div><RecordHeader title={market==='All'?'College basketball':market} icon={BarChart3}>Saved pregame picks and settled results by Eastern game date. Tracking began November 12, 2026.</RecordHeader><div className="cb-filter-grid cb-single"><Select label="Game date" value={date} onChange={d=>{setDate(d);setLimit(40);}}><option value="All">All game days</option>{dates.map(d=><option key={d} value={d}>{labelDay(d)}</option>)}</Select></div><p>{counts('Win')} wins · {counts('Loss')} losses · {counts('Push')} pushes · {counts('Void')} void · {show.filter(r=>!r.result).length} pending</p></>}
    {!show.length&&<p>{top?'No saved Top Looks for this date.':'No saved picks in this selection.'}</p>}
    {show.slice(0,limit).map(r=><RecordPick key={[r.game,r.market,r.pid,r.metric,r.side,r.line].join('-')} row={r} teams={teams} byName={byName}/>)}
    {show.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show more</button>}
    {!top&&<details><summary>Historical game-model check</summary><p>{evaluation.games} games in the season ending {evaluation.season}, predicted chronologically. Winner accuracy {pct(evaluation.winner)} · margin error {evaluation.marginMAE} points · total error {evaluation.totalMAE} points.</p>{evaluation.playerCount>0&&<p>Current-season player check · {evaluation.playerCount} projected players who appeared in sampled games. Average absolute errors · minutes {evaluation.playerErrors.minutes}, points {evaluation.playerErrors.points}, rebounds {evaluation.playerErrors.rebounds}, assists {evaluation.playerErrors.assists}.</p>}</details>}</section>;
}
document.documentElement.dataset.theme='dark';
createRoot(document.getElementById('root')).render(<Shell/>);
