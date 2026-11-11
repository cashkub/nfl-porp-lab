import {availableStats} from './availableStats.js';
import {bookLine,playerKey,postedLines,matchupBook} from './bookLine.js';
import {defenseTable} from './matchup.js';
import {getPlayerGames,formatRate,isHit,estimateModelHitRate,METRICS} from './stats.js';
import {buildOpportunityEfficiencyPriors,estimateOpportunityProjection} from './playerProjection.js';

const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
// `value` is an Eastern calendar date (YYYY-MM-DD), not a UTC instant.
// Noon UTC keeps it on that same calendar day when formatted in Eastern time.
const dayLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'short',day:'numeric'}).format(new Date(value+'T12:00:00Z'));
const ordinal=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;

function defenseFit(rank,total,side,metric,position){
  if(!rank||!total)return '';
  if(side==='over'&&rank<=Math.ceil(total/4)){
    const label=rank===1?'most':ordinal(rank)+' most';
    return 'Allows '+label+' '+metric.toLowerCase()+' to '+position+'s';
  }
  if(side==='under'&&rank>=(total-Math.ceil(total/4)+1)){
    const place=total-rank+1,label=place===1?'fewest':ordinal(place)+' fewest';
    return 'Allows '+label+' '+metric.toLowerCase()+' to '+position+'s';
  }
  return '';
}
const impliedProbability=price=>Number.isFinite(price)?(price>0?100/(price+100):Math.abs(price)/(Math.abs(price)+100)):null;

function weatherImpact(game,metric,side){
  const weather=game.context?.weather;
  if(!weather)return null;
  const passSensitive=['passingYards','passingTDs','receivingYards'].includes(metric);
  const wind=Number(weather.wind),rain=Number(weather.rain),temp=Number(weather.temp);
  const windRisk=Number.isFinite(wind)?clamp((wind-15)/15,0,1)*.55:0;
  const rainRisk=Number.isFinite(rain)?clamp((rain-40)/60,0,1)*.35:0;
  const coldRisk=Number.isFinite(temp)?clamp((32-temp)/25,0,1)*.10:0;
  const adverse=clamp(windRisk+rainRisk+coldRisk,0,.8);
  const signal=passSensitive?adverse*(side==='under'?1:-1):0;
  const details=[Number.isFinite(temp)?Math.round(temp)+'°F':null,Number.isFinite(wind)?'Wind '+Math.round(wind)+' mph':null,Number.isFinite(rain)?'Rain chance '+Math.round(rain)+'%':null].filter(Boolean).join(' · ');
  let interpretation='Weather is neutral for this market.';
  if(passSensitive&&adverse>=.1) interpretation=side==='under'?'Wind, rain, or cold modestly supports the Under.':'Wind, rain, or cold is a caution for the Over.';
  else if(passSensitive) interpretation='No major wind, rain, or cold signal for this passing market.';
  return {details,signal,interpretation,asOf:weather.asOf};
}

function volumeKey(metric){
  if(metric==='passingYards'||metric==='passingTDs')return 'attempts';
  if(metric==='rushingYards'||metric==='rushingAttempts')return 'carries';
  if(metric==='scoredTDs')return 'opportunities';
  return 'targets';
}
function makeTeamVolumes(players,season){
  const totals=new Map();
  for(const player of players)for(const game of player.games||[]){
    if(season!=='ALL'&&Number(game.season)!==Number(season))continue;
    const team=game.team||player.team;
    if(!game.gameId||!team)continue;
    const key=game.gameId+'|'+team;
    if(!totals.has(key))totals.set(key,{attempts:0,carries:0,targets:0,opportunities:0});
    const row=totals.get(key),usage=game.usage||{};
    row.attempts+=Number(usage.attempts)||0;
    row.carries+=Number(usage.carries)||0;
    row.targets+=Number(usage.targets)||0;
    row.opportunities+=Number(usage.opportunities)||(Number(usage.carries)||0)+(Number(usage.targets)||0);
  }
  return totals;
}
function makeScoringVolumes(players,season){
  const totals=new Map();
  for(const player of players)for(const game of player.games||[]){
    if(season!=='ALL'&&Number(game.season)!==Number(season))continue;
    if(!game.gameId||!Array.isArray(game.scoringChances)||game.scoringChances.length<5)continue;
    const team=game.team||player.team,key=game.gameId+'|'+team;
    if(!team)continue;
    if(!totals.has(key))totals.set(key,{carries:0,targets:0,touches:0,inside5Carries:0,inside5Touches:0});
    const total=totals.get(key),row=game.scoringChances;
    total.carries+=Number(row[0])||0;total.targets+=Number(row[1])||0;
    total.touches+=Number(row[3])||0;total.inside5Carries+=Number(row[2])||0;
    total.inside5Touches+=Number(row[4])||0;
  }
  return totals;
}
function scoringUsage(player,history,scoringVolumes){
  const covered=history.filter(game=>game.scoringChances?.length>=5);
  const perGame=index=>covered.length?mean(covered.map(game=>Number(game.scoringChances[index])||0)):null;
  const share=(index,field)=>{
    const values=covered.map(game=>{
      const team=game.team||player.team,total=scoringVolumes.get(game.gameId+'|'+team)?.[field]||0;
      return total>0?(Number(game.scoringChances[index])||0)/total:null;
    }).filter(Number.isFinite);
    return mean(values);
  };
  return {games:covered.length,redZoneCarries:perGame(0),redZoneTargets:perGame(1),inside5Carries:perGame(2),redZoneTouches:perGame(3),inside5Touches:perGame(4),carryShare:share(0,'carries'),targetShare:share(1,'targets')};
}
function defenseTone(rank,side){
  if(!rank)return 'neutral';
  const favorable=side==='under'?rank>=25:rank<=8;
  const tough=side==='under'?rank<=8:rank>=25;
  return favorable?'favorable':tough?'tough':'neutral';
}
function marketShare(player,history,key,teamVolumes){
  const shares=history.slice(-6).map(game=>{
    const team=game.team||player.team;
    const total=teamVolumes.get(game.gameId+'|'+team)?.[key]||0;
    const own=Number(game.usage?.[key])||0;
    return total>0?own/total:null;
  }).filter(Number.isFinite);
  const recent=shares.slice(-3),previous=shares.slice(-6,-3);
  return {average:mean(shares),recent:mean(recent),trend:recent.length===3&&previous.length===3?mean(recent)-mean(previous):null,count:shares.length};
}

function playerInjuryStatus(game,player){
  const item=(game.injuries?.[player.team]||[]).find(row=>row.id===player.id||row.name?.toLowerCase()===player.name?.toLowerCase());
  const status=String(item?.gameStatus||'').toLowerCase();
  return ['out','doubtful','questionable'].includes(status)?status:null;
}
function roleVolume(player,team,position,season,week){
  const key=position==='QB'?'attempts':position==='RB'||position==='FB'?'opportunities':'targets';
  const games=getPlayerGames(player,season).filter(game=>Number(game.week)<Number(week)&&(game.team||player.team)===team).slice(-5);
  if(games.length<2)return null;
  return mean(games.map(game=>{
    const usage=game.usage||{};
    return key==='opportunities'?(Number(usage.carries)||0)+(Number(usage.targets)||0):(Number(usage[key])||0);
  }));
}
const roleLimit={QB:2,RB:2,FB:1,WR:4,TE:2};
function buildRoleRanks(players,season,game){
  const roles=new Map();
  for(const team of [game.home,game.away])for(const position of Object.keys(roleLimit)){
    const ranked=players.filter(player=>player.team===team&&player.position===position)
      .map(player=>({player,volume:roleVolume(player,team,position,season,game.week)}))
      .filter(item=>item.volume!=null).sort((a,b)=>b.volume-a.volume);
    ranked.forEach((item,index)=>roles.set(team+'|'+position+'|'+item.player.id,{rank:index+1,volume:item.volume}));
  }
  return roles;
}
function injuryAssessment(game,player,metric,side,roleRanks){
  const ownStatus=playerInjuryStatus(game,player);
  let signal=0;
  const notes=[];
  const ownRole=roleRanks.get(player.team+'|'+player.position+'|'+player.id);
  const passMarket=['passingYards','passingTDs','receivingYards','receptions'].includes(metric);
  for(const report of game.injuries?.[player.team]||[]){
      const status=String(report.gameStatus||report.status||'').toLowerCase();
      if(!['out','doubtful','questionable'].includes(status))continue;
      const position=String(report.position||'').toUpperCase();
      const own=report.id===player.id||report.name?.toLowerCase()===player.name?.toLowerCase();
      if(own)continue;
      if(position==='QB'&&passMarket){
        const role=roleRanks.get(player.team+'|QB|'+report.id);
        if(role?.rank===1){
          const strength=status==='out'?.55:status==='doubtful'?.35:.18;
          signal=Math.max(signal,side==='under'?strength:-strength);
          notes.push({team:player.team,role:'QB1',name:report.name,status:status.toUpperCase(),injury:report.injury,impact:side==='under'?'supports the Under':'risk to this passing Over'});
        }
        continue;
      }
      if(position!==player.position)continue;
      const role=roleRanks.get(player.team+'|'+position+'|'+report.id);
      if(!role||role.rank>roleLimit[position]||!ownRole||role.rank>=ownRole.rank||ownRole.rank-role.rank>2)continue;
      const strength=(status==='out'?1:status==='doubtful'?.55:.25)/(ownRole.rank-role.rank);
      signal=Math.max(signal,side==='over'?strength:-strength);
      notes.push({team:player.team,role:position+role.rank,name:report.name,status:status.toUpperCase(),injury:report.injury,volume:role.volume,impact:side==='over'?'may free workload for this player':'could shift workload toward this player'});
  }
  const ownReport=(game.injuries?.[player.team]||[]).find(report=>report.id===player.id||report.name?.toLowerCase()===player.name?.toLowerCase());
  if(ownStatus)notes.unshift({team:player.team,role:ownRole?player.position+ownRole.rank:player.position,name:player.name,status:ownStatus.toUpperCase(),injury:ownReport?.injury,selected:true,impact:'availability risk'});
  return {signal:clamp(signal,-.8,.8),notes:notes.slice(0,4),ownStatus,ownRole};
}

function makePick(player,game,metric,market,quote,history,defense,side,teamVolumes,scoringVolumes,roleRanks,projection) {
  const line=quote.point;
  const values=history.map(g=>Number(g.stats[metric]??0));
  const recent=values.slice(-5),average=mean(values),recentAverage=mean(recent);
  const projectionValue=Number.isFinite(projection)?projection:average*.55+recentAverage*.45;
  const variance=values.reduce((sum,n)=>sum+(n-average)**2,0)/Math.max(1,values.length-1);
  const sd=Math.sqrt(variance);
  const hits=values.filter(n=>isHit(n,line,side)).length;
  const recentHits=recent.filter(n=>isHit(n,line,side)).length;
  const overImplied=impliedProbability(quote.over),underImplied=impliedProbability(quote.under);
  const fairSide=overImplied!=null&&underImplied!=null
    ? (side==='over'?overImplied:underImplied)/(overImplied+underImplied)
    : side==='over'?overImplied:underImplied;
  const usageKey=volumeKey(metric);
  const usage=history.map(g=>Number(g.usage?.[usageKey])).filter(Number.isFinite);
  const recentUsage=usage.slice(-3),previousUsage=usage.slice(-6,-3);
  const usageTrend=recentUsage.length===3&&previousUsage.length===3?mean(recentUsage)-mean(previousUsage):null;
  const share=marketShare(player,history,usageKey,teamVolumes);
  const defensiveEdge=defense?.rank
    ? clamp((16.5-defense.rank)/15.5,-1,1)*(side==='over'?1:-1)
    :0;
  const weather=weatherImpact(game,metric,side);
  const injury=injuryAssessment(game,player,metric,side,roleRanks);
  const injuryPenalty=injury.ownStatus==='questionable'?.045:injury.ownStatus==='doubtful'?.08:0;
  const scoring=metric==='scoredTDs'?scoringUsage(player,history,scoringVolumes):null;
  const targetSignal=scoring?.targetShare==null?0:clamp((scoring.targetShare-.16)/.24,-1,1);
  const carrySignal=scoring?.carryShare==null?0:clamp((scoring.carryShare-.2)/.24,-1,1);
  const receiver=['WR','TE'].includes(player.position);
  const redZoneSignal=metric==='scoredTDs'
    ? (receiver?targetSignal:['RB','FB'].includes(player.position)?Math.max(targetSignal,carrySignal):carrySignal)
    : 0;
  const favoriteRedZoneTarget=receiver||(['RB','FB'].includes(player.position)&&targetSignal>carrySignal);
  const primaryShare=favoriteRedZoneTarget?scoring?.targetShare:scoring?.carryShare;
  const chance=estimateModelHitRate(history,metric,line,side,{marketProbability:fairSide,weatherSignal:weather?.signal||0,redZoneSignal,injurySignal:injury.signal,injuryPenalty}).rate;
  const edge=chance-(fairSide??.5);
  const projectionSignal=clamp((side==='over'?projectionValue-line:line-projectionValue)/(sd||Math.max(1,Math.abs(line)*.2)),-1,1);
  const usageSignal=usageTrend==null?0:clamp(usageTrend/Math.max(1,Math.abs(average)*.12),-1,1)*(side==='over'?1:-1);
  const shareSignal=share.trend==null?0:clamp(share.trend*5,-1,1)*(side==='over'?1:-1);
  const shareLevel=share.recent==null||usageKey==='attempts'?0:share.recent>=.2?clamp((share.recent-.2)/.2,0,1):share.recent<=.08?-.5:0;
  const volumeSignal=usageSignal*.5+shareSignal*.3+shareLevel*(side==='over'?1:-1)*.2;
  const isAnytime=metric==='scoredTDs';
  const workloadWeight=isAnytime ? 0.12 : 0.18,redZoneWeight=isAnytime ? 0.06 : 0;
  const score=100*(.38*edge+.22*projectionSignal+.12*defensiveEdge+workloadWeight*volumeSignal+.06*(weather?.signal||0)+redZoneWeight*redZoneSignal+.04*injury.signal);
  const rankScore=Math.round(clamp(50+score/2,0,100));
  const matchup=defenseFit(defense?.rank,32,side,market.label,player.position)|| (defense?.rank?'Defense Rank #'+defense.rank+' of 32':'');
  const matchupTone=defenseTone(defense?.rank,side);
  const weatherSupports=(weather?.signal||0)>.08;
  const marketSupports=fairSide!=null&&fairSide>=.52;
  const supportCount=[recentHits/Math.max(1,recent.length)>=.6,volumeSignal>.12,defensiveEdge>.15,weatherSupports,redZoneSignal>.15,injury.signal>.15,marketSupports].filter(Boolean).length;
  const reasons=[
    {weight:.38,value:edge,label:'Market Edge',detail:fairSide==null?'The estimated edge comes from results and projection because market odds are unavailable.':`Model estimate ${(chance*100).toFixed(0)}% versus ${quote.anytime?'the listed Yes price at '+quote.over:side+' market odds'} (${(fairSide*100).toFixed(0)}% implied).`},
    {weight:.22,value:projectionSignal,label:'Projection',detail:`The shared opportunity model projects ${projectionValue.toFixed(1)} against the ${line} line.`},
    {weight:.12,value:defensiveEdge,label:'Matchup',detail:matchup||'Defense rank unavailable.'},
    {weight:workloadWeight,value:volumeSignal,label:'Workload',detail:usageTrend!=null?`Recent ${usageKey} volume changed ${usageTrend>0?'+':''}${usageTrend.toFixed(1)} per game.`:`Recent share of team ${usageKey}: ${fmtShare(share.recent)}.`},
    {weight:redZoneWeight,value:redZoneSignal,label:'Red-Zone Usage',detail:primaryShare!=null?`${favoriteRedZoneTarget?'Red-zone target':'Red-zone carry'} share is ${fmtShare(primaryShare)}.`:'Red-zone play-by-play share is unavailable.'},
    {weight:.06,value:weather?.signal||0,label:'Weather',detail:weather?.interpretation||'Forecast data unavailable.'},
    {weight:.04,value:injury.signal,label:'Key Injuries',detail:injury.notes.length?injury.notes[0].impact:'No relevant key-injury signal.'}
  ].filter(reason=>reason.value>0).sort((a,b)=>b.weight*b.value-a.weight*a.value);
  const favoriteReason=reasons[0]||{label:'Recent Results',detail:`The player hit ${hits} of ${history.length} games at this line.`};
  return {player,game,metric,market,line,quote,history,defense,side,projection:projectionValue,values,recent,hits,recentHits,chance,fairSide,edge,score,rankScore,usageKey,usageTrend,share,volumeSignal,average,recentAverage,matchup,matchupTone,weather,injury,scoring,redZoneSignal,supportCount,projectionSignal,defensiveEdge,favoriteReason};
}

function fmtShare(value){return Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';}
function averageLineLabel(p){return p.quote.isBookLine?'DraftKings line':'player average line';}
function projectionReason(p){
  const delta=p.side==='over'?p.projection-p.line:p.line-p.projection;
  return 'Projection: '+p.projection.toFixed(1)+' is '+Math.abs(delta).toFixed(1)+' '+(p.projection>p.line?'above':'below')+' the '+p.line+' line'+(delta>=0?' and supports the '+p.side.toUpperCase()+'.':' and cuts against the '+p.side.toUpperCase()+'.');
}
function gameContext(game,pick){
  return {injuries:pick.injury.notes};
}
function anytimeLine(books,game,name){
  const event=books.find(item=>item.away===game.away&&item.home===game.home&&Math.abs(Date.parse(item.kickoff)-Date.parse(game.kickoff))<12*3600000);
  const anytime=event?.anytime?.find(item=>playerKey(item.player)===playerKey(name));
  if(anytime)return {point:.5,over:anytime.price,under:null,updated:anytime.updated,isBookLine:true,anytime:true};
  const prop=bookLine(books,game,name,'scoredTDs');
  return prop?.point===.5?{...prop,isBookLine:true,anytime:true}:null;
}

export function buildTopLooks({players,slate,books,season,type}) {
  const teamVolumes=makeTeamVolumes(players,season);
  const scoringVolumes=makeScoringVolumes(players,season);
  const candidates=[],cache=new Map();
  for(const game of slate){
    const quotedNames=new Set(postedLines(matchupBook(books,game)).map(q=>playerKey(q.player)));
    const roleRanks=buildRoleRanks(players,season,game);
    const efficiencyPriors=buildOpportunityEfficiencyPriors(players,game);
    for(const player of players){
      if(player.team!==game.home&&player.team!==game.away)continue;
      if(quotedNames.size&&!quotedNames.has(playerKey(player.name)))continue;
      const opponent=player.team===game.home?game.away:game.home;
      const seasonHistory=getPlayerGames(player,season).filter(row=>Number(row.week)<Number(game.week));
      const history=getPlayerGames(player,'ALL').filter(row=>Number(row.season)<Number(game.season)||
        (Number(row.season)===Number(game.season)&&Number(row.week)<Number(game.week))).slice(-10);
      if(history.length<5)continue;
      for(const metric of availableStats(METRICS,history)){
        const isAnytime=metric==='scoredTDs';
        if((type==='props'&&isAnytime)||(type==='anytime'&&!isAnytime))continue;
        const quote=type==='anytime'?anytimeLine(books,game,player.name):bookLine(books,game,player.name,metric);
        if(quotedNames.size&&!quote)continue;
        const average=mean(history.map(row=>Number(row.stats[metric]??0)));
        if(!Number.isFinite(quote?.point)&&average<=0)continue;
        const line=Number.isFinite(quote?.point)?quote.point:(type==='anytime'?0.5:Number(average.toFixed(1)));
        const selectedQuote=quote?{...quote,isBookLine:true}:{point:line,over:null,under:null,isBookLine:false,anytime:type==='anytime'};
        let pointProjection;
        if(isAnytime){
          const values=history.map(row=>Number(row.stats[metric]??0)),recent=values.slice(-5);
          pointProjection=mean(values)*.55+mean(recent)*.45;
        }else{
          const projectionHistory=seasonHistory.length?getPlayerGames(player,'ALL').filter(row=>Number(row.season)<Number(game.season)||
            (Number(row.season)===Number(game.season)&&Number(row.week)<Number(game.week))):history;
          const estimate=estimateOpportunityProjection({history:projectionHistory,position:player.position,market:metric,
            season:game.season,priorEfficiency:efficiencyPriors[player.position+':'+metric]??null});
          if(!estimate)continue;
          pointProjection=estimate.projection;
        }
        const market={label:type==='anytime'?'Anytime Touchdown':METRICS[metric].label,unit:METRICS[metric].unit,short:metric};
        const posMetric=player.position+'|'+metric+'|'+game.week;
        if(!cache.has(posMetric))cache.set(posMetric,defenseTable(players,season,player.position,metric,game.week));
        const defense=cache.get(posMetric).find(row=>row.team===opponent);
        const availability=playerInjuryStatus(game,player);
        if(['out','doubtful','inactive','ir','injured reserve','suspended','pup'].includes(availability))continue;
        const sides=type==='anytime'?['over']:['over','under'];
        for(const side of sides.filter(s=>!quote||Number.isFinite(quote[s])))candidates.push(makePick(player,{...game,opponent},metric,market,selectedQuote,history,defense,side,teamVolumes,scoringVolumes,roleRanks,pointProjection));
      }
    }
  }
  const ranked=candidates.sort((a,b)=>Number(b.quote.isBookLine)-Number(a.quote.isBookLine)||b.score-a.score);
  const cap=slate.length===1?3:10;
  const used=new Set();
  return ranked.filter(p=>{
    const key=p.player.id+'|'+p.metric;
    if(used.has(key)||p.edge<.015||p.projectionSignal<0||p.score<=2||p.supportCount<1)return false;
    used.add(key);return true;
  }).slice(0,cap);
}

export {dayKey,dayLabel,fmtShare,averageLineLabel,projectionReason,gameContext};
