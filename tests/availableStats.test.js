import test from 'node:test';
import assert from 'node:assert/strict';
import {availableStats} from '../src/lib/availableStats.js';
import {METRICS} from '../src/lib/stats.js';
test('category list includes actual opportunities even for zero or negative yards',()=>{
  assert.deepEqual(availableStats(METRICS,[{stats:{passingYards:0,receivingYards:-2,receptions:0},usage:{targets:1}}]),['receivingYards','receptions']);
  assert.deepEqual(availableStats({threes:{}},[{stats:{threes:0},threeAttempts:2}]),['threes']);
});

test('CFB board uses market participation even when production is zero and excludes team totals',async()=>{
  const {cfbRoleGames}=await import('../src/lib/manualSports.js');
  const player={id:'234',name:'Test Player',roleGames:{passing:2,rushing:0,receiving:0,scoring:0},recent:{passingYards:[0,0]}};
  assert.equal(cfbRoleGames(player,'passingYards'),2);
  assert.equal(cfbRoleGames(player,'passingTDs'),2);
  assert.equal(cfbRoleGames(player,'rushingYards'),0);
  assert.equal(cfbRoleGames({...player,name:' Team'},'passingYards'),0);
  assert.equal(cfbRoleGames({...player,id:'-234'},'passingYards'),0);
});
