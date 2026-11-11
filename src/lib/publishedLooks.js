// Rebuild the Top Looks card from the published record. The current roster and
// fixture supply navigation targets only. All displayed estimates are pregame.
export function publishedLook(row,players,games){
  const player=players.find(p=>p.id===row.playerId)||{id:row.playerId,name:row.player,team:row.team,photo:row.photo};
  const fixture=games.find(g=>g.id===row.gameId)||row;
  const game={...fixture,id:row.gameId,away:row.away,home:row.home,kickoff:row.kickoff,opponent:row.team===row.home?row.away:row.home};
  return {...row.look,player:{...player,team:row.team},game,metric:row.metric,line:row.line,side:row.side,
    chance:row.modelHitRate,projection:row.projection,rankScore:row.rankScore,hits:row.hits,history:row.values,
    favoriteReason:row.favoriteReason,injury:{notes:row.injuries||[]},usageKey:row.usageKey,usageTrend:row.usageTrend,
    share:row.usageShare,scoring:row.scoring,weather:row.weather,publishedRank:row.rank};
}
