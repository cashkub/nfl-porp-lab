import React, { useMemo, useState } from 'react';
import { isHit, METRICS } from '../lib/stats.js';

export default function PropChart({ games, metric, line, direction }) {
  const [active, setActive] = useState(null);
  const max = useMemo(() => {
    const highest = Math.max(...games.map(g => Number(g.stats[metric] || 0)), Number(line), 1);
    return Math.max(5, Math.ceil(highest * 1.22 / 10) * 10);
  }, [games, metric, line]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const linePct = Math.max(0, Math.min(100, Number(line) / max * 100));
  if (!games.length) {
    return <div className="empty-chart">No games match the current filters. Try another opponent or venue.</div>;
  }
  return (
    <div className="chart-scroll" aria-label="Game-by-game statistics, scroll horizontally on smaller screens">
      <div className="chart-inner" style={{ minWidth: Math.max(560, games.length * 53) }}>
        <div className="chart-main">
          <div className="chart-axis" aria-hidden="true">
            {ticks.map(f => <span key={f} style={{ bottom: `${f*100}%` }}>{Math.round(f*max)}</span>)}
          </div>
          <div className="chart-plot" role="group" aria-label={`Game-by-game ${METRICS[metric].label.toLowerCase()} bar chart`}>
            {ticks.map(f => <div key={f} className="chart-gridline" style={{ bottom: `${f*100}%` }} />)}
            <div className="chart-target" style={{ bottom: `${linePct}%` }}>
              <span>{direction.toUpperCase()} {line}</span>
            </div>
            <div className="chart-columns" style={{ gridTemplateColumns: `repeat(${games.length}, minmax(0, 1fr))` }}>
              {games.map((game, idx) => {
                const value = Number(game.stats[metric] ?? 0);
                const hit = isHit(value, line, direction);
                const id = `${game.season}-${game.week}-${game.gameId}-${idx}`;
                return (
                  <div className="chart-column" key={id}>
                    <button
                      type="button"
                      className={`chart-bar ${hit ? 'chart-bar-hit' : 'chart-bar-miss'} ${active === id ? 'chart-bar-active' : ''}`}
                      style={{ height: `${Math.max(1.5, value/max*100)}%` }}
                      aria-label={`Week ${game.week} ${game.venue==='H'?'home vs':'away at'} ${game.opponent}: ${value} ${METRICS[metric].label}; ${hit?'hit':'miss'}`}
                      title={`Week ${game.week} ${game.venue==='H'?'vs':'at'} ${game.opponent} • ${value} ${METRICS[metric].unit} • ${hit?'HIT':'MISS'}`}
                      onClick={() => setActive(old => old === id ? null : id)}
                    >
                      <span className="chart-bar-value">{value}</span>
                    </button>
                    <div className="chart-game-label"><span>{game.venue === 'H' ? 'vs' : game.venue === 'A' ? '@' : '—'} {game.opponent}</span><small>W{game.week}</small></div>
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
