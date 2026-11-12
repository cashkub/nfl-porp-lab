import React from 'react';
import './NflToolHeader.css';
import {LayoutGrid, Activity, ListFilter, Crosshair, CalendarDays, BarChart3} from 'lucide-react';

const destinations=[
  {name:'NFL Menu',icon:LayoutGrid,href:'/preview/nfl/'},
  {name:'Player Charts',icon:Activity,href:'#analyzer',key:'charts',accent:'#c5a6ff'},
  {name:'Prop Lists',icon:ListFilter,href:'#prop-lists',key:'props',accent:'#92d6df'},
  {name:'Top Looks',icon:Crosshair,href:'#top-eight',key:'top',accent:'#efb78e'},
  {name:'Games',icon:CalendarDays,href:'#nfl-games',key:'games',accent:'#9cbfff'},
  {name:'Model Record',icon:BarChart3,href:'#model-record',key:'record',accent:'#a5dbb7'},
];

export default function NflToolHeader({active}){
  const page=destinations.find(item=>item.key===active);
  const Icon=page.icon;
  const [first,last]=(active==='games'?'NFL Games':page.name).split(' ');
  return <><header className="nfl-tool-header">
    <a href="/preview/" className="pb-brand" aria-label="PropBets preview home"><img alt="" src="/preview/assets/mark.svg"/><span className="pb-wordmark">Prop<span>Bets</span></span></a>
    <nav aria-label="NFL Navigation">
      {destinations.map(({name,icon:Icon,href,key})=>{
        const content=<><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{name}</span></>;
        return href
          ? <a key={name} href={href} aria-current={active===key?'page':undefined}>{content}</a>
          : <button key={name} type="button" disabled title="Not available yet">{content}</button>;
      })}
    </nav>
  </header>
    <div className="nfl-page-banner" style={{'--page-accent':page.accent}}>
      <h1>{first} <em>{last}</em></h1>
      <div className="nfl-page-emblem" aria-hidden="true"><Icon strokeWidth={1.65}/></div>
    </div></>;
}
