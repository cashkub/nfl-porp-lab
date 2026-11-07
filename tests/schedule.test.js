import test from 'node:test';
import assert from 'node:assert/strict';
import { nextGame } from '../src/lib/schedule.js';
const games = [{season:2026, away:'LAR',home:'CIN',kickoff:'2026-11-02T13:00:00-05:00'},
  {season:2026,away:'CIN',home:'LAR',neutral:true,kickoff:'2026-11-12T20:00:00-05:00'}];
test('upcoming opponent skips started games and respects aliases, season and neutral venues',()=>{
  const now = Date.parse(games[0].kickoff);
  assert.equal(nextGame(games,'CIN',2026,now).name,'Rams');
  assert.equal(nextGame(games,'LA',2026,now).venue,'Neutral site');
  assert.equal(nextGame(games,'CIN',2025,now),null);
});
