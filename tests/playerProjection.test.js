import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOpportunityEfficiencyPriors,estimateOpportunityProjection,getUsageMetric,hasMeaningfulProjectionRole} from '../src/lib/playerProjection.js';

test('opportunity projection uses the market-specific workload key',()=>{
  assert.equal(getUsageMetric('RB','receivingYards'),'targets');
  assert.equal(getUsageMetric('RB','rushingYards'),'carries');
  assert.equal(getUsageMetric('QB','passingYards'),'attempts');
  assert.equal(getUsageMetric('QB','rushingYards'),'carries');
});

test('projection blends recent and selected-season workload and shrinks efficiency',()=>{
  const history=[
    {season:2025,week:17,stats:{receivingYards:100},usage:{targets:10}},
    {season:2026,week:1,stats:{receivingYards:100},usage:{targets:10}},
    {season:2026,week:2,stats:{receivingYards:200},usage:{targets:20}}
  ];
  const result=estimateOpportunityProjection({history,position:'WR',market:'receivingYards',season:2026,priorEfficiency:7});
  assert.equal(result.sampleGames,2);
  assert.equal(result.projectedUsage,14);
  assert.equal(result.efficiency,8.8);
  assert.ok(Math.abs(result.projection-123.2)<1e-9);
});

test('rushing attempts use projected carries directly without efficiency conversion',()=>{
  const history=[1,2,3,4,5,6].map((carries,index)=>({season:2026,week:index+1,stats:{rushingAttempts:carries},usage:{carries}}));
  const result=estimateOpportunityProjection({history,position:'RB',market:'rushingAttempts',season:2026});
  assert.equal(result.projectedUsage,3.8);
  assert.equal(result.projection,3.8);
});

test('projection withholds markets without enough historical information',()=>{
  assert.equal(estimateOpportunityProjection({history:[],position:'WR',market:'receivingYards',season:2026,priorEfficiency:2}),null);
  assert.equal(estimateOpportunityProjection({history:[{season:2026,week:1,stats:{receivingYards:0},usage:{targets:0}}],position:'WR',market:'receivingYards',season:2026}),null);
});

test('matchup table excludes thin-sample and low-workload player markets',()=>{
  assert.equal(hasMeaningfulProjectionRole({position:'WR',market:'receptions',projectedUsage:.8,historyGames:8}),false);
  assert.equal(hasMeaningfulProjectionRole({position:'WR',market:'receptions',projectedUsage:2,historyGames:8}),true);
  assert.equal(hasMeaningfulProjectionRole({position:'RB',market:'rushingAttempts',projectedUsage:8,historyGames:1}),false);
  assert.equal(hasMeaningfulProjectionRole({position:'QB',market:'passingYards',projectedUsage:5,historyGames:2,expectedStarter:true}),true);
});

test('Top Looks and Game player projections share one pregame efficiency prior',()=>{
  const matchup={season:2026,week:2};
  const players=[
    {position:'WR',games:[
      {season:2025,week:17,stats:{receivingYards:30},usage:{targets:5}},
      {season:2026,week:1,stats:{receivingYards:6},usage:{targets:3}},
      {season:2026,week:3,stats:{receivingYards:100},usage:{targets:10}}
    ]},
    {position:'WR',games:[
      {season:2025,week:17,stats:{receivingYards:50},usage:{targets:10}}
    ]}
  ];
  const priors=buildOpportunityEfficiencyPriors(players,matchup);
  assert.strictEqual(buildOpportunityEfficiencyPriors(players,matchup),priors);
  assert.equal(priors['WR:receivingYards'],86/18);
  const history=players[0].games.filter(g=>g.season<matchup.season||g.week<matchup.week);
  const gameProjection=estimateOpportunityProjection({history,position:'WR',market:'receivingYards',season:matchup.season,
    priorEfficiency:priors['WR:receivingYards']});
  const topLooksProjection=estimateOpportunityProjection({history,position:'WR',market:'receivingYards',season:matchup.season,
    priorEfficiency:priors['WR:receivingYards']});
  assert.equal(gameProjection.projection,topLooksProjection.projection);
  assert.equal(gameProjection.sampleGames,1);
});
