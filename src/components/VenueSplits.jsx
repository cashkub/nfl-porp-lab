import HitRate, {rateStyle} from './HitRate.jsx';
import React from 'react';
import { filteredWindow, summarize } from '../lib/stats.js';

export default function VenueSplits({ multi, games, metric, line, direction, windowSize }) {
  return <section className="venue-splits" aria-label="Home and away hit rates">
    <h2>Home vs. away</h2>
    <p>{windowSize === 'season' ? (multi ? 'All seasons' : 'Full season') : `Last ${windowSize} at each venue`} · {direction} {line}</p>
    {['H', 'A'].map(venue => {
      const sample = filteredWindow(games.filter(game => game.venue === venue), windowSize);
      const { rate, hits, total } = summarize(sample, metric, line, direction);
      return <div className="venue-row" key={venue}>
        <div><b>{venue === 'H' ? 'Home' : 'Away'}</b><span>{total ? `${hits}/${total} games` : 'No games'}</span><strong><HitRate rate={rate}/></strong></div>
        <div className="venue-track" aria-hidden="true"><i style={{...rateStyle(rate), width: `${(rate ?? 0) * 100}%` }} /></div>
      </div>;
    })}
  </section>;
}
