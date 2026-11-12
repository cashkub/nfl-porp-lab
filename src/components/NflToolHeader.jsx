import React from 'react';
import './NflToolHeader.css';
import {LayoutGrid, Activity, ListFilter, Crosshair, CalendarDays, BarChart3, Trophy} from 'lucide-react';

const destinations=[
  {name:'NFL Menu',icon:LayoutGrid,href:'/preview/nfl/'},
  {name:'Player Charts',icon:Activity,href:'#analyzer',key:'charts'},
  {name:'Prop Lists',icon:ListFilter,href:'#prop-lists',key:'props'},
  {name:'Top Looks',icon:Crosshair,href:'#top-eight',key:'top'},
  {name:'Games',icon:CalendarDays,href:'#nfl-games',key:'games'},
  {name:'Model Record',icon:BarChart3,href:'#model-record',key:'record'},
];

export default function NflToolHeader({active,league='NFL'}){
  const links=league==='CBB'?[...destinations,{name:'Bracketology',icon:Trophy,href:'#cbb-bracket',key:'bracket'}]:destinations;
  const page=links.find(item=>item.key===active);
  const Icon=page.icon;
  const [first,last]=(active==='games'?league+' Games':active==='bracket'?'CBB Bracketology':page.name).split(' ');
  return <><header className="nfl-tool-header">
    <a href="/preview/" className="pb-brand" aria-label="PropBets preview home"><img alt="" src="/preview/assets/mark.svg"/><span className="pb-wordmark">Prop<span>Bets</span></span></a>
    <nav aria-label={league+" Navigation"}>
      {links.map(({name,icon:Icon,href,key})=>{
        const label=key?name:league+' Menu';
        const target=league==='CBB'?(key?'#cbb-'+key:'/preview/cbb/'):href;
        const content=<><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{label}</span></>;
        return href
          ? <a key={name} href={target} aria-current={active===key?'page':undefined}>{content}</a>
          : <button key={name} type="button" disabled title="Not available yet">{content}</button>;
      })}
    </nav>
  </header>
    <div className="nfl-page-banner">
      <h1>{first} <em>{last}</em></h1>
      <div className="nfl-page-emblem" aria-hidden="true"><Icon strokeWidth={1.65}/></div>
    </div></>;
}
