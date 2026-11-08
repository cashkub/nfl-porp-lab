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

test('pregame ranks exclude the selected week, later games and previous seasons', () => {
  const games = [[2025,18,99],[2026,1,3],[2026,2,30],[2026,3,10]].map(([season,week,receptions]) =>
    ({season,week,gameId:season+'-'+week,opponent:'BUF',stats:{receptions}}));
  const players = [{position:'WR',games}];
  assert.deepEqual(defenseTable(players,2026,'WR','receptions',1),[]);
  assert.equal(defenseTable(players,2026,'WR','receptions',2)[0].average,3);
});
