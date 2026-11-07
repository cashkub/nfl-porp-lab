import React, {useMemo, useState} from 'react';
import { ChevronDown } from 'lucide-react';
import { defenseTable } from '../lib/matchup.js';
import { METRICS, formatNumber, formatRate, getPlayerGames, summarize } from '../lib/stats.js';

export default function Matchup({players, player, season, metric, line, direction}) {
  const [selection, setSelection] = useState('');
  const position = player?.position;
  const rows = useMemo(() => defenseTable(players, season, position, metric), [players, season, position, metric]);
  const leagueGames = rows.reduce((n,r) => n + r.games, 0);
  const league = leagueGames ? rows.reduce((n,r) => n + r.total, 0) / leagueGames : 0;
  const row = rows.find(r => r.team === selection);
  const history = row ? summarize(getPlayerGames(player, season, row.team), metric, line, direction) : null;
  const unit = METRICS[metric].unit;
  return <section className="panel matchup" aria-labelledby="matchup-title">
    <div className="matchup-head"><div><h2 id="matchup-title">Matchup research</h2>
      <p>{season} · {METRICS[metric].label} allowed per game to all opposing {position || '—'}s combined</p></div>
      <div className="select-wrap"><select aria-label="Defense to research" value={row?.team || ''} onChange={e=>setSelection(e.target.value)}>
        <option value="">Choose a defense</option>{rows.map(r=>r.team).sort().map(t=><option key={t}>{t}</option>)}
      </select><ChevronDown size={14}/></div></div>
    {row ? <>
      <div className="scout-grid">
        <div><small>{row.team} allowed</small><strong>{formatNumber(row.average)} <em>{unit}</em></strong><span>{row.games} games</span></div>
        <div><small>Defense rank</small><strong>#{row.rank} <em>of {rows.length}</em></strong><span>#1 allows the most</span></div>
        <div><small>League average</small><strong>{formatNumber(league)} <em>{unit}</em></strong><span>Per defense-game</span></div>
      </div>
      <p className="history"><b>{player?.name} vs {row.team}</b> · {history.total ? `${formatRate(history.rate)} hit (${history.hits}/${history.total}) at ${direction} ${line} this season.` : 'No recorded meetings this season.'}</p>
    </> : <p className="history">Choose a defense to compare its season average, league rank, and the player’s head-to-head results.</p>}
    </section>;
}
