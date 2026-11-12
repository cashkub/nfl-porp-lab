import React from 'react';

export default function RecordHeader({title,icon:Icon,children}){
  return <header className="mr-hero">
    <div>
      <span className="mr-eyebrow"><span/> PROP BETS · MODEL PERFORMANCE</span>
      <h2>{title} <em>RECORD</em></h2>
      <p>{children}</p>
    </div>
    <div className="mr-hero-mark"><Icon size={35}/><span>PREGAME<br/>MODEL DATA</span></div>
  </header>;
}
