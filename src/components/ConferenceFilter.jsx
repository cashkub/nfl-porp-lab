import FilterMenu from './FilterMenu.jsx';
import React from 'react';

export default function ConferenceFilter({metadata,value,onChange}) {
  const conferences = [...new Set(Object.values(metadata?.conferences || {}))].sort();
  return <label>Conference<FilterMenu value={value} onChange={event=>onChange(event.target.value)}>
    <option value="">All Conferences</option>
    {conferences.map(name=><option key={name}>{name}</option>)}
  </FilterMenu></label>;
}
