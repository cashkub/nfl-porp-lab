import {buildOpportunityEfficiencyPriors,estimateOpportunityProjection,getUsageMetric} from './playerProjection.js';

export const NFL_PLAYER_MODEL_VERSION='opportunity-efficiency-v1';
export const MIN_CALIBRATION_RESIDUALS=100;

function beforeMatchup(game,matchup){
  return Number(game.season)<Number(matchup.season)||
    (Number(game.season)===Number(matchup.season)&&Number(game.week)<Number(matchup.week));
}

function lowerBound(values,target){
  let low=0,high=values.length;
  while(low<high){const middle=(low+high)>>1;if(values[middle]<target)low=middle+1;else high=middle;}
  return low;
}

function upperBound(values,target){
  let low=0,high=values.length;
  while(low<high){const middle=(low+high)>>1;if(values[middle]<=target)low=middle+1;else high=middle;}
  return low;
}

/**
 * Apply a chronological forecast-error distribution to any selected line.
 * Residuals are actual minus forecast, generated only from earlier completed
 * games. Whole-number lines retain an explicit push probability.
 */
export function probabilitiesFromResiduals({projection,line,residuals,residualHistogram,minimumSamples=MIN_CALIBRATION_RESIDUALS}){
  const mean=Number(projection),threshold=Number(line);
  if(!Number.isFinite(mean)||!Number.isFinite(threshold))return null;
  if(Array.isArray(residualHistogram)){
    const bins=residualHistogram.map(([value,count])=>[Number(value),Number(count)])
      .filter(([value,count])=>Number.isFinite(value)&&Number.isFinite(count)&&count>0).sort((a,b)=>a[0]-b[0]);
    const total=bins.reduce((sum,[,count])=>sum+count,0);
    if(total<minimumSamples)return null;
    const cutoff=threshold-mean;
    let below=0,pushes=0;
    for(const [value,count] of bins){if(value<cutoff)below+=count;else if(value===cutoff)pushes+=count;}
    const overs=total-below-pushes,unders=below,decided=overs+unders,push=pushes/total;
    if(!decided)return {over:0,under:0,push:1,sample:total,method:'empirical-chronological-residuals'};
    const conditionalOver=(overs+1)/(decided+2);
    return {over:(1-push)*conditionalOver,under:(1-push)*(1-conditionalOver),push,
      sample:total,method:'empirical-chronological-residuals'};
  }
  if(!Array.isArray(residuals)||residuals.length<minimumSamples)return null;
  const errors=residuals.length>1&&residuals.every((value,index)=>index===0||Number(residuals[index-1])<=Number(value))
    ?residuals.map(Number):residuals.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(errors.length<minimumSamples||errors.some(value=>!Number.isFinite(value)))return null;
  const cutoff=threshold-mean;
  const below=lowerBound(errors,cutoff),atOrBelow=upperBound(errors,cutoff);
  const pushes=atOrBelow-below,overs=errors.length-atOrBelow,unders=below;
  const push=pushes/errors.length;
  const decided=overs+unders;
  if(!decided)return {over:0,under:0,push:1,sample:errors.length,method:'empirical-chronological-residuals'};
  // Laplace smoothing is applied to the conditional two-way result. A push
  // stays a push and is not silently graded as either direction.
  const conditionalOver=(overs+1)/(decided+2);
  return {over:(1-push)*conditionalOver,under:(1-push)*(1-conditionalOver),push,
    sample:errors.length,method:'empirical-chronological-residuals'};
}

/** Build one canonical pregame forecast record for every NFL player market. */
export function buildPlayerForecast({players,player,game,market,line=null,side=null,distributions={},minimumSamples=MIN_CALIBRATION_RESIDUALS}){
  if(!player||!game||!market||!Number.isFinite(Number(game.season))||!Number.isFinite(Number(game.week)))return null;
  const history=(player.games||[]).filter(row=>beforeMatchup(row,game))
    .sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week)||String(a.gameId).localeCompare(String(b.gameId)));
  const usageKey=getUsageMetric(player.position,market);
  const matchup={season:Number(game.season),week:Number(game.week)};
  const priors=buildOpportunityEfficiencyPriors(players,matchup);
  const point=estimateOpportunityProjection({history,position:player.position,market,season:game.season,
    priorEfficiency:priors[player.position+':'+market]??null});
  if(!point)return null;
  const key=player.position+':'+market+':opportunity';
  const profile=distributions?.markets?.[key];
  const residualQuantiles=profile?.residualQuantiles;
  const median=residualQuantiles?.p50!=null&&Number.isFinite(Number(residualQuantiles.p50))?point.projection+Number(residualQuantiles.p50):point.projection;
  const interval=residualQuantiles?.p10!=null&&residualQuantiles?.p90!=null&&Number.isFinite(Number(residualQuantiles.p10))&&Number.isFinite(Number(residualQuantiles.p90))
    ?{p10:point.projection+Number(residualQuantiles.p10),p90:point.projection+Number(residualQuantiles.p90),level:.8,kind:'historical out-of-sample residual range'}:null;
  const lineValue=line==null?null:Number(line);
  const distribution=lineValue==null||profile?.validation?.calibrated!==true?null:probabilitiesFromResiduals({projection:point.projection,line:lineValue,
    residuals:profile?.residuals,residualHistogram:profile?.residualHistogram,minimumSamples:Math.max(minimumSamples,Number(distributions?.minimumSamples)||0)});
  const probabilityLineValidated=Boolean(distribution&&profile?.validation?.calibrated&&
    Math.abs(lineValue-(Math.floor(point.projection)+.5))<1e-8);
  const forecastId=[game.id||game.gameId||`${game.season}-${game.week}-${game.away}-${game.home}`,player.id,market,NFL_PLAYER_MODEL_VERSION].join(':');
  return {forecastId,gameId:game.id||game.gameId||null,playerId:player.id,team:player.team||null,
    opponent:player.team===game.home?game.away:player.team===game.away?game.home:null,
    market,position:player.position,projection:point.projection,median,projectedUsage:point.projectedUsage,
    usageKey:point.usageKey,sampleGames:history.length,modelVersion:NFL_PLAYER_MODEL_VERSION,
    predictionTimestamp:game.predictionTimestamp||null,dataFreshness:distributions?.trainedThrough||null,
    uncertainty:{residualSample:profile?.sampleSize||profile?.residuals?.length||0,
      interval,calibrated:probabilityLineValidated,probabilityLineValidated},
    probabilities:distribution,line:lineValue!=null&&Number.isFinite(lineValue)?lineValue:null,
    selectedSide:side||null,selectedProbability:distribution&&side?distribution[side]:null,
    probabilitySource:distribution?(probabilityLineValidated?distribution.method:'empirical-residual alternate-line estimate'):'unavailable',distributionKey:key};
}
