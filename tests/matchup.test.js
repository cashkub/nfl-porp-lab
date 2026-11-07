import test from 'node:test';
import assert from 'node:assert/strict';
import { defenseTable } from '../src/lib/matchup.js';

test('defense averages count unique games, include zero-position games and share ranks on ties', () => {
  const game = (opponent, gameId, receptions, season=2026) => ({opponent, gameId, season, stats:{receptions}});
  const players = [
    {position:'WR', games:[game('A','1',2),game('B','3',4),game('C','4',1),game('A','old',20,2025)]},
    {position:'WR', games:[game('A','1',6)]},
    {position:'RB', games:[game('A','2',10)]}
  ];
  const rows = defenseTable(players, 2026, 'WR', 'receptions');
  assert.deepEqual(rows.map(r=>[r.team,r.games,r.average,r.rank]), [['A',2,4,1],['B',1,4,1],['C',1,1,3]]);
});
