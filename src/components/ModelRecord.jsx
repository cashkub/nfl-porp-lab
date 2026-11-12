import React,{useState} from 'react';
import GameMarketRecord from './GameMarketRecord.jsx';
import {gameMarkets} from '../lib/gamePicks.js';
import {useArchive} from './useArchive.js';
import ModelRecordPicks from './ModelRecordPicks.jsx';

export default function ModelRecord(){
  const [tab,setTab]=useState('props');
  const picks=useArchive('nfl-picks.json');
  const games=useArchive('model-record.json');
  const isGame=Object.hasOwn(gameMarkets,tab);
  const archive=isGame?games:picks;
  const modelPicks=picks.rows?.filter(row=>row.model==='2026.11.v2');
  const tabs=[['props','Player Props'],['touchdowns','Anytime Touchdowns'],...Object.entries(gameMarkets)];
  return <section className="panel props-board model-record-shell">
    <div className="board-sort model-record-tabs">{tabs.map(([key,label])=><button key={key} className="outline-button" aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {archive.error?<p>Pick archive unavailable.</p>:!archive.rows?<p>Loading picks…</p>:isGame?
      <GameMarketRecord rows={games.rows} market={tab}/>:
      <ModelRecordPicks rows={modelPicks} kind={tab==='touchdowns'?'touchdowns':'props'} emptyMessage={modelPicks.length?'':'No Version 2 picks published yet.'}/>}
  </section>;
}
