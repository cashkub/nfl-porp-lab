export function playerKey(name) {
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

export const priceText = price => Number.isFinite(price) ? (price > 0 ? '+' + price : String(price)) : '—';

export function usageFor(metric) {
  if (metric === 'scoredTDs') return {key:'opportunities', label:'Carries + Targets'};
  if (metric === 'passingYards' || metric === 'passingTDs') return {key:'attempts', label:'Pass Attempts'};
  if (metric === 'rushingYards' || metric === 'rushingAttempts') return {key:'carries', label:'Carries'};
  return {key:'targets', label:'Targets'};
}
