export function overallScore({overall,blend,stats}) {
  return [overall,blend,stats].find(pair => Array.isArray(pair) && pair.length===2 && pair.every(Number.isFinite));
}

export function projection(game, away, home, college=false) {
  const minimum = college ? 1 : 3;
  if (!(away?.games >= minimum && home?.games >= minimum)) return null;
  const venue = game.neutral ? 0 : college ? (away.homeEdge ?? 1.5) : 0.75;
  function side(team, rating, opponent, court) {
    const profile=college?null:game.context?.[team===game.home?'home':'away'];
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
  if(!college && a.profile && h.profile && Number.isFinite(game.homeSpread) && Number.isFinite(ctx.total) && Number.isFinite(ctx.marketWeight) && ctx.marketWeight>=0 && ctx.marketWeight<=1){
    const weight=ctx.marketWeight;
    const predicted=(s,spread)=>Number(((1-weight)*s.score+weight*(ctx.total+spread)/2).toFixed(1));
    blend={away:predicted(a,game.homeSpread),home:predicted(h,-game.homeSpread),weight};
  }
  const overall=overallScore({stats:[a.score,h.score],blend:blend && [blend.away,blend.home]});
  return {a, h, margin, blend, overall, winner:margin > 0 ? h : margin < 0 ? a : null};
}

// Fit scoring and points allowed jointly. Four average games shrink small samples.
export function collegeRatings(schedule, cutoff, fitVenue=false) {
  const teams = new Map();
  function record(id, opponent, points, allowed, home) {
    if (!teams.has(id)) teams.set(id,{games:[],attack:0,defend:0});
    teams.get(id).games.push({opponent,points,allowed,home});
  }
  const finals=(schedule || []).filter(g=>g.final && Date.parse(g.kickoff)<cutoff && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore));
  const homeGames=fitVenue?finals.filter(g=>!g.neutral):[];
  const homeEdge=fitVenue?homeGames.reduce((sum,g)=>sum+g.homeScore-g.awayScore,0)/(2*(homeGames.length+20)):1.5;
  let total=0, count=0;
  for (const g of finals) {
    const venue=g.neutral?0:homeEdge;
    record(g.home,g.away,g.homeScore,g.awayScore,venue);
    record(g.away,g.home,g.awayScore,g.homeScore,-venue);
    total+=g.homeScore+g.awayScore; count+=2;
  }
  if (!count) return {};
  const baseline=total/count;
  for(let i=0;i<30;i++){
    for(const team of teams.values()){
      let attack=0,defend=0;
      for(const g of team.games){
        const opp=teams.get(g.opponent);
        attack+=g.points-baseline-g.home-opp.defend;
        defend+=g.allowed-baseline+g.home-opp.attack;
      }
      team.nextAttack=attack/(team.games.length+4);
      team.nextDefend=defend/(team.games.length+4);
    }
    for(const team of teams.values()){team.attack=team.nextAttack;team.defend=team.nextDefend;}
  }
  return Object.fromEntries(Array.from(teams,([id,t])=>[id,{
    baseline,homeEdge,offense:baseline+t.attack,defense:baseline+t.defend,games:t.games.length,
    wins:t.games.filter(g=>g.points>g.allowed).map(g=>g.opponent),
    scheduleStrength:t.games.reduce((n,g)=>n+teams.get(g.opponent).attack-teams.get(g.opponent).defend,0)/t.games.length
  }]));
}
