import React from 'react';
import {teamNames} from '../lib/schedule.js';
import './TeamLogo.css';

const nbaCodes='atl bos no chi cle dal den det gs hou ind lac lal mia mil min bkn ny orl phi phx por sac sa okc utah wsh tor mem cha'.split(' ');
export default function TeamLogo({team,sport='nfl',className='team-logo'}){
  if(!team)return null;
  let code,league;
  if(sport==='nfl'){
    const normalized=({LA:'LAR',WSH:'WAS',JAC:'JAX'})[team]||team;
    if(!teamNames[normalized])return null;
    code=normalized==='WAS'?'wsh':normalized.toLowerCase();
    league='nfl';
  }else if(sport==='nba'){
    code=nbaCodes[Number(team)-1];league='nba';
  }else if((sport==='cbb'||sport==='cfb')&&/^\d+$/.test(team)){
    code=team;league='ncaa';
  }
  return code?<img key={league+code} className={className} width="20" height="20" alt="" loading="lazy"
    src={'https://a.espncdn.com/i/teamlogos/'+league+'/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>:null;
}
