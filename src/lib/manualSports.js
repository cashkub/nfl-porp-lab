import {markets as basketball} from './cbbMarkets.js';
import {METRICS} from './stats.js';

export const sportNames={nfl:'Pro Football',cbb:'Men’s College Basketball',nba:'Pro Basketball',cfb:'College Football · FBS'};
export const manualMarkets=sport=>sport==='cfb'?METRICS:basketball;
export const seasonLabel=(sport,y)=>sport==='cfb'?String(y):String(y-1)+'–'+String(y).slice(-2);

export function cfbRoleGames(player,metric){
  if(!/^\d+$/.test(player.id) || !player.name?.trim() || player.name.trim().toLowerCase()==='team')return 0;
  const roles={passingYards:'passing',passingTDs:'passing',rushingYards:'rushing',rushingAttempts:'rushing',
    receptions:'receiving',receivingYards:'receiving',scoredTDs:'scoring'};
  const role=roles[metric];
  if(player.roleGames)return player.roleGames[role] || 0;
  const recent=player.recent;
  return (recent[metric] || []).filter((value,i)=>{
    if(role==='rushing')return recent.rushingAttempts?.[i]>0;
    if(role==='receiving')return recent.receptions?.[i]>0;
    if(role==='scoring')return recent.receptions?.[i]>0 || recent.rushingAttempts?.[i]>0;
    return (recent.passingYards?.[i] ?? 0)!==0 || value>0;
  }).length;
}
