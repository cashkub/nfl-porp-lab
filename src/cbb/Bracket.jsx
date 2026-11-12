import React,{useState} from 'react';
import {List, Trophy, ChevronDown} from 'lucide-react';
import BracketOverview from './BracketOverview.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import FilterMenu from '../components/FilterMenu.jsx';
import './bracket.css';

const pairs=[[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
const regions=['East','South','Midwest','West'];
const formatDate=date=>new Date(date+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
function Picker({label,value,options,onChange}){
  return <label className="cb-select">{label}<FilterMenu aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>
    {options.map(([id,text])=><option key={id} value={id}>{text}</option>)}</FilterMenu></label>;
}
function Club({id,teams}){
  return <span className="br-club" style={{borderColor:'#'+(teams[id]?.color||'a985c0')}}><span className="br-logo"><TeamLogo team={id} sport="cbb"/></span><span>{teams[id]?.name||id}</span></span>;
}
function Region({region,data,teams,overview=false}){
  const slots=data.regions[region];
  const opening=Object.entries(slots).filter(([,slot])=>slot.length===2);
  return <section className="br-region"><h2>{region} Region</h2>
    {opening.length>0&&<><h3>Opening round</h3><div className="br-opening">{opening.map(([seed,slot])=><div className="br-game" key={seed}><small>For the No. {seed} seed</small>{slot.map(id=><Club key={id} id={id} teams={teams}/>)}</div>)}</div></>}
    <div className="br-scroll" tabIndex={overview?undefined:0} aria-label={region+' regional bracket'}><div className="br-tree">
      {['Round of 64','Round of 32','Sweet 16','Elite Eight'].map((round,col)=><section key={round}><h3>{round}</h3><div className="br-round">
        {Array.from({length:8/(2**col)},(_,i)=><div key={i} className="br-node"><div className="br-game">
          {col===0?pairs[i].map(seed=><div className="br-slot" key={seed}><b>{seed}</b>{slots[seed].length===1?<Club id={slots[seed][0]} teams={teams}/>:<span>Opening winner · {seed}</span>}</div>)
            :[0,1].map(j=><small key={j}>Winner · {col===1?pairs[2*i+j].join(' / '):['','', 'R32','Sweet 16'][col]+' game '+(2*i+j+1)}</small>)}
        </div></div>)}</div></section>)}
    </div></div></section>;
}

export default function Bracket({meta,useFile}){
  const [view,setView]=useState('List'),[chosen,setChosen]=useState(''),[region,setRegion]=useState('All regions'),[group,setGroup]=useState('Field'),[query,setQuery]=useState('');
  const index=useFile('bracket.json'),dates=index.value?.dates||[];
  const date=chosen||dates.at(-1),previous=dates[dates.indexOf(date)-1];
  const path=d=>d?'bracket/'+index.value.season+'/'+d+'.json':null;
  const {value:data,error}=useFile(path(date)),prior=useFile(path(previous)).value;
  const teams=meta.teams;
  if(!data)return <p role="status">{index.error||error?'Bracket projection unavailable.':'Loading the projected field…'}</p>;
  const byId=new Map(prior?.teams.map(t=>[t.id,t])||[]);
  const bubbleIds=new Set([...data.teams.filter(t=>t.seed&&!t.auto).slice(-16),...data.teams.filter(t=>!t.seed).slice(0,8)].map(t=>t.id));
  const rows=data.teams.filter(t=>(group==='All teams'||(group==='Bubble'?bubbleIds.has(t.id):t.seed))&&(teams[t.id]?.name||t.id).toLowerCase().includes(query.toLowerCase()));
  return <div className="br-page"><div className="br-switch" role="group" aria-label="Projection view">{['List','Bracket'].map(v=><button key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v==='List'?<List size={16}/>:<Trophy size={16}/>} {v}</button>)}</div>
    <div className="br-toolbar">
    <Picker label="Projection date" value={date} onChange={setChosen} options={[...dates].reverse().map(d=>[d,formatDate(d)])}/>
    {view==='Bracket'?<Picker label="Region" value={region} onChange={setRegion} options={['All regions',...regions].map(r=>[r,r])}/>:<Picker label="Show" value={group} onChange={setGroup} options={['Field','Bubble','All teams'].map(g=>[g,g])}/>}
    {view==='List'&&<label className="cb-select br-search">Find team<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Team name"/></label>}</div>
    <p className="br-note">Projected field · 32 automatic bids · 44 at-large bids</p>
    {view==='Bracket'?(region==='All regions'?<BracketOverview key={date}>{regions.map(r=><Region key={r} region={r} data={data} teams={teams} overview/>)}</BracketOverview>:<Region region={region} data={data} teams={teams}/>):<><div className="br-list"><div className="br-columns" aria-hidden="true"><span>Seed</span><span>Team</span><span>Bid chance</span><span/></div>{rows.map(t=>{const old=byId.get(t.id);const move=old?.seed&&t.seed?old.seed-t.seed:0;
        return <details key={t.id}><summary><span className="br-seed">{t.seed?'#'+t.seed:'Out'}</span><div><Club id={t.id} teams={teams}/><small>{t.region||'Outside field'} · {t.auto?'Projected auto bid':t.seed?'At-large':'Bubble rank '+(data.teams.indexOf(t)-75)}{t.opening?' · Opening round':''}</small></div><strong>{t.bidPct}%<span className="br-sr"> bid chance</span></strong><ChevronDown className="br-chevron" size={14} aria-hidden="true"/></summary>
          <p>D1 record {t.wins}–{t.losses} · Estimated wins above bubble {t.wab} · Adjusted efficiency margin {t.efficiency} · Average opponent margin {t.sos??'—'}</p>
          {old&&<p>{move?(move>0?'Up ':'Down ')+Math.abs(move)+' seed line(s)':old.seed===t.seed?'Same position on the seed line':t.seed?'Entered projected field':'Left projected field'} since {formatDate(previous)}.</p>}</details>;
      })}{!rows.length&&<p>No matching teams.</p>}</div></>}
    <details className="br-method"><summary>How we project the field</summary><p>Estimated wins above bubble compares actual D1 wins with expected wins for a bubble-strength team against the same opponents and venues. We blend that résumé with adjusted efficiency. The highest-rated eligible team in each conference gets its projected automatic bid.</p><p>Bid chances come from 200 simulations of scheduled games and simplified neutral-court conference tournaments. Regional placement balances seed lines and penalizes early conference matchups. Estimates use PropBets ratings and can move sharply early in the season.</p></details></div>;
}
