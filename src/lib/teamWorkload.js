export function teamWorkload(players,team,game){
  const byGame=new Map();
  const pregame=row=>Number(row.season)<Number(game.season)||(Number(row.season)===Number(game.season)&&Number(row.week)<Number(game.week));
  for(const player of players||[])for(const row of player.games||[]){
    if(row.team!==team||!pregame(row)||!['QB','RB','FB','WR','TE'].includes(player.position))continue;
    const key=row.gameId||`${row.season}:${row.week}`;
    if(!key)continue;
    let bucket=byGame.get(key);
    if(!bucket)byGame.set(key,bucket={season:Number(row.season),week:Number(row.week),passAttempts:0,passYards:0,carries:0,targets:0,rushLeaders:new Map(),targetLeaders:new Map()});
    if(player.position==='QB'){
      const attempts=Number(row.usage?.attempts)||0;
      bucket.passAttempts+=attempts;
      bucket.passYards+=Number(row.stats?.passingYards)||0;
    }
    const carries=Number(row.usage?.carries)||0,targets=Number(row.usage?.targets)||0;
    bucket.carries+=carries;bucket.targets+=targets;
    if(carries)bucket.rushLeaders.set(player.name,(bucket.rushLeaders.get(player.name)||0)+carries);
    if(targets)bucket.targetLeaders.set(player.name,(bucket.targetLeaders.get(player.name)||0)+targets);
  }
  let games=[...byGame.values()].sort((a,b)=>a.season-b.season||a.week-b.week);
  const thisSeason=games.filter(row=>row.season===Number(game.season));
  if(thisSeason.length)games=thisSeason;
  const recent=games.slice(-5);
  if(!recent.length)return null;
  const avg=key=>recent.reduce((sum,row)=>sum+row[key],0)/recent.length;
  const passingAttempts=recent.reduce((sum,row)=>sum+row.passAttempts,0),passingYards=recent.reduce((sum,row)=>sum+row.passYards,0);
  const rushTotals=new Map(),targetTotals=new Map();
  for(const row of recent){for(const [name,count] of row.rushLeaders)rushTotals.set(name,(rushTotals.get(name)||0)+count);for(const [name,count] of row.targetLeaders)targetTotals.set(name,(targetTotals.get(name)||0)+count)}
  const leader=map=>[...map].sort((a,b)=>b[1]-a[1])[0];
  return {games:recent.length,source:thisSeason.length?'SELECTED SEASON':'CAREER FALLBACK',passAttempts:avg('passAttempts'),carries:avg('carries'),targets:avg('targets'),yardsPerAttempt:passingAttempts?passingYards/passingAttempts:null,rushLeader:leader(rushTotals),targetLeader:leader(targetTotals)};
}
