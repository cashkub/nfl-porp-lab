function playerKey(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, '').trim().replace(/ (jr|sr|ii|iii|iv)$/, '').replace(/ /g, '');
}

export function bookLine(games, upcoming, name, metric) {
  if (!upcoming || !name) return null;
  const game = games.find(g => g.away === upcoming.away && g.home === upcoming.home &&
    Math.abs(Date.parse(g.kickoff) - Date.parse(upcoming.kickoff)) < 12 * 3600000);
  const matches = game?.lines.filter(l => l.metric === metric && playerKey(l.player) === playerKey(name));
  return matches?.length === 1 ? matches[0] : null;
}
