export function highImpactInjuries(game,profiles={}){
  const primaryQbs=new Map([[game.away,game.context?.away?.qbId],[game.home,game.context?.home?.qbId]]);
  const teamLeaders=new Map([[game.away,new Set([profiles.away?.rushLeader?.[0],profiles.away?.targetLeader?.[0]].filter(Boolean).map(name=>name.toLowerCase()))],[game.home,new Set([profiles.home?.rushLeader?.[0],profiles.home?.targetLeader?.[0]].filter(Boolean).map(name=>name.toLowerCase()))]]);
  const relevantStatuses=new Set(['OUT','DOUBTFUL','QUESTIONABLE','INJURED RESERVE','IR','PUP','PHYSICALLY UNABLE TO PERFORM','DID NOT PARTICIPATE IN PRACTICE','LIMITED PARTICIPATION IN PRACTICE']);
  return [game.away,game.home].flatMap(team=>(game.injuries?.[team]||[]).filter(player=>{
    const status=String(player.gameStatus||player.status||'').toUpperCase();
    if(!relevantStatuses.has(status))return false;
    const position=String(player.position||'').toUpperCase();
    if(position==='QB')return Boolean(player.wasListedStarter||primaryQbs.get(team)&&player.id===primaryQbs.get(team));
    if(Math.max(player.offenseSnapShare||0,player.defenseSnapShare||0)>=.5)return true;
    if(['RB','WR','TE','FB'].includes(position))return teamLeaders.get(team)?.has(String(player.name||'').toLowerCase())||false;
    return false;
  }).map(player=>({...player,team})));
}
