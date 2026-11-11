import React from 'react';
import {injuryChanges,oddsChanges} from '../lib/slateChanges.js';

function stamp(value){
  if(!value || !Number.isFinite(Date.parse(value)))return '';
  if(value.length===10)return value;
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(value));
}

export default function GameChanges({game,book}){
  const odds=oddsChanges(book),injuries=injuryChanges(game);
  return <details className="slate-changes"><summary>Changes since Wednesday</summary>
    {[[ 'DraftKings props',odds,book?.checkedAt||book?.snapshotDate,book?.wednesday?.checkedAt||book?.wednesday?.snapshotDate],
      ['Injury reports',injuries,game.injurySnapshotAt,game.wednesdayInjuries?.asOf]].map(([title,rows,at,baseline])=>
      <section key={title}><h4>{title}</h4>
        {stamp(baseline)&&<small>Wednesday snapshot · {stamp(baseline)}</small>}
        {stamp(at)&&<small>Latest snapshot · {stamp(at)}</small>}
        {rows?.length?<ul>{rows.map((r,i)=><li key={i}><strong>{r.label}</strong><span>{r.text}{r.at?' · '+stamp(r.at):''}</span></li>)}</ul>
          :<p>{rows?'No changes in the compared snapshots.':title==='DraftKings props'?'Line movement appears when both Wednesday and Sunday snapshots are available.':'No Wednesday injury snapshot available for this game.'}</p>}
      </section>)}
  </details>;
}
