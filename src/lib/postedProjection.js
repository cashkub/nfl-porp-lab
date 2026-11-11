import {teamNames} from './schedule.js';
import {getPlayerGames} from './stats.js';

const usageFor = {
  passingYards:'attempts', passingTDs:'attempts', rushingYards:'carries',
  rushingAttempts:'carries', receivingYards:'targets', receptions:'targets', scoredTDs:'opportunities'
};
const positionGroup = p => p==='FB'?'RB':p;
const unavailable = /^(out|inactive|doubtful|ir|injured reserve|suspended|pup|physically unable to perform)$/i;

// Build pregame league rates once per matchup. Starter workload uses QB games
// with a majority of offensive snaps so a relief appearance is not a full start.
export function postedPriors(players,game){
  const rates={},starter={attempts:0,carries:0,opportunities:0,games:0};
  for(const player of players){
    for(const g of player.games||[]){
      if(g.season>game.season || (+g.season===+game.season && +g.week>=+game.week))continue;
      if(player.position==='QB' && g.usage?.offenseSnapRate>=.5){
        starter.games++;
        for(const k of ['attempts','carries','opportunities'])starter[k]+=g.usage[k]||0;
      }
      for(const [market,key] of Object.entries(usageFor)){
        const value=g.stats?.[market],opps=g.usage?.[key];
        if(!Number.isFinite(value)||!Number.isFinite(opps)||opps<=0)continue;
        const id=positionGroup(player.position)+':'+market;
        const total=rates[id]??={value:0,opps:0};
        total.value+=value;total.opps+=opps;
      }
    }
  }
  return {rates,starter};
}

export function projectPosted({player,line,status,game,priors}){
  if(unavailable.test(status||''))return {note:'Withheld · '+status};
  if(line.anytime && /D\/ST$/i.test(line.player)){
    const team=[game.home,game.away].find(code=>line.player.endsWith(teamNames[code]+' D/ST'));
    const chance=game.dstChances?.[team];
    if(Number.isFinite(chance))return {estimated:100*chance,note:'Team scoring history'};
  }
  if(!player)return {note:/D\/ST$/i.test(line.player)?'Team defense / special teams history unavailable':'No matched player history'};
  const qb=game.context?.[player.team===game.home?'home':'away'];
  if(player.position==='QB' && qb?.listed && qb.qbId && qb.qbId!==player.id)return {note:'Not the listed starting QB'};
  const history=getPlayerGames(player,game.season).filter(g=>+g.week<+game.week);
  const key=usageFor[line.metric];
  const sample=history.filter(g=>Number.isFinite(g.stats?.[line.metric]) && Number.isFinite(g.usage?.[key]));
  if(!sample.length)return {note:'No current-season sample'};
  const rate=priors.rates[positionGroup(player.position)+':'+line.metric];
  if(!rate)return {note:'Insufficient position history'};
  const usage=sample.reduce((sum,g)=>sum+g.usage[key],0);
  const latest=sample.slice(-5);
  let volume=.6*latest.reduce((sum,g)=>sum+g.usage[key],0)/latest.length+.4*usage/sample.length;
  let note=sample.length<3?'Limited sample · '+sample.length+' G':'';
  if(+game.week-sample.at(-1).week>2)note+=(note?' · ':'')+'No recent game';
  if(player.position==='QB' && qb?.listed && qb.qbId===player.id && priors.starter.games && !sample.some(g=>g.usage.offenseSnapRate>=.5)){
    volume=priors.starter[key]/priors.starter.games;
    note='Starting QB workload estimate · '+sample.length+' G';
  }
  if(!volume)return {note:'No recorded workload for this market'};
  const total=sample.reduce((sum,g)=>sum+g.stats[line.metric],0);
  const efficiency=(total+20*rate.value/rate.opps)/(usage+20);
  const estimate=line.metric==='rushingAttempts'?volume:volume*efficiency;
  return {estimated:line.anytime?100*(-Math.expm1(-estimate)):estimate,note,
    sampleLabel:game.season+' · '+sample.length+' G',seasonAvg:total/sample.length,
    recentAvg:latest.reduce((sum,g)=>sum+g.stats[line.metric],0)/latest.length};
}
