import React,{useEffect,useMemo,useState} from 'react';
import {ChevronDown,Activity,Info} from 'lucide-react';
import PlayerPhoto from './PlayerPhoto.jsx';
import NflToolHeader from './NflToolHeader.jsx';
import {availableStats} from '../lib/availableStats.js';
import {bookLine,playerKey} from '../lib/bookLine.js';
import {defenseTable} from '../lib/matchup.js';
import {getPlayerGames,formatRate,isHit} from '../lib/stats.js';
import {METRICS} from '../lib/stats.js';
import {rateStyle} from './HitRate.jsx';
import './TopLooks.css';

const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dayLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'short',day:'numeric'}).format(new Date(value));
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

function makePick(player,game,metric,market,quote,history,defense,side,teamVolumes,roleRanks) {
  const line=quote.point;
  const values=history.map(g=>Number(g.stats[metric]??0));
  const recent=values.slice(-5),average=mean(values),recentAverage=mean(recent);
  const projection=average*.55+recentAverage*.45;
  const variance=values.reduce((sum,n)=>sum+(n-average)**2,0)/Math.max(1,values.length-1);
  const sd=Math.sqrt(variance);
  const hits=values.filter(n=>isHit(n,line,side)).length;
  const recentHits=recent.filter(n=>isHit(n,line,side)).length;
  const observed=(hits+2)/(values.length+4);
  const signedDistance=sd?(side==='over'?projection-line:line-projection)/sd:0;
  const projectionChance=clamp(.5+signedDistance*.18,.12,.88);
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
  const redZone=metric==='scoredTDs'?history.map(game=>game.scoringChances).filter(Array.isArray):[];
  const rz20=redZone.length?mean(redZone.map(row=>Number(row[3])||0)):null;
  const rz5=redZone.length?mean(redZone.map(row=>Number(row[4])||0)):null;
  const redZoneExpected=rz20==null||rz5==null?null:Math.max(0,rz20-rz5)*.06+rz5*.16;
  const redZoneSignal=redZoneExpected==null?0:clamp((side==='over'?redZoneExpected-line:line-redZoneExpected)/Math.max(.2,sd*.2),-1,1);
  const chance=clamp(observed*.61+projectionChance*.2+(fairSide??.5)*.15+(weather?.signal||0)*.035+redZoneSignal*.035+injury.signal*.025-injuryPenalty,.05,.95);
  const edge=chance-(fairSide??.5);
  const projectionSignal=clamp((side==='over'?projection-line:line-projection)/(sd||Math.max(1,Math.abs(line)*.2)),-1,1);
  const usageSignal=usageTrend==null?0:clamp(usageTrend/Math.max(1,Math.abs(average)*.12),-1,1)*(side==='over'?1:-1);
  const shareSignal=share.trend==null?0:clamp(share.trend*5,-1,1)*(side==='over'?1:-1);
  const shareLevel=share.recent==null||usageKey==='attempts'?0:share.recent>=.2?clamp((share.recent-.2)/.2,0,1):share.recent<=.08?-.5:0;
  const volumeSignal=usageSignal*.5+shareSignal*.3+shareLevel*(side==='over'?1:-1)*.2;
  const score=100*(.38*edge+.22*projectionSignal+.12*defensiveEdge+.12*volumeSignal+.06*(weather?.signal||0)+.06*redZoneSignal+.04*injury.signal);
  const matchup=defenseFit(defense?.rank,32,side,market.label,player.position);
  const weatherSupports=(weather?.signal||0)>.08;
  const marketSupports=fairSide!=null&&fairSide>=.52;
  const supportCount=[recentHits/Math.max(1,recent.length)>=.6,volumeSignal>.12,defensiveEdge>.15,weatherSupports,redZoneSignal>.15,injury.signal>.15,marketSupports].filter(Boolean).length;
  return {player,game,metric,market,line,quote,history,defense,side,projection,values,recent,hits,recentHits,chance,fairSide,edge,score,usageKey,usageTrend,share,volumeSignal,average,recentAverage,matchup,weather,injury,redZoneSignal,redZoneExpected,rz20,rz5,supportCount,projectionSignal,defensiveEdge};
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

export default function TopLooks({players,schedule,books,season,now,loading,error,onOpen}) {
  const future=schedule.filter(game=>Date.parse(game.kickoff)>now);
  const days=[...new Set(future.map(game=>dayKey(game.kickoff)))].sort();
  const weeks=[...new Set(future.map(game=>String(game.week)))].sort((a,b)=>Number(a)-Number(b));
  const initialParams=new URLSearchParams(window.location.search);
  const [type,setType]=useState(()=>initialParams.get('topType')==='anytime'?'anytime':'props');
  const [mode,setMode]=useState(()=>initialParams.get('topMode')==='week'?'week':'day');
  const [selected,setSelected]=useState(()=>initialParams.get('topSelection')||'');
  const options=mode==='day'?days:weeks;
  const value=options.includes(selected)?selected:options[0]||'';
  const slate=future.filter(game=>mode==='day'?dayKey(game.kickoff)===value:String(game.week)===value);
  useEffect(()=>{
    const url=new URL(window.location.href);
    url.searchParams.set('topMode',mode);
    url.searchParams.set('topType',type);
    if(value)url.searchParams.set('topSelection',value);else url.searchParams.delete('topSelection');
    window.history.replaceState(window.history.state,'',url);
  },[mode,value,type]);
  const teamVolumes=useMemo(()=>makeTeamVolumes(players,season),[players,season]);
  const picks=useMemo(()=>{
    const candidates=[],cache=new Map();
    for(const game of slate){
      const roleRanks=buildRoleRanks(players,season,game);
      for(const player of players){
      if(player.team!==game.home&&player.team!==game.away)continue;
      const opponent=player.team===game.home?game.away:game.home;
      const history=getPlayerGames(player,season).filter(row=>Number(row.week)<Number(game.week)).slice(-10);
      if(history.length<5)continue;
      for(const metric of availableStats(METRICS,history)){
        const isAnytime=metric==='scoredTDs';
        if((type==='props'&&isAnytime)||(type==='anytime'&&!isAnytime))continue;
        const quote=type==='anytime'?anytimeLine(books,game,player.name):bookLine(books,game,player.name,metric);
        const average=mean(history.map(row=>Number(row.stats[metric]??0)));
        if(!Number.isFinite(quote?.point)&&average<=0)continue;
        const line=Number.isFinite(quote?.point)?quote.point:(type==='anytime'?0.5:Number(average.toFixed(1)));
        const selectedQuote=quote?{...quote}:{point:line,over:null,under:null,isBookLine:false,anytime:type==='anytime'};
        const market={label:type==='anytime'?'Anytime Touchdown':METRICS[metric].label,unit:METRICS[metric].unit,short:metric};
        const posMetric=player.position+'|'+metric+'|'+game.week;
        if(!cache.has(posMetric))cache.set(posMetric,defenseTable(players,season,player.position,metric,game.week));
        const defense=cache.get(posMetric).find(row=>row.team===opponent);
        const availability=playerInjuryStatus(game,player);
        if(availability==='out'||availability==='doubtful')continue;
        // Anytime TD is a Yes market. There is no published No price in our
        // automated feed, so never manufacture an Under/No recommendation.
        const sides=type==='anytime'?['over']:['over','under'];
        for(const side of sides)candidates.push(makePick(player,{...game,opponent},metric,market,selectedQuote,history,defense,side,teamVolumes,roleRanks));
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
  },[slate,players,season,books,teamVolumes,type]);
  const markets=Object.fromEntries(Object.entries(METRICS).map(([key,market])=>[key,market.label]));
  const kickDate=value&&mode==='day'?dayLabel(value):value?'Week '+value:'Upcoming';
  return <main className="top-looks chart-lab"><NflToolHeader active="top"/>
    <div className="top-looks-heading">
      <div><span className="top-kicker">MODEL RANKED PLAYER PROPS</span><h1>Top <em>Looks</em></h1>
        <p>Qualified picks ranked by recent production, usage, and matchup.</p></div>
      <span className="slate-count">{picks.length} QUALIFIED</span>
    </div>
    <section className="top-filter panel">
      <label>Show Picks By<select value={mode} onChange={event=>{setMode(event.target.value);setSelected('');}}>
        <option value="day">Game Date</option><option value="week">Week</option>
      </select><ChevronDown size={15}/></label>
      <label>{mode==='day'?'Date':'Week'}<select value={value} onChange={event=>setSelected(event.target.value)}>
        {options.map(option=><option key={option} value={option}>{mode==='day'?dayLabel(option):'Week '+option}</option>)}
      </select><ChevronDown size={15}/></label>
      <div className="pick-type" role="group" aria-label="Pick Type"><span>PICK TYPE</span><div><button type="button" aria-pressed={type==='anytime'} onClick={()=>setType('anytime')}>Anytime Touchdowns</button><button type="button" aria-pressed={type==='props'} onClick={()=>setType('props')}>Player Props</button></div></div>
      <span>{kickDate} · {slate.length} {slate.length===1?'game':'games'}</span>
    </section>
    {loading||error?<p>{error||'Loading Top Looks…'}</p>:picks.length?
      <section className="top-pick-list">{picks.map((pick,index)=>{
        const context=gameContext(pick.game,pick);
        const recentLabel=pick.recent.length?'last '+pick.recent.length:'recent';
        const shareLabel=pick.usageKey==='targets'?'Target Share':pick.usageKey==='carries'?'Carry Share':pick.usageKey==='attempts'?'Attempt Share':'Touch Share';
        return <article className="top-pick panel" key={pick.game.id+pick.player.id+pick.metric+pick.side}>
          <div className="pick-rank">{String(index+1).padStart(2,'0')}</div>
          <PlayerPhoto id={pick.player.id} name={pick.player.name} url={pick.player.photo}/>
          <div className="top-pick-main">
            <div className="top-matchup">{pick.player.team} · {pick.game.opponent} · {new Date(pick.game.kickoff).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</div>
            <h2>{pick.player.name}</h2><p>{pick.quote.anytime?(pick.side==='over'?'ANYTIME TD · YES':'ANYTIME TD · NO'):pick.side.toUpperCase()+' '+pick.line+' '+markets[pick.metric]}</p>
            <small className={'line-origin '+(pick.quote.isBookLine?'sportsbook':'average')}>{pick.quote.anytime?(pick.quote.isBookLine?'DRAFTKINGS ANYTIME TD ODDS':'MODEL ESTIMATE · NO ODDS'):pick.quote.isBookLine?'DRAFTKINGS LINE':'PLAYER AVERAGE LINE'}</small>
          </div>
          <div className="top-pick-stat projection-stat"><small>PROJECTION</small><b>{pick.projection.toFixed(1)}</b><small>vs. {pick.line} Line</small></div>
          <div className="top-pick-stat chance-stat"><small>EST. HIT RATE</small><b style={rateStyle(pick.chance)}>{formatRate(pick.chance)}</b><small>{pick.hits}/{pick.history.length} prior</small></div>
          <div className="top-pick-stat defense-stat"><small>MATCHUP</small><b>{pick.matchup||'—'}</b><small>{pick.quote.isBookLine?(pick.side==='over'?'DK YES ':'DK NO ')+(pick.side==='over'?pick.quote.over:pick.quote.under):'Odds unavailable'}</small></div>
          <div className="top-pick-actions">
            <button type="button" onClick={()=>onOpen(pick.player,{metric:pick.metric,point:pick.line,source:pick.quote.anytime?(pick.quote.isBookLine?'DraftKings Anytime TD Odds':'Model Estimate'):(pick.quote.isBookLine?'DraftKings':'Player Average')},pick.side,pick.game)}><Activity size={15}/>Charts</button>
            <details><summary><Info size={15}/>Why This Pick?</summary>
              <div className="pick-reason">
                <b>WHY THE MODEL LIKES THIS PICK</b>
                <div className="pick-reason-grid">
                  <section><strong>HISTORICAL RESULTS</strong><span>{pick.side.toUpperCase()} hit {pick.hits} of {pick.history.length} prior games; {pick.recentHits} of {pick.recent.length} in the {recentLabel}.</span></section>
                  <section><strong>PROJECTION</strong><span>{projectionReason(pick)}</span></section>
                  {pick.volumeSignal>.1&&<section><strong>{shareLabel.toUpperCase()}</strong><span>{fmtShare(pick.share.average)} of team {pick.usageKey} across {pick.share.count} recent games{pick.share.trend!=null?'; recent share '+(pick.share.trend>0?'+':'')+(pick.share.trend*100).toFixed(1)+' percentage points':''}.</span></section>}
                  {pick.usageTrend!=null&&pick.usageTrend*(pick.side==='over'?1:-1)>0&&<section><strong>RECENT WORKLOAD</strong><span>{pick.usageKey}: {pick.usageTrend>0?'+':''}{pick.usageTrend.toFixed(1)} per game over the last 3 compared with the previous 3.</span></section>}
                  {pick.matchup&&<section><strong>DEFENSE MATCHUP</strong><span>{pick.game.opponent} {pick.matchup.toLowerCase()} ({pick.defense.average.toFixed(1)} per game over {pick.defense.games} games).</span></section>}
                  {pick.metric==='scoredTDs'&&pick.redZoneSignal>.1&&(pick.rz20!=null||pick.rz5!=null)&&<section><strong>RED-ZONE TOUCHES</strong><span>{pick.rz20==null?'':pick.rz20.toFixed(1)+' inside-20 touches per game'}{pick.rz20!=null&&pick.rz5!=null?' · ':''}{pick.rz5==null?'':pick.rz5.toFixed(1)+' inside-5 touches per game'}; recent scoring-area usage supports this line.</span></section>}
                  {pick.quote.isBookLine&&pick.fairSide!=null&&pick.fairSide>=.52&&<section><strong>{pick.quote.anytime?'ANYTIME TD PRICE':'NO-VIG MARKET'}</strong><span>{pick.quote.anytime?'The listed Yes price implies '+formatRate(pick.fairSide)+' before removing sportsbook margin.':'Market price implies '+formatRate(pick.fairSide)+' for the '+pick.side+' side after removing the two-way vig.'}</span></section>}
                  {pick.weather&&pick.weather.signal>.08&&<section><strong>WEATHER FORECAST</strong><span>{pick.weather.details}. {pick.weather.interpretation}</span></section>}
                  {context.injuries.length>0&&<section className="injury-reason"><strong>KEY INJURIES</strong><span>{context.injuries.map(item=><span key={item.team+item.role+item.name}>{item.team} {item.role} · {item.name} · {item.status}{item.injury?' · '+item.injury:''}{Number.isFinite(item.volume)?' · '+item.volume.toFixed(1)+' workload per game':''}{item.selected?' · THIS PLAYER':''}</span>)}<small>Role ranks use recent team workload; only key skill-position reports are shown.</small></span></section>}
                </div>
                <small>The model weighs recent results, projection, matchup, relevant workload share, scoring-area usage, injuries, weather and available market prices. It only surfaces picks with a positive estimated edge and directional projection support. Estimated hit rate is not calibrated against completed Top Looks slates.</small>
              </div>
            </details>
          </div>
        </article>;
      })}</section>:
      <section className="no-top-picks panel"><h2>No qualified picks for {kickDate}</h2>
        <p>Top Looks ranks real DraftKings lines first and uses a player-average line only when no sportsbook line is available. A short slate may have fewer than three picks.</p>
      </section>}
  </main>;
}

