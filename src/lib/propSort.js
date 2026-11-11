export const propSortOptions = {
  player: 'Player A–Z',
  market: 'Market A–Z',
  above: 'Most above line (%)',
  below: 'Most below line (%)',
  high: 'Projection: high to low',
  low: 'Projection: low to high',
  td: 'Anytime TD chance'
};

function sortValue(row, order) {
  if (!Number.isFinite(row.estimated)) return null;
  if (order === 'td') return row.line?.anytime ? row.estimated : null;
  if (order === 'above' || order === 'below') {
    const line = row.line?.point ?? row.averageLine;
    if (row.line?.anytime || !Number.isFinite(line) || line <= 0) return null;
    return (row.estimated - line) / line;
  }
  return row.estimated;
}

export function sortPropRows(rows, order) {
  return [...rows].sort((a, b) => {
    const byName = a.p.name.localeCompare(b.p.name);
    const byMarket = a.label.localeCompare(b.label);
    if (order === 'player') return byName || byMarket;
    if (order === 'market') return byMarket || byName;
    const first = sortValue(a, order), second = sortValue(b, order);
    if (first == null || second == null) {
      return Number(first == null) - Number(second == null) || byName || byMarket;
    }
    // Keep yards, counts, and probabilities in separate groups.
    if ((order === 'high' || order === 'low') && byMarket) return byMarket;
    const ascending = order === 'below' || order === 'low';
    return (ascending ? first - second : second - first) || byName || byMarket;
  });
}
