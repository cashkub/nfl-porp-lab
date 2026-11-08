import React from 'react';
import {ArrowUpRight, ChevronRight, SlidersHorizontal, ListFilter, Trophy, Star, CalendarDays} from 'lucide-react';

export const toolsBySport = {
  nfl:[['Analyzer','analyzer'],['Props Board','props'],['Best Hit Rates','best-hit-rates'],['Top 8','top-eight'],['Moneylines','moneylines']],
  cbb:[['Analyzer','cbb'],['Props Board','cbb-props'],['Best Hit Rates','cbb-best'],['Top 8','cbb-top-eight'],['Games','cbb-games']]
};
const icons=[SlidersHorizontal,ListFilter,Trophy,Star,CalendarDays];

export default function SportHome({sport}) {
  if(sport) return <section className={'sport-launch '+sport}>
    <a className="back-sports" href="#home">← All Sports</a>
    <div className={'sport-banner sport-card '+sport}><div><small>{sport==='nfl'?'Pro Football':'Men’s College Basketball'}</small><h1>{sport.toUpperCase()}</h1></div></div>
    <div className="tool-cards">{toolsBySport[sport].map(([label,path],i)=>{
      const Icon=icons[i];
      const details=['Explore a Player’s Game Log',sport==='nfl'?'Browse DraftKings Lines':'Compare Players at Your Line','Rank Historical Over and Under Results','See the Numbers Behind Each Pick',sport==='nfl'?'Compare Projected Scores and Market Lines':'Browse Matchups by Date'];
      return <a key={path} href={'#'+path}><Icon size={23}/><h2>{label}</h2><p>{details[i]}</p><ChevronRight size={17}/></a>;
    })}</div>
  </section>;
  return <section className="sport-launch"><header className="launch-title"><h1>Choose Your <span>Sport.</span></h1></header>
    <div className="sport-cards">{['nfl','cbb'].map(s=><a className={'sport-card '+s} href={'#'+s+'-home'} key={s}>
      <div><small>{s==='nfl'?'Pro Football':'Men’s College Basketball'}</small><h2>{s.toUpperCase()}</h2></div>
      <span className="sport-enter">Explore {s.toUpperCase()} <ArrowUpRight size={18}/></span>
    </a>)}</div></section>;
}
