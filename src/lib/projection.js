export function projection(game, away, home, college=false) {
  const minimum = college ? 1 : 3;
  if (!(away?.games >= minimum && home?.games >= minimum)) return null;
  const venue = game.neutral ? 0 : college ? 1.5 : 0.75;
  function side(team, rating, opponent, court) {
    const injuries = (game.injuries?.[team] || []).reduce((sum, p) => sum + (p.deduction || 0), 0);
    const defense = opponent.defense - rating.baseline;
    const score = Number((rating.offense + defense + court - injuries).toFixed(1));
    return {team, rating, defense, court, injuries, score};
  }
  const a = side(game.away, away, home, -venue), h = side(game.home, home, away, venue);
  const margin = Number((h.score - a.score).toFixed(1));
  return {a, h, margin, winner:margin > 0 ? h : margin < 0 ? a : null};
}

// Fit scoring and points allowed jointly. Four average games shrink small samples.
export function collegeRatings(schedule, cutoff) {
  const teams = new Map();
  function record(id, opponent, points, allowed, home) {
    if (!teams.has(id)) teams.set(id,{games:[],attack:0,defend:0});
    teams.get(id).games.push({opponent,points,allowed,home});
  }
  let total=0, count=0;
  for (const g of schedule || []) {
    if (!g.final || !(Date.parse(g.kickoff)<cutoff) || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) continue;
    const venue=g.neutral?0:1.5;
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
    baseline,offense:baseline+t.attack,defense:baseline+t.defend,games:t.games.length,
    wins:t.games.filter(g=>g.points>g.allowed).map(g=>g.opponent),
    scheduleStrength:t.games.reduce((n,g)=>n+teams.get(g.opponent).attack-teams.get(g.opponent).defend,0)/t.games.length
  }]));
}
