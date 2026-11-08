const opportunity={passingYards:'attempts',rushingYards:'carries',rushingAttempts:'carries',receivingYards:'targets',receptions:'targets',passingTDs:'attempts',scoredTDs:'opportunities'};
export function availableStats(markets,games){
  return Object.keys(markets).filter(key=>games.some(g=>
    (Number.isFinite(g.stats?.[key]) && g.stats[key]!==0) || (Number.isFinite(g.stats?.[key]) && g.usage?.[opportunity[key]]>0) ||
    (key==='points' && g.shots>0) || (key==='threes' && g.threeAttempts>0)));
}
