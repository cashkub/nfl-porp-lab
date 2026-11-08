import React from 'react';
import {Check} from 'lucide-react';
import HitRate,{rateStyle} from './HitRate.jsx';
export default function StatCard({ label, summary, emphasized = false, selected, onClick }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`stat-card ${selected ? 'stat-card-selected' : ''} ${emphasized ? 'stat-card-featured' : ''}`}>
    <div className="stat-card-heading"><span>{label}</span>{selected && <Check size={16} className="selected-check" />}</div>
    <div className="stat-card-number"><HitRate rate={summary.rate}/></div>
    <div className="stat-card-footer"><span>{summary.hits} of {summary.total} games</span></div>
    <div className="rate-track" aria-hidden="true"><i style={{...rateStyle(summary.rate), width: `${(summary.rate || 0) * 100}%`}} /></div>
  </button>;
}

