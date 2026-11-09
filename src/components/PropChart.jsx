import {DefenseRank} from './HitRate.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isHit, METRICS } from '../lib/stats.js';

import { usageFor } from '../lib/bookLine.js';

export default function PropChart({ multi, defenses, games, metric, line, direction, markets=METRICS, college=false, football=false, rankCount=32 }) {
  const [active, setActive] = useState(null);
  const scroll = useRef(null);
  useEffect(() => {
    const area = scroll.current;
    if (area && window.matchMedia('(max-width: 620px)').matches) area.scrollLeft = area.scrollWidth;
  }, [games]);
  const max = useMemo(() => {
    const highest = Math.max(...games.map(g => Number(g.stats[metric] || 0)), Number(line), 1);
    return Math.max(5, Math.ceil(highest * 1.22 / 10) * 10);
  }, [games, metric, line]);
  const usage = usageFor(metric);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const linePct = Math.max(0, Math.min(100, Number(line) / max * 100));
  if (!games.length) {
    return <div className="empty-chart">No games match the current filters. Try another opponent or venue.</div>;
  }
  return (
    <div ref={scroll} className="chart-scroll" aria-label="Game-by-game statistics, scroll horizontally on smaller screens">
      <div className="chart-inner" style={{ "--game-count": games.length }}>
        <div className="chart-main">
          <div className="chart-axis" aria-hidden="true">
            {ticks.map(f => <span key={f} style={{ bottom: `${f*100}%` }}>{Math.round(f*max)}</span>)}
          </div>
          <div className="chart-plot" role="group" aria-label={`Game-by-game ${markets[metric].label.toLowerCase()} bar chart`}>
            {ticks.map(f => <div key={f} className="chart-gridline" style={{ bottom: `${f*100}%` }} />)}
            <div className="chart-target" style={{ bottom: `${linePct}%` }}>
              <span>{direction.toUpperCase()} {line}</span>
            </div>
            <div className="chart-columns" style={{ gridTemplateColumns: `repeat(${games.length}, minmax(0, 1fr))` }}>
              {games.map((game, idx) => {
                const value = Number(game.stats[metric] ?? 0);
                const hit = isHit(value, line, direction);
                const rank = defenses.find(row => row.team === game.opponent)?.rank;
                const rankLabel = rank ? `Defense rank #${rank}` : 'Defense rank unavailable';
                const outcome = value === line ? 'push' : hit ? 'hit' : 'miss';
                const matchup=college?game.abbr:game.opponent;
                const gameLabel=college?game.date:game.season+' Week '+game.week;
                const id = `${game.season}-${game.week}-${game.gameId}-${idx}`;
                return (
                  <div className="chart-column" key={id}>
                    <button
                      type="button"
                      className={`chart-bar chart-bar-${outcome} ${active === id ? 'chart-bar-active' : ''}`}
                      style={{ height: `${Math.max(1.5, value/max*100)}%` }}
                      aria-label={`${gameLabel} ${game.venue==='H'?'home vs':'away at'} ${matchup}: ${value} ${markets[metric].label}; ${outcome}. ${rankLabel}`}
                      title={`${gameLabel} ${game.venue==='H'?'vs':'at'} ${matchup} • ${value} ${markets[metric].unit} • ${outcome.toUpperCase()} • ${rankLabel}`}
                      onClick={() => setActive(old => old === id ? null : id)}
                    >
                      <span className="chart-bar-value">{value}</span>
                    </button>
                    <div className="chart-game-label"><span>{game.venue === 'H' ? 'vs' : game.venue === 'A' ? '@' : '—'} {matchup}</span><small>{college?game.date.slice(5):(multi?String(game.season).slice(-2)+' · ':'')+'W'+game.week}</small>{!football && <small className="usage-label" title={college?'Minutes':usage.label}>{college?game.minutes:game.usage?.[usage.key] ?? '—'} {college?'min':usage.key === 'opportunities' ? 'opp' : usage.key === 'attempts' ? 'att' : usage.key === 'carries' ? 'car' : 'tgt'}</small>}<b className="chart-defense">DEF <DefenseRank compact rank={rank} total={rankCount} side={direction}/></b></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
