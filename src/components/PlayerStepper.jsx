import React, {useId} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import './PlayerStepper.css';

export default function PlayerStepper({choices, value, onSelect, children}) {
  const index = choices.indexOf(value);
  const disabled = !choices.length || (choices.length === 1 && index === 0);
  function move(direction) {
    const start = index < 0 && direction < 0 ? choices.length : index;
    onSelect(choices[(start + direction + choices.length) % choices.length]);
  }
  return <div className="player-stepper">
    <button type="button" aria-label="Previous player" disabled={disabled} onClick={()=>move(-1)}><ChevronLeft size={17}/></button>
    {children}
    <button type="button" aria-label="Next player" disabled={disabled} onClick={()=>move(1)}><ChevronRight size={17}/></button>
  </div>;
}

export function BoardPlayerPicker({names, value, onSelect}) {
  const id = useId();
  const choices = [...new Set(names)].sort((a,b)=>a.localeCompare(b));
  return <div className="stepper-field">
    <label htmlFor={id}>Player</label>
    <PlayerStepper choices={choices} value={value} onSelect={onSelect}>
      <input id={id} list={id+'-names'} type="search" value={value} onChange={e=>onSelect(e.target.value)} placeholder="Find Player"/>
    </PlayerStepper>
    <datalist id={id+'-names'}>{choices.map(name=><option key={name} value={name}/>)}</datalist>
  </div>;
}
