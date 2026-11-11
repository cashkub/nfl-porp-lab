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

// Keep the matchup projection table focused on players with a real pregame role.
// Expected starters can be retained with a smaller player sample, but their
// underlying projection still needs enough history to be calculated.
export function hasMeaningfulProjectionRole({position,market,projectedUsage,historyGames,expectedStarter=false}){
  if(!Number.isFinite(Number(projectedUsage))||!Number.isFinite(Number(historyGames))||historyGames<2)return false;
  if(position==='QB'&&expectedStarter)return true;
  const usageKey=getUsageMetric(position,market);
  const minimum={attempts:10,carries:1.5,targets:1.5}[usageKey];
  return minimum!=null&&projectedUsage>=minimum;
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
