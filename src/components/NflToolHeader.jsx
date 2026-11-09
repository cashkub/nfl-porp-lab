import React from 'react';

export default function NflToolHeader({active}){
  return <header className="nfl-tool-header">
    <a href="/preview/" className="nfl-tool-brand"><img alt="" src="/preview/assets/mark.svg"/>PropBets</a>
    <nav aria-label="NFL Navigation">
      <a href="/preview/nfl/">NFL Menu</a>
      <a href="#analyzer" aria-current={active==='charts'?'page':undefined}>Charts</a>
      <a href="#prop-lists" aria-current={active==='props'?'page':undefined}>Prop Lists</a>
    </nav>
  </header>;
}
