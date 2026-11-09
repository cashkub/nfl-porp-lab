import React from 'react';
import {LayoutGrid, Activity, ListFilter, Crosshair, CalendarDays, BarChart3} from 'lucide-react';

const destinations=[
  {name:'NFL Menu',icon:LayoutGrid,href:'/preview/nfl/'},
  {name:'Player Charts',icon:Activity,href:'#analyzer',key:'charts'},
  {name:'Prop Lists',icon:ListFilter,href:'#prop-lists',key:'props'},
  {name:'Top Looks',icon:Crosshair,href:'#top-eight',key:'top'},
  {name:'Games',icon:CalendarDays},
  {name:'Model Record',icon:BarChart3},
];

export default function NflToolHeader({active}){
  return <header className="nfl-tool-header">
    <a href="/preview/" className="pb-brand" aria-label="PropBets preview home"><img alt="" src="/preview/assets/mark.svg"/><span className="pb-wordmark">Prop<span>Bets</span></span></a>
    <nav aria-label="NFL Navigation">
      {destinations.map(({name,icon:Icon,href,key})=>{
        const content=<><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{name}</span></>;
        return href
          ? <a key={name} href={href} aria-current={active===key?'page':undefined}>{content}</a>
          : <button key={name} type="button" disabled title="Not available yet">{content}</button>;
      })}
    </nav>
  </header>;
}
