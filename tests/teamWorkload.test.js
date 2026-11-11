import test from 'node:test';
import assert from 'node:assert/strict';
import {teamWorkload} from '../src/lib/teamWorkload.js';

test('team workload uses only pregame rows and aggregates the selected season',()=>{
  const players=[
    {name:'QB One',position:'QB',games:[
      {season:2025,week:18,gameId:'old',team:'KC',usage:{attempts:50},stats:{passingYards:500}},
      {season:2026,week:1,gameId:'g1',team:'KC',usage:{attempts:30},stats:{passingYards:240}},
      {season:2026,week:2,gameId:'g2',team:'KC',usage:{attempts:40},stats:{passingYards:320}},
      {season:2026,week:3,gameId:'selected',team:'KC',usage:{attempts:999},stats:{passingYards:9999}},
    ]},
    {name:'Runner',position:'RB',games:[
      {season:2026,week:1,gameId:'g1',team:'KC',usage:{carries:10,targets:2},stats:{}},
      {season:2026,week:2,gameId:'g2',team:'KC',usage:{carries:20,targets:4},stats:{}},
      {season:2026,week:3,gameId:'selected',team:'KC',usage:{carries:900,targets:900},stats:{}},
    ]},
  ];
  const result=teamWorkload(players,'KC',{season:2026,week:3});
  assert.equal(result.games,2);
  assert.equal(result.source,'SELECTED SEASON');
  assert.equal(result.passAttempts,35);
  assert.equal(result.carries,15);
  assert.equal(result.targets,3);
  assert.equal(result.yardsPerAttempt,8);
  assert.deepEqual(result.rushLeader,['Runner',30]);
});

test('team workload falls back to career only when selected-season games are absent',()=>{
  const players=[{name:'Receiver',position:'WR',games:[
    {season:2025,week:8,gameId:'old',team:'BUF',usage:{targets:6,carries:0},stats:{}},
    {season:2026,week:4,gameId:'later',team:'BUF',usage:{targets:20},stats:{}},
  ]}];
  const result=teamWorkload(players,'BUF',{season:2026,week:4});
  assert.equal(result.source,'CAREER FALLBACK');
  assert.equal(result.targets,6);
  assert.equal(result.targetLeader[0],'Receiver');
});
