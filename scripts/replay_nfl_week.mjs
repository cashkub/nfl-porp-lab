import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {buildTopLooks,dayLabel} from '../src/lib/topLooksModel.js';

const WEEK=9;
const SNAPSHOTS=[
  {date:'2026-11-08',ref:'df08b078c6dfbc977648efdd82a649102a718172',capturedAt:'2026-11-08T11:57:54Z'},
  {date:'2026-11-09',ref:'b316bd6ba6c6aa8611306b9f26c2e3684015fc3f',capturedAt:'2026-11-09T22:05:38Z'}
];
const REPLAY_NOTICE='Historical simulation generated after these games were played. Picks are recalculated with the V2 model using only archived data available before each listed kickoff. These were not live picks and are excluded from the official Model Record.';

function readAt(ref,path){
  return JSON.parse(execFileSync('git',['show',`${ref}:${path}`],{encoding:'utf8',maxBuffer:64*1024*1024}));
}

const days=[];
const settleStats=readAt('HEAD','public/data/stats.json');
const finalGameIds=new Set((settleStats.schedule||[]).filter(game=>game.final).map(game=>game.id));
function settlePick(pick){
  const player=settleStats.players.find(row=>String(row.id)===String(pick.player.id));
  const game=player?.games?.find(row=>row.gameId===pick.game.id)||player?.games?.find(row=>Number(row.week)===WEEK&&(row.team||player.team)===pick.player.team&&row.opponent===pick.game.opponent);
  if(!game){
    const finished=finalGameIds.has(pick.game.id);
    return {actual:null,result:finished?'No Stat':'Pending'};
  }
  const value=Number(game.stats?.[pick.metric]);
  if(!Number.isFinite(value))return {actual:null,result:finalGameIds.has(pick.game.id)?'No Stat':'Pending'};
  if(pick.metric==='scoredTDs')return {actual:value,result:value>0?'Hit':'Miss'};
  if(Math.abs(value-Number(pick.line))<1e-9)return {actual:value,result:'Push'};
  return {actual:value,result:pick.side==='under'?(value<pick.line?'Hit':'Miss'):(value>pick.line?'Hit':'Miss')};
}
for(const snapshot of SNAPSHOTS){
  const stats=readAt(snapshot.ref,'public/data/stats.json');
  const lines=readAt(snapshot.ref,'public/data/lines.json');
  const kickoffCutoff=Date.parse(snapshot.capturedAt);
  const slate=(stats.schedule||[]).filter(game=>Number(game.week)===WEEK&&game.stage==='REG'&&
    game.date===snapshot.date&&Date.parse(game.kickoff)>kickoffCutoff);
  if(!slate.length)throw new Error(`No Week ${WEEK} pregame slate in ${snapshot.ref} for ${snapshot.date}`);
  if(slate.some(game=>Date.parse(game.kickoff)<=kickoffCutoff))throw new Error(`Snapshot is not pregame for ${snapshot.date}`);
  const season=Math.max(...(stats.seasons||[2026]).map(Number));
  const picks={};
  for(const type of ['props','anytime']){
    picks[type]=buildTopLooks({players:stats.players,slate,books:lines.games||[],season,type})
      .map((pick,index)=>({...pick,replayRank:index+1,replayCount:0,replayDate:snapshot.date,replaySnapshot:snapshot.ref,settlement:settlePick(pick)}));
    picks[type].forEach(pick=>{pick.replayCount=picks[type].length;});
  }
  days.push({date:snapshot.date,label:dayLabel(snapshot.date),gameCount:slate.length,asOf:snapshot.capturedAt,snapshotRef:snapshot.ref,picks});
}

const payload={schemaVersion:1,modelVersion:'2026.11.v2',week:WEEK,generatedAt:new Date().toISOString(),
  disclaimer:REPLAY_NOTICE,coverageNote:'The archive has pregame snapshots for Sunday, Nov 8 and Monday, Nov 9. The Thursday game is omitted because no verifiable pregame snapshot was retained.',days};
await writeFile('public/data/nfl-v2-replay.json',JSON.stringify(payload));
console.log(`Saved Week ${WEEK} V2 replay: ${days.map(day=>`${day.date} (${day.gameCount} games)`).join(', ')}`);
