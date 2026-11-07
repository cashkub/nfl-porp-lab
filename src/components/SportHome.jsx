import React from 'react';
import {ArrowUpRight, ChevronRight, SlidersHorizontal, ListFilter, Trophy} from 'lucide-react';

export const toolsBySport = {
  nfl:[['Analyzer','analyzer'],['Props Board','props'],['Best Hit Rates','best-hit-rates']],
  cbb:[['Analyzer','cbb'],['Props Board','cbb-props'],['Best Hit Rates','cbb-best']]
};
const icons=[SlidersHorizontal,ListFilter,Trophy];

function Ball({sport}) {
  if(sport==='nfl') return <img className="sport-art football-art" src={import.meta.env.BASE_URL+'football.svg'} alt=""/>;
  return <svg className="sport-art basketball-art" viewBox="0 0 240 220" aria-hidden="true">
    <defs><radialGradient id="ball-fill" cx="32%" cy="25%" r="78%"><stop stopColor="#ffdd94"/><stop offset=".52" stopColor="#ff9850"/><stop offset="1" stopColor="#a83c23"/></radialGradient>
    <pattern id="ball-grain" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#471d16" opacity=".35"/></pattern>
    <clipPath id="ball-edge"><circle cx="119" cy="110" r="83"/></clipPath></defs>
    <g transform="rotate(-27 119 110)"><circle cx="119" cy="110" r="83" fill="url(#ball-fill)"/><circle cx="119" cy="110" r="83" fill="url(#ball-grain)"/>
    <g clipPath="url(#ball-edge)" fill="none" stroke="#652d23" strokeWidth="4"><path d="M119 23v176M31 110h178M68 29q85 81 0 162M168 25q-85 85 0 171"/></g></g>
  </svg>;
}

export default function SportHome({sport}) {
  if(sport) return <section className={'sport-launch '+sport}>
    <a className="back-sports" href="#home">← All Sports</a>
    <div className={'sport-banner sport-card '+sport}><Ball sport={sport}/><div><small>{sport==='nfl'?'Pro Football':'Men’s College Basketball'}</small><h1>{sport.toUpperCase()}</h1></div></div>
    <div className="tool-cards">{toolsBySport[sport].map(([label,path],i)=>{
      const Icon=icons[i];
      const details=['Explore a Player’s Game Log',sport==='nfl'?'Browse DraftKings Lines':'Compare Players at Your Line','Rank Historical Over and Under Results'];
      return <a key={path} href={'#'+path}><Icon size={23}/><h2>{label}</h2><p>{details[i]}</p><ChevronRight size={17}/></a>;
    })}</div>
  </section>;
  return <section className="sport-launch"><header className="launch-title"><h1>Choose Your Sport<span>.</span></h1></header>
    <div className="sport-cards">{['nfl','cbb'].map(s=><a className={'sport-card '+s} href={'#'+s+'-home'} key={s}>
      <Ball sport={s}/><div><small>{s==='nfl'?'Pro Football':'Men’s College Basketball'}</small><h2>{s.toUpperCase()}</h2></div>
      <span className="sport-enter">Explore {s.toUpperCase()} <ArrowUpRight size={18}/></span>
    </a>)}</div></section>;
}
