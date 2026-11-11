import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlayerForecast,probabilitiesFromResiduals,MIN_CALIBRATION_RESIDUALS} from '../src/lib/nflForecast.js';

const residuals=Array.from({length:20},()=>[-2,-1,0,1,2]).flat();

test('residual distribution supports any line and preserves pushes',()=>{
  const half=probabilitiesFromResiduals({projection:10,line:10.5,residuals});
  assert.equal(half.push,0);
  assert.ok(Math.abs(half.over-41/102)<1e-12);
  assert.ok(Math.abs(half.over+half.under+half.push-1)<1e-12);
  const whole=probabilitiesFromResiduals({projection:10,line:10,residuals});
  assert.equal(whole.push,.2);
  assert.ok(Math.abs(whole.over-.4)<1e-12);
  assert.ok(Math.abs(whole.under-.4)<1e-12);
});

test('distribution is withheld until the minimum chronological sample is met',()=>{
  assert.equal(MIN_CALIBRATION_RESIDUALS,100);
  assert.equal(probabilitiesFromResiduals({projection:10,line:10.5,residuals:residuals.slice(0,99)}),null);
});

test('compact residual histograms preserve the empirical probabilities',()=>{
  const direct=probabilitiesFromResiduals({projection:10,line:10.5,residuals});
  const compact=probabilitiesFromResiduals({projection:10,line:10.5,
    residualHistogram:[[-2,20],[-1,20],[0,20],[1,20],[2,20]]});
  assert.deepEqual(compact,direct);
});

test('canonical player forecast filters out games from the matchup week and carries shared identity',()=>{
  const player={id:'p1',name:'Player',team:'AAA',position:'WR',games:[
    {gameId:'old',season:2025,week:17,stats:{receivingYards:50},usage:{targets:5}},
    {gameId:'prior',season:2026,week:1,stats:{receivingYards:60},usage:{targets:6}},
    {gameId:'current',season:2026,week:2,stats:{receivingYards:999},usage:{targets:20}}
  ]};
  const game={id:'g1',season:2026,week:2,home:'AAA',away:'BBB'};
  const result=buildPlayerForecast({players:[player],player,game,market:'receivingYards',line:57.5,side:'over',
    distributions:{minimumSamples:100,trainedThrough:{season:2026,week:1},markets:{'WR:receivingYards:opportunity':{
      sampleSize:100,residuals,residualQuantiles:{p10:-2,p50:0,p90:2},validation:{calibrated:true}}}}});
  assert.equal(result.gameId,'g1');
  assert.equal(result.opponent,'BBB');
  assert.equal(result.sampleGames,2);
  assert.ok(result.projection<100);
  assert.equal(result.median,result.projection);
  assert.equal(result.uncertainty.interval.p10,result.projection-2);
  assert.equal(result.uncertainty.interval.p90,result.projection+2);
  assert.equal(result.uncertainty.calibrated,true);
  assert.equal(result.selectedProbability,result.probabilities.over);
});
