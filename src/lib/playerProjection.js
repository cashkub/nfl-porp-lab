const USAGE_BY_MARKET={
  QB:{passingYards:'attempts',passingTDs:'attempts',rushingYards:'carries'},
  RB:{rushingAttempts:'carries',rushingYards:'carries',receivingYards:'targets'},
  WR:{receptions:'targets',receivingYards:'targets'},
  TE:{receptions:'targets',receivingYards:'targets'}
};

export function getUsageMetric(position,market){
  return USAGE_BY_MARKET[position]?.[market]||null;
}

const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;

// Research baseline matching the walk-forward opportunity × efficiency benchmark.
// `history` must contain only games completed before the selected matchup.
export function estimateOpportunityProjection({history,position,market,season,priorEfficiency,priorOpportunities=20}){
  const usageKey=getUsageMetric(position,market);
  if(!usageKey||!history?.length)return null;
  const ordered=[...history].sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week));
  const current=ordered.filter(game=>Number(game.season)===Number(season));
  const sample=current.length?current:ordered;
  const statValues=sample.map(game=>Number(game.stats?.[market])).filter(Number.isFinite);
  const opportunities=sample.map(game=>Number(game.usage?.[usageKey])).filter(Number.isFinite);
  const recent=ordered.slice(-5).map(game=>Number(game.usage?.[usageKey])).filter(Number.isFinite);
  if(!opportunities.length)return null;
  const projectedUsage=.6*(mean(recent)??0)+.4*(mean(opportunities)??0);
  if(market==='rushingAttempts')return {projection:projectedUsage,projectedUsage,efficiency:1,usageKey,sampleGames:sample.length};
  if(!Number.isFinite(priorEfficiency)||!statValues.length)return null;
  const usageTotal=sample.reduce((sum,game)=>sum+Number(game.usage?.[usageKey]||0),0);
  const statTotal=sample.reduce((sum,game)=>sum+Number(game.stats?.[market]||0),0);
  const efficiency=(statTotal+priorEfficiency*priorOpportunities)/(usageTotal+priorOpportunities);
  return {projection:projectedUsage*efficiency,projectedUsage,efficiency,usageKey,sampleGames:sample.length};
}
