import test from 'node:test';
import assert from 'node:assert/strict';
import {recordPeriod,periodLabel} from '../src/lib/recordWeeks.js';
test('NFL props and game records use the same official season and week across New Year',()=>{
  const id='2026_17_CIN_BAL';assert.equal(recordPeriod({id},'nfl'),'2026-17');assert.equal(recordPeriod({gameId:id},'nfl'),'2026-17');assert.equal(periodLabel('2026-09','nfl'),'2026 · Week 9');
});
test('college archives use each individual game date in Eastern time',()=>{
  assert.equal(recordPeriod({kickoff:'2026-11-09T01:00Z'},'cbb'),'2026-11-08');
  assert.equal(periodLabel('2026-11-08','cbb'),'Sun, Nov 8, 2026');
  assert.equal(recordPeriod({date:'2026-11-09'},'cbb'),'2026-11-09');
});
