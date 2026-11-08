import test from 'node:test';
import assert from 'node:assert/strict';
import {recordWeek,weekLabel} from '../src/lib/recordWeeks.js';
test('NFL props and game records use the same official season and week across New Year',()=>{
  const id='2026_17_CIN_BAL';assert.equal(recordWeek({id},'nfl'),'2026-17');assert.equal(recordWeek({gameId:id},'nfl'),'2026-17');assert.equal(weekLabel('2026-09'),'2026 · Week 9');
});
test('college archives group by the Monday of the game date in Eastern time',()=>{
  assert.equal(recordWeek({kickoff:'2026-11-09T01:00Z'},'cbb'),'2026-11-02');
  assert.equal(recordWeek({date:'2026-11-09'},'cbb'),'2026-11-09');
});
