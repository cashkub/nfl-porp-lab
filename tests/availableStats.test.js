import test from 'node:test';
import assert from 'node:assert/strict';
import {availableStats} from '../src/lib/availableStats.js';
import {METRICS} from '../src/lib/stats.js';
test('category list includes actual opportunities even for zero or negative yards',()=>{
  assert.deepEqual(availableStats(METRICS,[{stats:{passingYards:0,receivingYards:-2,receptions:0},usage:{targets:1}}]),['receivingYards','receptions']);
  assert.deepEqual(availableStats({threes:{}},[{stats:{threes:0},threeAttempts:2}]),['threes']);
});
