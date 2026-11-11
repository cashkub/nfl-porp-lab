const USAGE_BY_MARKET={
  QB:{passingYards:'attempts',passingTDs:'attempts',rushingYards:'carries',scoredTDs:'carries'},
  RB:{rushingAttempts:'carries',rushingYards:'carries',receivingYards:'targets',scoredTDs:'opportunities'},
  FB:{rushingAttempts:'carries',rushingYards:'carries',receivingYards:'targets',scoredTDs:'opportunities'},
  WR:{receptions:'targets',receivingYards:'targets',scoredTDs:'opportunities'},
  TE:{receptions:'targets',receivingYards:'targets',scoredTDs:'opportunities'}
};

export const PLAYER_PROJECTION_MARKETS={
  QB:[['passingYards','Pass Yards'],['passingTDs','Pass TDs'],['rushingYards','Rush Yards'],['scoredTDs','Anytime TD']],
  RB:[['rushingAttempts','Carries'],['rushingYards','Rush Yards'],['receivingYards','Rec Yards'],['scoredTDs','Anytime TD']],
  FB:[['rushingAttempts','Carries'],['rushingYards','Rush Yards'],['receivingYards','Rec Yards'],['scoredTDs','Anytime TD']],
  WR:[['receptions','Receptions'],['receivingYards','Rec Yards'],['scoredTDs','Anytime TD']],
  TE:[['receptions','Receptions'],['receivingYards','Rec Yards'],['scoredTDs','Anytime TD']]
};

export function getUsageMetric(position,market){
  return USAGE_BY_MARKET[position]?.[market]||null;
}

const MINIMUM_ROLE_USAGE={
  QB:{attempts:12,carries:3},
  RB:{carries:4,targets:2.5,opportunities:5},
  FB:{carries:2.5,targets:2,opportunities:3},
  WR:{targets:3,opportunities:4},
  TE:{targets:2.5,opportunities:3.5}
};

// Keep the matchup projection table focused on players with a real pregame role.
// Expected starters can be retained with a smaller player sample, but their
// underlying projection still needs enough history to be calculated.
export function hasMeaningfulProjectionRole({position,market,projectedUsage,historyGames,expectedStarter=false}){
  if(!Number.isFinite(Number(projectedUsage))||!Number.isFinite(Number(historyGames))||historyGames<3){
    return Boolean(position==='QB'&&expectedStarter&&Number.isFinite(Number(projectedUsage)));
  }
  if(position==='QB'&&expectedStarter)return true;
  const usageKey=getUsageMetric(position,market);
  const minimum=MINIMUM_ROLE_USAGE[position]?.[usageKey];
  return minimum!=null&&projectedUsage>=minimum;
}

// Current-roster lists use the same workload cutoffs as matchup projections.
// A player needs a sustained role in at least one market to appear in general
// player selectors; upcoming matchup forecasts can separately admit a QB1.
export function hasRelevantPlayerRole(player,history,{expectedStarter=false}={}){
  if(player?.position==='QB'&&expectedStarter)return true;
  if(!player||!Array.isArray(history)||history.length<3)return false;
  const window=history.slice(-5);
  return (PLAYER_PROJECTION_MARKETS[player.position]||[]).some(([market])=>{
    const usageKey=getUsageMetric(player.position,market);
    const values=window.map(game=>Number(game.usage?.[usageKey])).filter(Number.isFinite);
    if(!values.length)return false;
    const projectedUsage=values.reduce((sum,value)=>sum+value,0)/values.length;
    return hasMeaningfulProjectionRole({position:player.position,market,projectedUsage,historyGames:history.length});
  });
}

const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const efficiencyPriorCache=new WeakMap();

// Shared league efficiency prior used by both NFL Games and Top Looks. Only
// rows completed before the selected matchup may contribute to the estimate.
export function buildOpportunityEfficiencyPriors(players,matchup){
  const cacheable=players&&typeof players==='object';
  const cacheKey=Number(matchup.season)+':'+Number(matchup.week);
  if(cacheable){
    const seasonCache=efficiencyPriorCache.get(players);
    if(seasonCache?.has(cacheKey))return seasonCache.get(cacheKey);
  }
  const totals={};
  const isPregame=game=>Number(game.season)<Number(matchup.season)||
    (Number(game.season)===Number(matchup.season)&&Number(game.week)<Number(matchup.week));
  for(const player of players||[]){
    for(const [market] of PLAYER_PROJECTION_MARKETS[player.position]||[]){
      const usageKey=getUsageMetric(player.position,market);
      if(!usageKey)continue;
      for(const game of player.games||[]){
        if(!isPregame(game))continue;
        const opportunities=Number(game.usage?.[usageKey]),value=Number(game.stats?.[market]);
        if(!Number.isFinite(opportunities)||opportunities<0||!Number.isFinite(value))continue;
        const key=player.position+':'+market;
        const total=totals[key]??={stats:0,opportunities:0};
        total.stats+=value;
        total.opportunities+=opportunities;
      }
    }
  }
  const priors=Object.fromEntries(Object.entries(totals).map(([key,total])=>[
    key,total.opportunities>0?total.stats/total.opportunities:null
  ]));
  if(cacheable){
    let seasonCache=efficiencyPriorCache.get(players);
    if(!seasonCache){seasonCache=new Map();efficiencyPriorCache.set(players,seasonCache);}
    seasonCache.set(cacheKey,priors);
  }
  return priors;
}

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
