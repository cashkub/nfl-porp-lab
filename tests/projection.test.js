import test from 'node:test';
import assert from 'node:assert/strict';
import {overallScore,projection} from '../src/lib/projection.js';
const game={home:'B',away:'A',neutral:true};
const rating={games:3,offense:23,defense:20,baseline:20};
test('injury deductions affect only the appropriate team and can change the pick',()=>{
  const g={...game,injuries:{A:[{deduction:1.75},{status:'Questionable'}]}};
  const r=projection(g,{...rating,offense:24},rating);
  assert.equal(r.a.score,22.3);
  assert.equal(r.winner.team,'B');
  assert.equal(r.margin,.7);
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
