import React, {useMemo} from 'react';

const metrics = [
  ['attempts', 'Pass Attempt Share'],
  ['carries', 'Rush Attempt Share'],
  ['targets', 'Target Share'],
  ['touches', 'Total Touch Share'],
];

function counts(game) {
  const {targets, carries, attempts} = game.usage ?? {};
  const receptions = game.stats?.receptions;
  const touches = Number.isFinite(carries) && Number.isFinite(receptions) ? carries + receptions : undefined;
  return {targets, carries, attempts, touches};
}

export default function WorkloadUsage({players, games, position}) {
  const teamTotals = useMemo(() => {
    const totals = new Map();
    for (const player of players) {
      for (const game of player.games) {
        const key = game.gameId + '/' + game.team;
        const team = totals.get(key) ?? {};
        for (const [stat, value] of Object.entries(counts(game))) {
          if (Number.isFinite(value)) team[stat] = (team[stat] ?? 0) + value;
        }
        totals.set(key, team);
      }
    }
    return totals;
  }, [players]);

  const covered = games.filter(g => g.scoringChances?.length >= 5);
  return <div className="workload-usage">
    <h3>Team Usage Share</h3>
    <p>Player / Team Totals Across The Selected Games</p>
    <dl>{metrics.filter(([stat]) => stat !== 'attempts' || position === 'QB' || games.some(g => g.usage?.attempts > 0)).map(([stat, label]) => {
      let player = 0, team = 0;
      for (const game of games) {
        const value = counts(game)[stat];
        const total = teamTotals.get(game.gameId + '/' + game.team)?.[stat];
        if (Number.isFinite(value) && Number.isFinite(total)) {
          player += value;
          team += total;
        }
      }
      return <div key={stat}><dt>{label}</dt><dd>{team > 0 ? <><small>{player} / {team}</small> {(100 * player / team).toFixed(1)}%</> : '—'}</dd></div>;
    })}</dl>
    <h3>Scoring-Area Touches</h3>
    <p>Carries + Receptions From The Opponent’s 20 Or Closer And 5 Or Closer · {covered.length} Of {games.length} Games With Play Data</p>
    <dl>{[[3,'Inside The 20'],[4,'Inside The 5']].map(([index,label]) =>
      <div key={index}><dt>{label}</dt><dd>{covered.length ? covered.reduce((sum,g) => sum + g.scoringChances[index], 0) : '—'}</dd></div>
    )}</dl>
  </div>;
}
