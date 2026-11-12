export function overallScore({overall,blend,stats}) {
  return [overall,blend,stats].find(pair => Array.isArray(pair) && pair.length===2 && pair.every(Number.isFinite));
}

export function projection(game, away, home) {
  const minimum = 3;
  if (!(away?.games >= minimum && home?.games >= minimum)) return null;
  const venue = game.neutral ? 0 : 0.75;
  function side(team, rating, opponent, court) {
    const profile=game.context?.[team===game.home?'home':'away'];
    const reports=game.injuries?.[team] || [];
    const out=reports.some(p=>p.id && p.id===profile?.qbId && p.gameStatus?.toLowerCase()==='out');
    const swap=out && profile?.backupKnown;
    const injuries=reports.reduce((sum,p)=>sum+(swap && p.id===profile.qbId?0:p.deduction || 0),0);
    const parts={...profile?.parts};
    if(swap)parts['QB Replacement']=profile.backupDelta;
    const advanced=Object.values(parts).reduce((sum,v)=>sum+v,0);
    const defense = opponent.defense - rating.baseline;
    const score = Number((rating.offense + defense + court - injuries + advanced).toFixed(1));
    return {team, rating, defense, court, injuries, score, profile, parts, swap};
  }
  const a = side(game.away, away, home, -venue), h = side(game.home, home, away, venue);
  const margin = Number((h.score - a.score).toFixed(1));
  let blend=null;
  const ctx=game.context;
  if(a.profile && h.profile && Number.isFinite(game.homeSpread) && Number.isFinite(ctx.total) && Number.isFinite(ctx.marketWeight) && ctx.marketWeight>=0 && ctx.marketWeight<=1){
    const weight=ctx.marketWeight;
    const predicted=(s,spread)=>Number(((1-weight)*s.score+weight*(ctx.total+spread)/2).toFixed(1));
    blend={away:predicted(a,game.homeSpread),home:predicted(h,-game.homeSpread),weight};
  }
  const overall=overallScore({stats:[a.score,h.score],blend:blend && [blend.away,blend.home]});
  return {a, h, margin, blend, overall, winner:margin > 0 ? h : margin < 0 ? a : null};
}
