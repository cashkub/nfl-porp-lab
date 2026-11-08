import React,{useState} from 'react';
import {useLeague} from './ManualLeague.jsx';

const paths={nba:'nba',cbb:'mens-college-basketball',cfb:'college-football'};

export default function PlayerPhoto({id,name,url,large=false}){
  const sport=useLeague();
  const src=sport==='nfl'?url:(paths[sport] && /^\d+$/.test(id)?'https://a.espncdn.com/i/headshots/'+paths[sport]+'/players/full/'+id+'.png':null);
  const [failed,setFailed]=useState(null);
  const initials=(name || '').trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('');
  return <span aria-hidden="true" className={'player-photo'+(large?' player-photo-large':'')}>
    {src && src!==failed?<img src={src} alt="" loading={large?'eager':'lazy'} decoding="async" onError={()=>setFailed(src)}/>:initials}
  </span>;
}
