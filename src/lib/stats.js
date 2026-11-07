export const METRICS = {
  passingYards: { label: 'Passing yards', short: 'PASS YDS', unit: 'yds', defaultLine: 224.5, maximum: 600 },
  rushingYards: { label: 'Rushing yards', short: 'RUSH YDS', unit: 'yds', defaultLine: 69.5, maximum: 350 },
  receivingYards: { label: 'Receiving yards', short: 'REC YDS', unit: 'yds', defaultLine: 69.5, maximum: 350 },
  receptions: { label: 'Receptions', short: 'RECEPTIONS', unit: 'rec', defaultLine: 4.5, maximum: 20 }
};

export const preferredMetric = (position) => position === 'QB' ? 'passingYards' :
  (position === 'RB' || position === 'FB') ? 'rushingYards' : 'receivingYards';

export const getPlayerGames = (player, season, opponent = 'ALL', venue = 'ALL') => {
  if (!player) return [];
  return (player.games || []).filter(g =>
    (season === 'ALL' || g.season === Number(season)) &&
    (opponent === 'ALL' || g.opponent === opponent) &&
    (venue === 'ALL' || g.venue === venue)
  ).sort((a, b) => a.season - b.season || a.week - b.week || String(a.gameId).localeCompare(String(b.gameId)));
};

// A strict over/under is important: over 50 does NOT win on exactly 50.
export const isHit = (value, line, direction = 'over') => {
  const v = Number(value);
  const l = Number(line);
  if (!Number.isFinite(v) || !Number.isFinite(l)) return false;
  return direction === 'under' ? v < l : v > l;
};

export const summarize = (games, key, line, direction = 'over') => {
  const values = games.map(g => Number(g.stats?.[key] ?? 0));
  const hits = values.filter(v => isHit(v, line, direction)).length;
  const n = values.length;
  const total = values.reduce((sum, v) => sum + v, 0);
  const ordered = [...values].sort((a, b) => a - b);
  const median = n ? n % 2 ? ordered[(n - 1) / 2] : (ordered[n / 2 - 1] + ordered[n / 2]) / 2 : 0;
  let streak = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (!isHit(values[i], line, direction)) break;
    streak++;
  }
  return { hits, total: n, rate: n ? hits / n : null,
    average: n ? total / n : null, median: n ? median : null,
    min: n ? Math.min(...values) : null, max: n ? Math.max(...values) : null,
    streak };
};

export const filteredWindow = (games, selected) => selected === 'season' ? games : games.slice(-Number(selected));

export const getDistinctOpponents = (player, season) => [...new Set(
  getPlayerGames(player, season).map(g => g.opponent).filter(Boolean)
)].sort();

export const formatRate = (n) => n == null ? '—' : `${Math.round(n * 100)}%`;
export const formatNumber = (n, digits = 1) => n == null ? '—' : Number(n).toFixed(digits);
