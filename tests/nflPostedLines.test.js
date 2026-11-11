import test from 'node:test';
import assert from 'node:assert/strict';
import {matchupBook,quotedPlayers} from '../src/lib/bookLine.js';
import {highImpactInjuries} from '../src/lib/gameInjuries.js';

test('posted markets survive missing history, alternate lines, team aliases and injury flags',()=>{
  const game={away:'LA',home:'LV',kickoff:'2026-11-15T18:00Z',injuries:{LV:[{id:'qb',name:'Fernando Mendoza',gameStatus:'Questionable'}]}};
  const book={...game,away:'LAR',lines:[180.5,190.5].map(point=>({player:'Fernando Mendoza',metric:'passingYards',point,over:-110})),anytime:[{player:'Unmatched Rookie',price:600}]};
  const rows=quotedPlayers(matchupBook([book],game),game,[{team:'LV',name:'Fernando Mendoza',id:'qb',games:[]}]);
  assert.deepEqual(rows.map(r=>r.line.point),[180.5,190.5,.5]);
  assert.equal(rows[0].status,'Questionable');
  assert.equal(rows[2].player,undefined);
  assert.equal(rows[2].line.over,600);
});

test('injury flags include regular offensive linemen and defenders without props',()=>{
  const players=[{name:'Tackle',position:'T',gameStatus:'Out',offenseSnapShare:.95},
    {name:'Corner',position:'CB',gameStatus:'Doubtful',defenseSnapShare:.77},
    {name:'Reserve',position:'CB',gameStatus:'Questionable',defenseSnapShare:.08}];
  assert.deepEqual(highImpactInjuries({away:'SEA',home:'LV',injuries:{SEA:players}}).map(r=>r.name),['Tackle','Corner']);
});
