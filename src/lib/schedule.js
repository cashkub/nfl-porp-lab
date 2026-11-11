const aliases = { LA:'LAR', JAC:'JAX', WSH:'WAS', OAK:'LV', SD:'LAC', STL:'LAR' };
export const teamNames = {
  ARI:'Cardinals', ATL:'Falcons', BAL:'Ravens', BUF:'Bills', CAR:'Panthers', CHI:'Bears',
  CIN:'Bengals', CLE:'Browns', DAL:'Cowboys', DEN:'Broncos', DET:'Lions', GB:'Packers',
  HOU:'Texans', IND:'Colts', JAX:'Jaguars', KC:'Chiefs', LAC:'Chargers', LAR:'Rams',
  LV:'Raiders', MIA:'Dolphins', MIN:'Vikings', NE:'Patriots', NO:'Saints', NYG:'Giants',
  NYJ:'Jets', PHI:'Eagles', PIT:'Steelers', SEA:'Seahawks', SF:'49ers', TB:'Buccaneers',
  TEN:'Titans', WAS:'Commanders'
};
export function nextGame(schedule, team, season, now) {
  const code = aliases[team] || team;
  const game = schedule.find(g => g.season === season && Date.parse(g.kickoff) > now &&
    (g.away === code || g.home === code));
  if (!game) return null;
  const opponent = game.home === code ? game.away : game.home;
  return { ...game, opponent, name:teamNames[opponent] || opponent,
    venue:game.neutral ? 'Neutral site' : game.home === code ? 'Home' : 'Away' };
}
