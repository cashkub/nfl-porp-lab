import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPropRows} from '../src/lib/propSort.js';

const row=(name,label,estimated,point,anytime=false)=>({p:{name},label,estimated,line:{point,anytime}});
const rows=[row('A','Yards',9,10),row('B','Catches',7,5),row('C','Anytime TD',60,.5,true),row('D','Yards',null,10)];
const names=order=>sortPropRows(rows,order).map(r=>r.p.name).join('');
test('line comparisons handle percentages, TD odds and missing estimates',()=>{
  assert.equal(names('above'),'BACD');
  assert.equal(names('below'),'ABCD');
  assert.equal(names('td'),'CABD');
  assert.equal(names('market'),'CBAD');
  assert.equal(names('player'),'ABCD');
  assert.equal(sortPropRows([{p:{name:'F'},label:'Yards',averageLine:4,estimated:6},rows[1]],'above')[0].p.name,'F');
});
test('projection sort ranks within market and preserves the input',()=>{
  const input=[...rows,row('E','Yards',20,21)];
  assert.deepEqual(sortPropRows(input,'high').map(r=>r.p.name),['C','B','E','A','D']);
  assert.deepEqual(sortPropRows(input,'low').map(r=>r.p.name),['C','B','A','E','D']);
  assert.equal(input[0].p.name,'A');
});
