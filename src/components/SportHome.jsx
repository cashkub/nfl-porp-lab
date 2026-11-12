import {useCbbFile} from './useCbbFile.js';
import {sportNames} from '../lib/manualSports.js';
import React from 'react';
import {ArrowUpRight, ChevronRight, SlidersHorizontal, ListFilter, Trophy, Star, CalendarDays} from 'lucide-react';

import {toolsBySport} from '../lib/leagueTools.js';

const icons=[SlidersHorizontal,ListFilter,Star,CalendarDays,Trophy];

export default function SportHome({sport}) {
  const index=useCbbFile(sport && sport!=='nfl'?'index.json':null);
  const through=index.data?.through?.[index.data.seasons[0]];
  if(sport) return <section className={'sport-launch '+sport}>
    <a className="back-sports" href="#home">← All Sports</a>
    <div className={'sport-banner sport-card '+sport}><div><small>{sportNames[sport]}</small><h1>{sport.toUpperCase()}</h1>{through && <small>Stats through {through}</small>}</div></div>
    <div className="tool-cards">{toolsBySport[sport].map(([label,path],i)=>{
      const Icon=icons[i];
      const details=['Explore a Player’s Game Log',sport==='nfl'?'Browse DraftKings Lines':'Compare Players at Your Line','See the Numbers Behind Each Pick',sport==='nfl'?'Compare Projected Scores and Market Lines':sport==='cfb'?'Browse Matchups by Week':'Browse Matchups by Date','Review Pregame Predictions and Final Scores'];
      return <a key={path} href={'#'+path}><Icon size={23}/><h2>{label}</h2><p>{details[i]}</p><ChevronRight size={17}/></a>;
    })}</div>
  </section>;
  return <section className="sport-launch"><header className="launch-title"><h1>Choose Your <span>Sport.</span></h1></header>
    <div className="sport-cards">{['nfl','nba','cfb','cbb'].map(s=><a className={'sport-card '+s} href={'#'+s+'-home'} key={s}>
      <div><small>{sportNames[s]}</small><h2>{s.toUpperCase()}</h2></div>
      <span className="sport-enter">Explore {s.toUpperCase()} <ArrowUpRight size={18}/></span>
    </a>)}</div>
    <div style={{textAlign:'right'}}>
      <a href={import.meta.env.BASE_URL+'preview/'} aria-label="Open the new site preview" title="New site preview"
        style={{display:'inline-block',padding:'12px',fontSize:'12px',color:'var(--muted)',textDecoration:'none'}}>v2</a>
    </div>
  </section>;
}
