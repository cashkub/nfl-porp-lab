import HitRate from './HitRate.jsx';
import React, {useState} from 'react';
import { ChevronDown } from 'lucide-react';
import { METRICS, formatNumber, getPlayerGames, summarize } from '../lib/stats.js';

export default function Matchup({upcomingOpponent, rows, player, season, metric, line, direction}) {
  const [selection, setSelection] = useState(null);
  const position = player?.position;
  const leagueGames = rows.reduce((n,r) => n + r.games, 0);
  const league = leagueGames ? rows.reduce((n,r) => n + r.total, 0) / leagueGames : 0;
  const row = rows.find(r => r.team === (selection ?? upcomingOpponent) || (selection == null && r.team === 'LA' && upcomingOpponent === 'LAR'));
  const history = row ? summarize(getPlayerGames(player, season, row.team), metric, line, direction) : null;
  const period = season === 'ALL' ? 'across available seasons' : 'this season';
  const unit = METRICS[metric].unit;
  return <section className="panel matchup" aria-labelledby="matchup-title">
    <div className="matchup-head"><div><h2 id="matchup-title">Matchup research</h2>
      <p>{season === 'ALL' ? 'All seasons' : season} · {METRICS[metric].label} allowed per game to all opposing {position || '—'}s combined</p></div>
      <div className="select-wrap"><select aria-label="Defense to research" value={row?.team || ''} onChange={e=>setSelection(e.target.value)}>
        <option value="">Choose a defense</option>{rows.map(r=>r.team).sort().map(t=><option key={t}>{t}</option>)}
      </select><ChevronDown size={14}/></div></div>
    {row ? <>
      <div className="scout-grid">
        <div><small>{row.team} allowed</small><strong>{formatNumber(row.average)} <em>{unit}</em></strong><span>{row.games} games</span></div>
        <div><small>Defense rank</small><strong>#{row.rank} <em>of {rows.length}</em></strong><span>#1 allows the most</span></div>
        <div><small>League average</small><strong>{formatNumber(league)} <em>{unit}</em></strong><span>Per defense-game</span></div>
      </div>
      <p className="history"><b>{player?.name} vs {row.team}</b> · {history.total ? <><strong><HitRate rate={history.rate}/></strong> hit ({history.hits}/{history.total}) at {direction} {line} {period}.</> : `No recorded meetings ${period}.`}</p>
    </> : <p className="history">Choose a defense to compare its season average, league rank, and the player’s head-to-head results.</p>}
    </section>;
}
