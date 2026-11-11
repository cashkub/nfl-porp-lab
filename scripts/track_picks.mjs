// Publish a fixed, independently reviewable slate before games start.
import {cfbRoleGames,manualMarkets} from '../src/lib/manualSports.js';
import fs from 'node:fs';
import {getPlayerGames,METRICS} from '../src/lib/stats.js';
import {playerKey,usageFor} from '../src/lib/bookLine.js';
import {defenseTable} from '../src/lib/matchup.js';
import {collegeRatings,projection} from '../src/lib/projection.js';
import {buildTopLooks,dayKey as nflDayKey} from '../src/lib/topLooksModel.js';
const root='public/data/',sport=process.argv[2];
if(!['nfl','cbb','nba','cfb'].includes(sport))throw Error('Choose nfl, cbb, nba or cfb');
const read=p=>JSON.parse(fs.readFileSync(root+p));
const path=sport+'-picks.json',archive=fs.existsSync(root+path)?read(path):[];
const now=Date.now(),saved=new Date(now).toISOString();
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const day=time=>fmt.format(new Date(time));
const upcoming=g=>!g.final&&Date.parse(g.kickoff)>now&&g.timeKnown!==false && Date.parse(g.kickoff)-now<(sport==='cfb'?7*24:36)*3600000;
const code=t=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[t]||t);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const candidates=[];
const nflGamesPerDate=new Map();
function candidate({g,p,team,metric,line,side,price,values,rank,rankCount,season,role,context,minimum,label,volumeChange=0,risk=0,injuries=[]}){
  if(values.length<minimum || !values.every(Number.isFinite))return;
  const hits=values.filter(v=>side==='over'?v>line:v<line).length;
  const sign=side==='over'?1:-1;
  const recent=values.slice(-3), recentHits=recent.filter(v=>sign*(v-line)>0).length;
  const trend=(recentHits+1.5)/(recent.length+3);
  const adjusted=(hits+2)/(values.length+4);
  const matchup=rank&&rankCount>1?sign*(0.5-(rank-1)/(rankCount-1)):0;
  const breakEven=price==null?.5:price<0?-price/(100-price):100/(100+price);
  const score=.8*adjusted+.2*trend+.06*matchup+.025*sign*volumeChange-risk-breakEven;
  if(score<=0)return;
  candidates.push({gameId:g.id,kickoff:g.kickoff,away:g.away,home:g.home,awayName:g.awayName,homeName:g.homeName,
    week:g.week,postseason:g.postseason,colors:g.colors,date:day(g.kickoff),season,player:p.name,playerId:p.id,position:p.position,photo:p.photo,team,metric,label,line,side,price,score,hits,total:values.length,
    adjusted,trend,breakEven,volumeChange,risk,average:mean(values),values,defenseRank:rank,rankCount,role,context,injuries,
    lineSource:'sportsbook',snapshotVersion:1,model:'2026.11.v1',saved});
}
function settle(row,value,completed){
  if(!completed)return;
  if(!Number.isFinite(value)){if(row.actual==null)row.result='No Stat';return}
  row.actual=value;
  row.result=value===row.line?'Push':(row.side==='over'?value>row.line:value<row.line)?'Hit':'Miss';
}
if(sport==='nfl'){
  const data=read('stats.json'),season=Math.max(...data.seasons),byName=new Map(),cache=new Map();
  // Older snapshots omit slateGames. Count all scheduled games before filtering candidates.
  for(const game of data.schedule || []){
    const date=game.date || day(game.kickoff);
    nflGamesPerDate.set(date,game.slateGames ?? (nflGamesPerDate.get(date) || 0)+1);
  }
  const logs=new Map(),played=new Set();
  for(const p of data.players){
    for(const g of p.games){logs.set(g.gameId+'|'+p.id,g);played.add(g.gameId)}
    const hist=getPlayerGames(p,season);
    if(!hist.length)continue;
    const key=playerKey(p.name)+'|'+code(hist.at(-1).team);
    byName.set(key,byName.has(key)?null:{p,hist});
  }
  const photos=new Map(data.players.filter(p=>p.photo).map(p=>[p.id,p.photo]));
  for(const r of archive)if(!r.photo && photos.has(r.playerId))r.photo=photos.get(r.playerId);
  for(const r of archive)settle(r,logs.get(r.gameId+'|'+r.playerId)?.stats[r.metric],played.has(r.gameId));
  const books=read('lines.json').games;
  function keyInjuries(g,p,metric,team,side){
    const passing=['passingYards','passingTDs','receivingYards','receptions'].includes(metric);
    const targetPosition=['WR','TE'].includes(p.position),runPosition=['RB','FB'].includes(p.position);
    const workload=(entry,pos)=>{
      const key=pos==='QB'?'attempts':pos==='RB'||pos==='FB'?'opportunities':'targets';
      const logs=entry.hist.filter(x=>code(x.team)===team).slice(-5);
      const vals=logs.map(x=>key==='opportunities'?(Number(x.usage?.carries)||0)+(Number(x.usage?.targets)||0):Number(x.usage?.[key])).filter(Number.isFinite);
      return vals.length?mean(vals):0;
    };
    const positions=passing?['QB',...(targetPosition?['WR','TE']:[])]:runPosition?['RB','FB']:targetPosition?['WR','TE']:[];
    const ownGroup=[...byName.values()].filter(entry=>entry&&code(entry.hist.at(-1)?.team)===team);
    const ranks=new Map();
    for(const pos of positions){
      const ranked=ownGroup.filter(entry=>entry.p.position===pos).map(entry=>({entry,volume:workload(entry,pos)})).sort((a,b)=>b.volume-a.volume);
      ranked.forEach((row,index)=>ranks.set(row.entry.p.id,{rank:index+1,volume:row.volume,position:pos}));
    }
    const ownRank=ranks.get(p.id)?.rank;
    return (g.injuries?.[team]||[]).flatMap(report=>{
      const status=String(report.gameStatus||report.status||'').toLowerCase();
      if(!['out','doubtful','questionable'].includes(status))return [];
      const role=ranks.get(report.id)||ranks.get(ownGroup.find(x=>x.p.name?.toLowerCase()===report.name?.toLowerCase())?.p.id);
      if(!role)return [];
      const selected=report.id===p.id||report.name?.toLowerCase()===p.name?.toLowerCase();
      const isQb1=role.position==='QB'&&role.rank===1;
      const keyTeammate=role.position!=='QB'&&role.rank<=2&&ownRank&&role.rank<ownRank;
      if(!selected&&!isQb1&&!keyTeammate)return [];
      const label=role.position+role.rank;
      let impact=selected?'Availability risk for this player':isQb1?(side==='under'?'Supports the Under':'Passing production risk'):side==='over'?'May open workload for this player':'Could redirect workload toward this player';
      return [{team,role:selected?label:label,name:report.name||'Player',status:status.toUpperCase(),injury:report.injury||'',volume:role.volume,selected,impact}];
    });
  }
  function touchdownQuote(row){
    if(Date.parse(row.kickoff)<=now)return null;
    const book=books.find(g=>g.home===row.home && g.away===row.away && Math.abs(Date.parse(g.kickoff)-Date.parse(row.kickoff))<12*3600000);
    const quotes=book?.anytime?.filter(q=>playerKey(q.player)===playerKey(row.player) && Number.isFinite(q.price) && Date.parse(q.updated)<Date.parse(row.kickoff));
    return quotes?.length===1?quotes[0]:null;
  }
  function recentChances(history,team,week){
    const recent=history.filter(g=>code(g.team)===team && g.week<week).slice(-3);
    const covered=recent.filter(g=>Array.isArray(g.scoringChances));
    if(!covered.length)return null;
    return {games:covered.length,window:recent.length,totals:[0,1,2].map(i=>covered.reduce((sum,g)=>sum+g.scoringChances[i],0))};
  }
  for(const row of archive){
    if(row.model==='2026.11.v2')continue;
    if(row.kind!=='touchdown')continue;
    if(!row.chances && Date.parse(row.kickoff)>now){
      const entry=byName.get(playerKey(row.player)+'|'+row.team);
      const week=Number(row.gameId.split('_')[1]);
      if(entry?.p.id===row.playerId)row.chances=recentChances(entry.hist,row.team,week);
    }
    if(row.price!=null)continue;
    const quote=touchdownQuote(row);
    if(quote){row.price=quote.price;row.priceUpdated=quote.updated}
  }
  // Consider the full ET game day before locking the touchdown leaderboard.
  const tomorrow=day(now+24*3600000);
  const latestWeek=new Map();
  for(const entry of byName.values()){
    if(!entry)continue;
    const last=entry.hist.at(-1),team=code(last.team);
    latestWeek.set(team,Math.max(latestWeek.get(team)||0,last.week));
  }
  for(const g of data.schedule || []){
    if(!g.id || !g.timeKnown || Date.parse(g.kickoff)<=now || day(g.kickoff)>tomorrow)continue;
    for(const entry of byName.values()){
      if(!entry)continue;
      const {p,hist}=entry,last=hist.at(-1),team=code(last.team);
      if((team!==g.home && team!==g.away) || !['QB','RB','FB','WR','TE'].includes(p.position))continue;
      if(last.week<latestWeek.get(team)-1)continue;
      const injury=g.injuries?.[team]?.find(x=>x.id===p.id);
      const status=injury?.gameStatus?.toLowerCase();
      if(status==='out'||status==='doubtful')continue;
      const recent=hist.filter(x=>code(x.team)===team).slice(-10);
      const values=recent.map(x=>x.stats.scoredTDs);
      if(values.length<3 || !values.every(Number.isFinite))continue;
      const hits=values.filter(v=>v>0).length;
      const workload=mean(recent.slice(-3).map(x=>x.usage?.opportunities || 0));
      if(!hits || !workload)continue;
      const opponent=g.home===team?g.away:g.home,key=p.position+'|scoredTDs';
      if(!cache.has(key))cache.set(key,defenseTable(data.players,season,p.position,'scoredTDs'));
      const defenseRank=cache.get(key).find(r=>code(r.team)===opponent)?.rank;
      const adjusted=(hits+1)/(values.length+4);
      const lastThree=values.slice(-3).filter(v=>v>0).length;
      const matchup=defenseRank?(16.5-defenseRank)/31:0;
      const score=.7*adjusted+.2*(lastThree+1)/7+.1*Math.min(1,workload/20)+.08*matchup-(status==='questionable'?.05:0);
      const quote=touchdownQuote({...g,player:p.name});
      candidates.push({kind:'touchdown',gameId:g.id,kickoff:g.kickoff,date:day(g.kickoff),season,position:p.position,
        away:g.away,home:g.home,team,player:p.name,playerId:p.id,photo:p.photo,metric:'scoredTDs',label:'Touchdowns',
        line:.5,side:'over',price:quote?.price ?? null,priceUpdated:quote?.updated,score,hits,total:values.length,average:mean(values),values,defenseRank,
        role:workload.toFixed(1)+' carries + targets per game over the last three',context:injury?.status || '',
        chances:recentChances(hist,team,Number(g.week)),injuries:keyInjuries(g,p,'scoredTDs',team,'over'),
        lineSource:quote?'sportsbook':'estimate',snapshotVersion:1,model:'td-scorers.v1',saved});
    }
  }
  for(const book of books.filter(upcoming)){
    const g=data.schedule?.find(g=>g.id&&g.home===book.home&&g.away===book.away&&Math.abs(Date.parse(g.kickoff)-Date.parse(book.kickoff))<12*3600000);
    if(!g||!upcoming(g))continue;
    for(const line of book.lines){
      const entries=[g.away,g.home].map(t=>byName.get(playerKey(line.player)+'|'+t)).filter(Boolean);
      if(entries.length!==1||!METRICS[line.metric])continue;
      const {p,hist}=entries[0],team=code(hist.at(-1).team),opponent=team===g.home?g.away:g.home;
      const injury=g.injuries?.[team]?.find(x=>x.id===p.id);
      if(['out','doubtful'].includes(injury?.gameStatus?.toLowerCase()))continue;
      const key=p.position+'|'+line.metric;
      if(!cache.has(key))cache.set(key,defenseTable(data.players,season,p.position,line.metric));
      const rank=cache.get(key).find(r=>code(r.team)===opponent)?.rank;
      const recent=hist.slice(-10),usage=usageFor(line.metric);
      const volume=recent.slice(-3).map(x=>x.usage?.[usage.key]).filter(Number.isFinite);
      const baseline=recent.map(x=>x.usage?.[usage.key]).filter(Number.isFinite);
      const change=volume.length && baseline.length?Math.max(-1,Math.min(1,(mean(volume)-mean(baseline))/Math.max(1,mean(baseline)))):0;
      const w=g.context?.weather;
      for(const side of ['over','under']){
        if(!Number.isFinite(line[side])||Math.abs(line[side])<100)continue;
        candidate({g,p,team,metric:line.metric,label:METRICS[line.metric].label,line:line.point,side,price:line[side],
          values:recent.map(x=>x.stats[line.metric]),rank,rankCount:32,season,minimum:5,volumeChange:change,risk:injury?.gameStatus?.toLowerCase()==='questionable'?.025:0,
          role:volume.length?volume.length+'-game avg: '+mean(volume).toFixed(1)+' '+usage.label.toLowerCase():null,
          context:[injury?.status,w&&'Kickoff wind '+w.wind+' mph ('+g.context.roof+')'].filter(Boolean).join(' · '),
          injuries:keyInjuries(g,p,line.metric,team,side)});
      }
    }
  }
}else{
  const season=read(sport+'/index.json').seasons[0],folder=sport+'/'+season+'/',schedule=read(folder+'schedule.json'),meta=read(folder+'teams.json');
  const teamLogs=new Map(),schedules=new Map([[season,schedule]]);
  for(const r of archive){
    const dir=sport+'/'+r.season+'/';
    if(!fs.existsSync(root+dir+'schedule.json'))continue;
    if(!schedules.has(r.season))schedules.set(r.season,read(dir+'schedule.json'));
    const g=schedules.get(r.season).find(g=>g.id===r.gameId);
    if(!g?.final || !fs.existsSync(root+dir+r.team+'.json'))continue;
    const k=dir+r.team;if(!teamLogs.has(k))teamLogs.set(k,read(k+'.json'));
    const roster=teamLogs.get(k),log=roster.find(p=>p.id===r.playerId)?.games.find(x=>x.id===r.gameId);
    settle(r,log?.stats[r.metric],roster.some(p=>p.games.some(x=>x.id===r.gameId)));
  }
  const byTeam=new Map();
  for(const g of schedule.filter(upcoming))for(const t of [g.away,g.home]){
    g.colors=Object.fromEntries([g.away,g.home].map(id=>[id,meta.colors?.[id] || '717d90']));
    if(!byTeam.has(t))byTeam.set(t,[]);
    byTeam.get(t).push(g);
  }

  for(const p of read(folder+'board.json')){
    if(sport!=='cfb' && p.minutes<15)continue;
    for(const g of byTeam.get(p.team)||[])for(const [metric,{defaultLine:line,label}] of Object.entries(manualMarkets(sport)))for(const side of ['over','under']){
      if(sport==='cfb' && cfbRoleGames(p,metric)<2)continue;
      const opp=g.home===p.team?g.away:g.home;
      candidate({g,p,team:p.team,metric,label,line,side,price:null,values:p.recent[metric]||[],rank:meta.ranks[opp]?.[metric],
        rankCount:Object.keys(meta.ranks).length,minimum:2,season,role:sport==='cfb'?p.recent[metric].length+' offensive box scores':p.minutes+' minutes per game',context:'Manual research line'});
    }
  }
  for(const pick of archive){
    if(pick.season===season && !pick.rankCount)pick.rankCount=Object.keys(meta.ranks).length;
  }
  const gp=sport+'-games-record.json',games=fs.existsSync(root+gp)?read(gp):[];
  const tracked=new Map(games.map(g=>[g.id,g]));
  const finals=new Map(schedule.map(g=>[g.id,g]));
  for(const item of games){const g=finals.get(item.id);if(g?.final&&[g.awayScore,g.homeScore].every(Number.isFinite))item.final=[g.awayScore,g.homeScore]}
  const ratings=new Map();
  for(const g of schedule.filter(upcoming)){
    if(tracked.has(g.id))continue;
    const date=day(g.kickoff);
    if(!ratings.has(date))ratings.set(date,collegeRatings(schedule.filter(x=>x.final && day(x.kickoff)<date),now,sport!=='cbb'));
    const r=ratings.get(date),m=projection(g,r[g.away],r[g.home],true);
    if(m)tracked.set(g.id,{id:g.id,season,week:g.week,postseason:g.postseason,away:g.awayName,home:g.homeName,kickoff:g.kickoff,saved,stats:[m.a.score,m.h.score]});
  }
  for(const item of tracked.values()){
    const game=finals.get(item.id);
    if(game && meta.colors)item.colors={[item.away]:meta.colors[game.away],[item.home]:meta.colors[game.home]};
  }
  fs.writeFileSync(root+gp,JSON.stringify([...tracked.values()])+'\n');
}
if(sport==='nfl'){
  const data=read('stats.json'),season=Math.max(...data.seasons),books=read('lines.json').games;
  const slates=new Map();
  for(const game of data.schedule||[]){
    if(!game.id||game.timeKnown===false)continue;
    const date=nflDayKey(game.kickoff);
    if(!slates.has(date))slates.set(date,[]);
    slates.get(date).push(game);
  }
  for(const [date,games] of slates)for(const type of ['props','anytime']){
    if(!games.some(upcoming)||games.some(g=>Date.parse(g.kickoff)<=now)||games.length<(nflGamesPerDate.get(date)||0))continue;
    const kind=type==='anytime'?'touchdown':'prop';
    const previous=archive.filter(r=>r.model==='2026.11.v2'&&r.date===date&&r.kind===kind);
    if(previous.some(r=>r.result||Date.parse(r.kickoff)<=now))continue;
    const picks=buildTopLooks({players:data.players,slate:games,books,season,type});
    for(const row of previous)archive.splice(archive.indexOf(row),1);
    picks.forEach((pick,index)=>{
      const {player,game,quote}=pick;
      const kind=type==='anytime'?'touchdown':'prop';
      const price=quote.anytime?quote.over:quote[pick.side];
      const covered=pick.history.filter(row=>Array.isArray(row.scoringChances)&&row.scoringChances.length>=5);
      const chances=kind==='touchdown'&&covered.length?{
        games:covered.length,window:pick.history.length,
        totals:[0,1,2].map(i=>covered.reduce((sum,row)=>sum+(Number(row.scoringChances[i])||0),0))
      }:null;
      const roleDetail=[pick.usageKey+' share '+(Number.isFinite(pick.share.average)?(pick.share.average*100).toFixed(1)+'%':'unavailable'),pick.usageTrend==null?null:'recent volume '+(pick.usageTrend>0?'+':'')+pick.usageTrend.toFixed(1)].filter(Boolean).join(' · ');
      archive.push({
        id:[game.id,player.id,pick.metric,pick.side,'v2'].join('|'),kind,gameId:game.id,kickoff:game.kickoff,date,
        away:game.away,home:game.home,awayName:game.awayName,homeName:game.homeName,week:game.week,postseason:game.postseason,
        season,colors:game.colors,player:player.name,playerId:player.id,position:player.position,photo:player.photo,team:player.team,
        metric:pick.metric,label:kind==='touchdown'?'Anytime Touchdown':pick.market.label,line:pick.line,side:pick.side,
        price:Number.isFinite(price)?price:null,priceUpdated:quote.updated||null,breakEven:Number.isFinite(price)?(price<0?Math.abs(price)/(100+Math.abs(price)):100/(100+price)):null,
        lineSource:quote.isBookLine?'sportsbook':'average',isAverageLine:!quote.isBookLine,
        rank:index+1,score:pick.score,rankScore:pick.rankScore,modelHitRate:pick.chance,projection:pick.projection,
        hits:pick.hits,total:pick.history.length,average:pick.average,values:pick.values,defenseRank:pick.defense?.rank||null,rankCount:32,
        role:roleDetail,usageKey:pick.usageKey,usageShare:pick.share,usageTrend:pick.usageTrend,
        scoring:pick.scoring||null,chances,weather:pick.weather||null,injuries:pick.injury.notes,
        favoriteReason:{label:pick.favoriteReason.label,detail:pick.favoriteReason.detail},context:pick.favoriteReason.detail,
        look:{recentHits:pick.recentHits,recent:pick.recent,matchup:pick.matchup,matchupTone:pick.matchupTone,
          defense:pick.defense,volumeSignal:pick.volumeSignal,fairSide:pick.fairSide,quote:pick.quote},
        snapshotVersion:2,model:'2026.11.v2',saved
      });
    });
  }
}else{
  const used=new Map();
  const slateKey=p=>(sport==='cfb'?p.season+'-'+(p.postseason?'P':'')+p.week:p.date)+'|'+(p.kind || 'props');
  for(const p of archive){const k=slateKey(p);if(!used.has(k))used.set(k,new Set());used.get(k).add(p.playerId)}
  for(const p of candidates.sort((a,b)=>b.score-a.score||a.player.localeCompare(b.player))){
    const key=slateKey(p);
    if(!used.has(key))used.set(key,new Set());
    const slate=used.get(key);
    const limit=nflGamesPerDate.get(p.date)===1 ? 2 : 9;
    if(slate.size>=limit||slate.has(p.playerId))continue;
    slate.add(p.playerId);p.rank=slate.size;archive.push(p);
  }
}
fs.writeFileSync(root+path,JSON.stringify(archive)+'\n');
