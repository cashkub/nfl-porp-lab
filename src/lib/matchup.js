// Each defense-game contributes once, including games with zero production
// from the selected position. Use the player's listed position in the feed.
export function defenseTable(players, season, position, metric) {
  const defenses = new Map();
  for (const player of players) {
    for (const game of player.games || []) {
      if (game.season !== season || !game.opponent || !game.gameId) continue;
      const team = game.opponent;
      if (!defenses.has(team)) defenses.set(team, { team, games: new Set(), total: 0 });
      const row = defenses.get(team);
      row.games.add(game.gameId);
      if (player.position === position) row.total += game.stats?.[metric] ?? 0;
    }
  }
  const rows = Array.from(defenses.values(), row => ({
    team: row.team, games: row.games.size, total: row.total, average: row.total / row.games.size
  })).sort((a, b) => b.average - a.average || a.team.localeCompare(b.team));
  let rank = 0;
  rows.forEach((row, i) => {
    if (i === 0 || row.average !== rows[i - 1].average) rank = i + 1;
    row.rank = rank;
  });
  return rows;
}
