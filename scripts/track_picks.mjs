// Grade saved NFL picks and publish the current pregame slate.
import fs from 'node:fs';
import {buildTopLooks,dayKey as nflDayKey} from '../src/lib/topLooksModel.js';

const root='public/data/';
if(process.argv[2] && process.argv[2]!=='nfl')throw Error('Only NFL tracking is available');
const read=p=>JSON.parse(fs.readFileSync(root+p));
const path='nfl-picks.json',archive=fs.existsSync(root+path)?read(path):[];
const now=Date.now(),saved=new Date(now).toISOString();
const upcoming=g=>!g.final && g.timeKnown!==false && Date.parse(g.kickoff)>now && Date.parse(g.kickoff)-now<36*3600000;
const data=read('stats.json'),season=Math.max(...data.seasons),books=read('lines.json').games;
const nflGamesPerDate=new Map();
for(const game of data.schedule||[]){
  const date=game.date||nflDayKey(game.kickoff);
  nflGamesPerDate.set(date,game.slateGames??(nflGamesPerDate.get(date)||0)+1);
}
function settle(row,value,completed){
  if(!completed)return;
  if(!Number.isFinite(value)){if(row.actual==null)row.result='No Stat';return}
  row.actual=value;
  row.result=value===row.line?'Push':(row.side==='over'?value>row.line:value<row.line)?'Hit':'Miss';
}
const logs=new Map(),played=new Set();
for(const p of data.players)for(const game of p.games){
  logs.set(game.gameId+'|'+p.id,game);
  played.add(game.gameId);
}
const photos=new Map(data.players.filter(p=>p.photo).map(p=>[p.id,p.photo]));
for(const r of archive)if(!r.photo && photos.has(r.playerId))r.photo=photos.get(r.playerId);
for(const r of archive)settle(r,logs.get(r.gameId+'|'+r.playerId)?.stats[r.metric],played.has(r.gameId));
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
      locksAt:new Date(Math.min(...games.map(g=>Date.parse(g.kickoff)))).toISOString(),
      snapshotVersion:2,model:'2026.11.v2',saved
    });
  });
}
fs.writeFileSync(root+path,JSON.stringify(archive)+'\n');
