import React from 'react';
import {teamColor} from '../lib/teamColors.js';
import './InjuryReport.css';

const statuses = {
  out: [0, 'out', 'Out'], inactive: [0, 'out', 'Inactive'],
  'injured reserve': [1, 'reserve', 'IR'], ir: [1, 'reserve', 'IR'],
  'physically unable to perform': [1, 'reserve', 'PUP'], pup: [1, 'reserve', 'PUP'],
  suspended: [1, 'reserve', 'Suspended'], doubtful: [2, 'doubtful', 'Doubtful'],
  questionable: [3, 'questionable', 'Questionable'],
  'did not participate in practice': [4, 'practice', 'Did not practice'],
  'limited participation in practice': [5, 'practice', 'Limited practice'],
  'full participation in practice': [6, 'full', 'Full practice']
};

function statusOf(player) {
  const label = player.gameStatus || player.status || 'Status pending';
  return statuses[label.toLowerCase().trim()] || [7, 'neutral', label];
}

function InjuryRow({player, highlight}) {
  const [,tone,label] = statusOf(player);
  const defense = (player.defenseSnapShare || 0) > (player.offenseSnapShare || 0);
  const share = defense ? player.defenseSnapShare : player.offenseSnapShare;
  const details = [player.position,player.injury];
  if (!highlight && player.gameStatus && player.practice) details.push(player.practice);
  if (highlight && share > 0) details.push(Math.round(share*100)+'% of recent '+(defense?'defensive':'offensive')+' snaps');
  const source = player.source?.startsWith('https://') ? 'Team announcement' : player.source;
  return <li className="injury-entry">
    <strong>{player.name}</strong>
    <span className="injury-designation" data-tone={tone}>{label}</span>
    <small>{details.filter(Boolean).join(' · ')}</small>
    {!highlight && <small className="injury-attribution">{[source,player.date?.slice(0,10),
      player.deduction>0 && '−'+player.deduction.toFixed(2)+' pts'].filter(Boolean).join(' · ')}</small>}
  </li>;
}

export function InjuryTeams({game,highlights}) {
  return <div className="injury-teams">{[game.away,game.home].map(team=>{
    const players = highlights ? highlights.filter(r=>r.team===team) : game.injuries?.[team] || [];
    if (highlights && !players.length) return null;
    const code = ({LA:'lar',WAS:'wsh',JAC:'jax'})[team] || team.toLowerCase();
    return <section key={team} className="injury-team" style={{'--injury-club':teamColor(team)}}>
      <h5><img width="32" height="32" alt="" loading="lazy" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+code+'.png'} onError={e=>{e.currentTarget.hidden=true}}/>
        <span>{team}</span><small>{players.length} listed</small></h5>
      {players.length ? <ul>{[...players].sort((a,b)=>statusOf(a)[0]-statusOf(b)[0] || a.name.localeCompare(b.name))
        .map(player=><InjuryRow key={player.id || player.name} player={player} highlight={Boolean(highlights)}/>)}</ul>
        : <p>No weekly entries available.</p>}
    </section>;
  })}</div>;
}

export function InjuryReport({game}) {
  return <details className="report-fold injury-details"><summary>Full injury report</summary>
    <InjuryTeams game={game}/>
    <a href="https://www.nfl.com/injuries/">Official NFL injury report ↗</a>
  </details>;
}
