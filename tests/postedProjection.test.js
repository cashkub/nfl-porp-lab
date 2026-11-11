import test from 'node:test';
import assert from 'node:assert/strict';
import {postedPriors, projectPosted} from '../src/lib/postedProjection.js';

const game={season:2026,week:4,home:'LV',away:'SEA',context:{home:{qbId:'qb',listed:true}}};
const row=(week,attempts,snaps)=>({season:2026,week,stats:{passingYards:attempts*7,scoredTDs:0,rushingAttempts:1},
  usage:{attempts,opportunities:1,carries:1,offenseSnapRate:snaps}});
const player={id:'qb',team:'LV',position:'QB',games:[row(1,5,.15)]};
const starter={id:'other',team:'SEA',position:'QB',games:[row(1,30,.9),row(5,90,.95)]};
const priors=postedPriors([player,starter],game);
test('uses pregame starter workload for a listed QB with one relief appearance',()=>{
  const result=projectPosted({player,game,priors,line:{metric:'passingYards'}});
  assert.equal(result.estimated,210);
  assert.match(result.note,/Starting QB workload/);
  assert.equal(projectPosted({player,game,priors,line:{metric:'rushingAttempts'}}).estimated,1);
});
test('withholds injured players and separates team TD probabilities from player stats',()=>{
  assert.equal(projectPosted({player,game,priors,status:'Out',line:{metric:'passingYards'}}).estimated,undefined);
  assert.equal(projectPosted({game:{...game,dstChances:{SEA:.12}},priors,line:{anytime:true,player:'Seattle Seahawks D/ST'}}).estimated,12);
});
test('anytime TD probability uses scored touchdowns, excluding passing TDs',()=>{
  const runner={position:'RB',team:'LV',games:[{...row(1,0,.9),stats:{scoredTDs:1,passingTDs:3},usage:{opportunities:10}}]};
  const result=projectPosted({player:runner,game,priors:postedPriors([runner],game),line:{metric:'scoredTDs',anytime:true,player:'Runner'}});
  assert.ok(Math.abs(result.estimated-100*(1-Math.exp(-1)))<1e-9);
});
