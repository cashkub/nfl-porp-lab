import test from 'node:test';
import assert from 'node:assert/strict';
import { isHit, getPlayerGames, summarize, filteredWindow, getDistinctOpponents } from '../src/lib/stats.js';

const games = [
  { season: 2026, week: 1, venue:'H', opponent:'PIT', stats:{receivingYards:50} },
  { season: 2026, week: 2, venue:'A', opponent:'BAL', stats:{receivingYards:75} },
  { season: 2026, week: 3, venue:'H', opponent:'CLE', stats:{receivingYards:60} },
  { season: 2025, week: 1, venue:'A', opponent:'PIT', stats:{receivingYards:100} }
];
const player = { games };
test('strict over/under semantics: equality is not a win', () => {
  assert.equal(isHit(50,50,'over'),false);
  assert.equal(isHit(50,50,'under'),false);
  assert.equal(isHit(50,49.5,'over'),true);
  assert.equal(isHit(49,49.5,'under'),true);
});
test('season, venue, opponent filtering and chronological order', () => {
  assert.deepEqual(getPlayerGames(player,2026,'ALL','H').map(g=>g.week),[1,3]);
  assert.deepEqual(getPlayerGames(player,2026,'BAL').map(g=>g.week),[2]);
  assert.deepEqual(getDistinctOpponents(player,2026),['BAL','CLE','PIT']);
});
test('last N and seasonal stats reflect filters', () => {
  const filtered = getPlayerGames(player,2026);
  assert.equal(summarize(filtered,'receivingYards',59.5,'over').hits,2);
  assert.equal(summarize(filtered,'receivingYards',59.5,'over').rate,2/3);
  assert.equal(summarize(filteredWindow(filtered,2),'receivingYards',59.5,'over').hits,2);
  assert.equal(summarize(filteredWindow(filtered,2),'receivingYards',59.5,'over').streak,2);
  assert.equal(summarize([], 'receivingYards', 60).rate, null);
});

test('all seasons orders games across year boundaries before applying the game window', () => {
  const history = getPlayerGames(player, 'ALL', 'PIT');
  assert.deepEqual(history.map(game => game.season), [2025, 2026]);
  assert.equal(filteredWindow(history, '1')[0].stats.receivingYards, 50);
});
