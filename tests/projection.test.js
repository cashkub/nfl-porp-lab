import test from 'node:test';
import assert from 'node:assert/strict';
import {collegeRatings,projection} from '../src/lib/projection.js';
const game={home:'B',away:'A',neutral:true};
const rating={games:3,offense:23,defense:20,baseline:20};
test('injury deductions affect only the appropriate team and can change the pick',()=>{
  const g={...game,injuries:{A:[{deduction:1.75},{status:'Questionable'}]}};
  const r=projection(g,{...rating,offense:24},rating);
  assert.equal(r.a.score,22.3);
  assert.equal(r.winner.team,'B');
  assert.equal(r.margin,.7);
});
test('CBB model uses completed games before cutoff, includes neutral venue and small samples',()=>{
  const before={...game,kickoff:'2026-11-03T12:00Z',homeScore:60,awayScore:78,final:true};
  const later={...before,kickoff:'2026-11-05T12:00Z',awayScore:10};
  const cutoff=Date.parse('2026-11-04T00:00Z');
  const ratings=collegeRatings([before,later,{...before,final:false}],cutoff);
  assert.equal(ratings.A.games,1);
  assert.equal(ratings.B.baseline,69);
  assert.equal(projection(game,ratings.A,ratings.B,true).winner.team,'A');
  assert.equal(projection(game,ratings.A,null,true),null);
});
