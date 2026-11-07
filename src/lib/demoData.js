// Intentionally fictional players and statistics. NEVER use as betting advice.
const makeGames = (values, team, metric, opponents, season = 2026) => values.map((value, index) => ({
  season, week: index + 1, seasonType: 'REG',
  gameId: `DEMO_${index+1}_${index % 2 ? team : opponents[index]}_${index % 2 ? opponents[index] : team}`,
  team, opponent: opponents[index], venue: index % 2 ? 'A' : 'H',
  stats: {
    passingYards: metric === 'passingYards' ? value : 0,
    rushingYards: metric === 'rushingYards' ? value : 0,
    receivingYards: metric === 'receivingYards' ? value : 0,
    receptions: metric === 'receivingYards' ? [5,6,3,9,7,4,8,6,9,5,10,7][index] : 0
  }
}));

const opponents = ['BAL','CLE','PIT','JAX','NYJ','MIA','CHI','GB','HOU','TEN','BUF','KC'];
export const demoData = {
  schemaVersion: 1, status: 'demo', seasons: [2026], updatedAt: null,
  players: [
    { id:'demo-receiver', name:'Sample Receiver', position:'WR', team:'CIN', seasons:[2026], games:makeGames([84,62,112,47,92,31,125,75,107,54,130,88],'CIN','receivingYards',opponents) },
    { id:'demo-quarterback', name:'Sample Quarterback', position:'QB', team:'BUF', seasons:[2026], games:makeGames([252,317,192,280,305,230,345,218,277,294,179,321],'BUF','passingYards',opponents) },
    { id:'demo-runner', name:'Sample Running Back', position:'RB', team:'PHI', seasons:[2026], games:makeGames([81,53,118,72,44,96,87,63,135,51,78,102],'PHI','rushingYards',opponents) }
  ]
};
