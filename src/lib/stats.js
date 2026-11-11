import {probabilitiesFromResiduals} from './nflForecast.js';

export const METRICS = {
  passingYards: { label: 'Passing Yards', short: 'PASS YDS', unit: 'yds', defaultLine: 224.5, maximum: 600 },
  rushingAttempts: { label: 'Rushing Attempts', short: 'RUSH ATT', unit: 'att', defaultLine: 14.5, maximum: 60 },
  rushingYards: { label: 'Rushing Yards', short: 'RUSH YDS', unit: 'yds', defaultLine: 69.5, maximum: 350 },
  receivingYards: { label: 'Receiving Yards', short: 'REC YDS', unit: 'yds', defaultLine: 69.5, maximum: 350 },
  receptions: { label: 'Receptions', short: 'RECEPTIONS', unit: 'rec', defaultLine: 4.5, maximum: 20 },
  scoredTDs: {label:'Touchdowns', short:'TD', unit:'TD', defaultLine:0.5, maximum:10},
  passingTDs: {label:'Passing Touchdowns', short:'PASS TD', unit:'TD', defaultLine:1.5, maximum:10},
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

// Line-specific probability estimate for chart and prop-list views. It combines
// a small-sample-smoothed historical rate with a season/recent projection.
// Context signals are optional and included only when the caller has a matching source.
export function estimateModelHitRate(games,key,line,direction='over',{marketProbability=null,weatherSignal=0,redZoneSignal=0,injurySignal=0,injuryPenalty=0,position=null,projection:sharedProjection=null,distributionModels=null,forceExploratory=false}={}){
  const sample=(games||[]).map(game=>Number(game.stats?.[key]??0)).filter(Number.isFinite);
  if(!sample.length||line==null||!Number.isFinite(Number(line)))return {rate:null,sample:sample.length,hits:0,pushes:0,observed:null,projection:null,marketProbability:null};
  const profile=position&&distributionModels?.markets?.[position+':'+key+':opportunity'];
  const forecastMean=sharedProjection!=null&&Number.isFinite(Number(sharedProjection))?Number(sharedProjection):null;
  const calibrated=!forceExploratory&&profile?.validation?.calibrated===true&&forecastMean!=null?probabilitiesFromResiduals({
    projection:forecastMean,line,residuals:profile.residuals,residualHistogram:profile.residualHistogram,
    minimumSamples:Math.max(100,Number(distributionModels.minimumSamples)||0)
  }):null;
  if(calibrated){
    const hits=sample.filter(value=>isHit(value,Number(line),direction)).length;
    const pushes=sample.filter(value=>value===Number(line)).length;
    const benchmarkLine=Math.floor(forecastMean)+.5;
    const lineValidated=profile.validation.calibrated&&Math.abs(Number(line)-benchmarkLine)<1e-8;
    return {rate:calibrated[direction],sample:sample.length,hits,pushes,observed:(sample.length-pushes)?hits/(sample.length-pushes):null,
      projection:forecastMean,marketProbability:Number.isFinite(marketProbability)?marketProbability:null,
      overRate:calibrated.over,underRate:calibrated.under,pushRate:calibrated.push,distributionSample:calibrated.sample,
      calibrated:lineValidated,probabilitySource:lineValidated?calibrated.method:'empirical-residual alternate-line estimate',
      modelVersion:distributionModels.modelVersion,validation:profile.validation};
  }
  const pushes=sample.filter(value=>value===Number(line)).length;
  const decided=sample.length-pushes;
  const hits=sample.filter(value=>isHit(value,Number(line),direction)).length;
  const observed=decided?hits/decided:null;
  const posterior=(hits+2)/(sample.length+4);
  const recent=sample.slice(-5),average=sample.reduce((sum,value)=>sum+value,0)/sample.length;
  const recentAverage=recent.reduce((sum,value)=>sum+value,0)/recent.length;
  const projection=forecastMean??(average*.55+recentAverage*.45);
  const variance=sample.reduce((sum,value)=>sum+(value-average)**2,0)/Math.max(1,sample.length-1);
  const sd=Math.sqrt(variance);
  const signedDistance=sd?(direction==='over'?projection-Number(line):Number(line)-projection)/sd:0;
  const projectionChance=Math.min(.88,Math.max(.12,.5+signedDistance*.18));
  const market=Number.isFinite(marketProbability)?Math.min(.98,Math.max(.02,marketProbability)):.5;
  const rate=Math.min(.95,Math.max(.05,.61*posterior+.20*projectionChance+.15*market+
    .035*(Number(weatherSignal)||0)+.035*(Number(redZoneSignal)||0)+.025*(Number(injurySignal)||0)-(Number(injuryPenalty)||0)));
  return {rate,sample:sample.length,decided,hits,pushes,observed,posterior,projection:forecastMean??projection,projectionChance,marketProbability:Number.isFinite(marketProbability)?marketProbability:null,
    calibrated:false,probabilitySource:'legacy-heuristic'};
}

export const filteredWindow = (games, selected) => selected === 'season' ? games : games.slice(-Number(selected));

export const getDistinctOpponents = (player, season) => [...new Set(
  getPlayerGames(player, season).map(g => g.opponent).filter(Boolean)
)].sort();

export const formatRate = (n) => n == null ? '—' : `${Math.round(n * 100)}%`;
export const formatNumber = (n, digits = 1) => n == null ? '—' : Number(n).toFixed(digits);
