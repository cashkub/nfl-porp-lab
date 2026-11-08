import test from 'node:test';
import assert from 'node:assert/strict';
import {collegeRatings,overallScore,projection} from '../src/lib/projection.js';
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

test('overall pick uses the saved market blend when it reverses a team projection',()=>{
  const g={...game,homeSpread:-7,context:{away:{},home:{},total:47,marketWeight:0.5}};
  const m=projection(g,{...rating,offense:24},rating);
  assert.equal(m.winner.team,'A');
  assert.ok(m.overall[1]>m.overall[0]);
  assert.deepEqual(overallScore({blend:m.overall,stats:[24,23]}),m.overall);
  assert.deepEqual(overallScore({overall:[22,22],blend:m.overall}),[22,22]);
  assert.deepEqual(overallScore({blend:[null,null],stats:[24,23]}),[24,23]);
  assert.deepEqual(projection(game,{...rating,offense:24},rating).overall,[24,23]);
});
