import test from 'node:test';
import assert from 'node:assert/strict';
import {injuryChanges,oddsChanges} from '../src/lib/slateChanges.js';

const quote=(player,point,over=-110)=>({player,metric:'passingYards',point,over,under:-110});

test('weekly comparison includes price-only moves, changed lines, additions and removals',()=>{
  const before=[quote('A',200),quote('B',210),quote('C',220),quote('D',230)];
  const after=[quote('A',200,110),quote('B',211),quote('D',230),quote('E',190)];
  const rows=oddsChanges({wednesday:{lines:before},lines:after});
  assert.equal(rows.length,4);
  assert.match(rows[0].text,/\+110/);
  assert.match(rows[1].text,/211/);
  assert.match(rows[2].text,/No longer offered/);
  assert.match(rows[3].text,/New Sunday/);
  assert.equal(oddsChanges({lines:after}),null);
});

test('injuries compare the same player and team, including new reports',()=>{
  const game={away:'AAA',home:'BBB',wednesdayInjuries:{teams:{AAA:[{name:'Player A',status:'Questionable'}],BBB:[]}},
    injuries:{AAA:[{name:'Player A',gameStatus:'Out'}],BBB:[{name:'Player B',status:'Doubtful'}]}};
  assert.deepEqual(injuryChanges(game).map(x=>x.text),['Questionable → Out','New report · Doubtful']);
});
