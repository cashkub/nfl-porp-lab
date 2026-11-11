import {playerKey,postedLines,priceText} from './bookLine.js';
import {METRICS} from './stats.js';

function quoteText(q){
  return q.anytime ? 'Yes '+priceText(q.over) : q.point+' (O '+priceText(q.over)+' / U '+priceText(q.under)+')';
}

export function oddsChanges(book){
  if(!book?.wednesday)return null;
  const groups=new Map();
  function collect(snapshot,side){
    for(const q of postedLines(snapshot)){
      const market=q.anytime?'Anytime TD':METRICS[q.metric]?.label||q.metric;
      const key=playerKey(q.player)+'|'+market;
      if(!groups.has(key))groups.set(key,{label:q.player+' · '+market,before:[],after:[]});
      groups.get(key)[side].push(q);
    }
  }
  collect(book.wednesday,'before');
  collect(book,'after');
  const changes=[];
  for(const {label,before,after} of groups.values()){
    if(before.length===1 && after.length===1){
      if(quoteText(before[0])!==quoteText(after[0]))changes.push({label,text:quoteText(before[0])+' → '+quoteText(after[0])});
      continue;
    }
    for(const q of before){
      const current=after.find(a=>a.point===q.point);
      if(!current)changes.push({label,text:'No longer offered · '+quoteText(q)});
      else if(quoteText(q)!==quoteText(current))changes.push({label,text:quoteText(q)+' → '+quoteText(current)});
    }
    for(const q of after)if(!before.some(b=>b.point===q.point))changes.push({label,text:'New Sunday · '+quoteText(q)});
  }
  return changes;
}

export function injuryChanges(game){
  const baseline=game.wednesdayInjuries;
  if(!baseline)return null;
  const changes=[];
  for(const team of [game.away,game.home]){
    const previous=baseline.teams[team];
    if(!previous)continue;
    const prior=new Map(previous.map(r=>[playerKey(r.name),r.status]));
    for(const r of game.injuries?.[team]||[]){
      const status=r.gameStatus||r.status,old=prior.get(playerKey(r.name));
      if(status && status.toLowerCase()!==old?.toLowerCase()){
        changes.push({label:team+' · '+r.name,text:(old?old+' → ':'New report · ')+status,at:r.date});
      }
    }
  }
  return changes;
}
