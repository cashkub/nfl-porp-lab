import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateOpportunityProjection,getUsageMetric} from '../src/lib/playerProjection.js';

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
