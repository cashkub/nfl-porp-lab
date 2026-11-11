import test from 'node:test';
import assert from 'node:assert/strict';
import {highImpactInjuries} from '../src/lib/gameInjuries.js';

test('injury flags include the listed QB1 and leaders, not backup or low-role players',()=>{
  const game={away:'A',home:'B',context:{away:{qbId:'qb1'},home:{qbId:'qb2'}},injuries:{
    A:[{id:'qb1',name:'Starter',position:'QB',status:'Questionable'},{id:'qb-backup',name:'Backup',position:'QB',status:'Out'},{name:'Lead Receiver',position:'WR',status:'Out'},{name:'WR4',position:'WR',status:'Out'}],
    B:[{id:'qb2',name:'Other Starter',position:'QB',status:'Out'}]
  }};
  const rows=highImpactInjuries(game,{away:{targetLeader:['Lead Receiver',8]},home:{}});
  assert.deepEqual(rows.map(row=>row.name),['Starter','Lead Receiver','Other Starter']);
});

test('injury flags stay empty when reports contain only healthy or non-core players',()=>{
  const game={away:'A',home:'B',context:{away:{qbId:'qb1'}},injuries:{A:[{id:'qb1',name:'Starter',position:'QB',status:'Active'},{name:'Reserve',position:'RB',status:'Out'}],B:[]}};
  assert.deepEqual(highImpactInjuries(game,{away:{},home:{}}),[]);
});
