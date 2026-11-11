export const sortColumns={
  player:['player','playerReverse'], market:['market','marketReverse'], line:['lineHigh','lineLow'],
  model:['high','low'], gap:['above','below'], recent:['recentHigh','recentLow'],
  season:['seasonHigh','seasonLow'], role:['roleHigh','roleLow'], defense:['rankLow','rankHigh']
};
export function propGap(row){
  const line=row.line?.point??row.averageLine;
  return !row.line?.anytime && Number.isFinite(row.estimated) && Number.isFinite(line) && line>0?(row.estimated-line)/line:null;
}

function sortValue(row, order) {
  if(order.startsWith('line'))return row.line?.anytime?row.line.over:row.line?.point??row.averageLine;
  if(order.startsWith('recent'))return row.recentAvg;
  if(order.startsWith('season'))return row.seasonAvg;
  if(order.startsWith('role'))return row.usageAvg;
  if(order.startsWith('rank'))return row.defense?.rank;
  if (!Number.isFinite(row.estimated)) return null;
  if (order === 'td') return row.line?.anytime ? row.estimated : null;
  if (order === 'above' || order === 'below') {
    return propGap(row);
  }
  return row.estimated;
}

export function sortPropRows(rows, order) {
  return [...rows].sort((a, b) => {
    const byName = a.p.name.localeCompare(b.p.name);
    const byMarket = a.label.localeCompare(b.label);
    if (order.startsWith('player')) return (order==='player'?byName:-byName) || byMarket;
    if (order.startsWith('market')) return (order==='market'?byMarket:-byMarket) || byName;
    const first = sortValue(a, order), second = sortValue(b, order);
    if (first == null || second == null) {
      return Number(first == null) - Number(second == null) || byName || byMarket;
    }
    // Keep yards, counts, and probabilities in separate groups.
    if ((order === 'high' || order === 'low' || order.startsWith('line')) && byMarket) return byMarket;
    const ascending = order === 'below' || order === 'low' || order.endsWith('Low');
    return (ascending ? first - second : second - first) || byName || byMarket;
  });
}
