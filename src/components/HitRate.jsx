import React from 'react';
import {formatRate} from '../lib/stats.js';

export function rateStyle(rate) {
  if (!Number.isFinite(rate)) return undefined;
  const clamped = Math.min(1, Math.max(0, rate));
  const low = clamped < 0.5;
  const weight = (low ? clamped : clamped - 0.5) * 200;
  const from = low ? 'var(--rate-low)' : 'var(--rate-mid)';
  const to = low ? 'var(--rate-mid)' : 'var(--rate-high)';
  return { color: `color-mix(in srgb, ${from}, ${to} ${weight}%)` };
}

// First rank represents the highest value on the color scale.
export function defenseRankStyle(rank,total=32) {
  if (!Number.isInteger(rank) || rank < 1 || rank > total || !Number.isInteger(total) || total < 2) return undefined;
  return rateStyle((total - rank) / (total - 1));
}

export function DefenseRank({rank,total=32,label,position,compact=false}) {
  if (!Number.isInteger(rank) || rank < 1) return '—';
  const ordinal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
  const placement = rank === 1 ? 'Most' : rank === 2 ? '2nd Most' : rank === total ? 'Least' : rank === total - 1 ? '2nd Least' : `${ordinal} Most`;
  const description = label && position ? `Allows ${placement} ${label} to ${position}` : '';
  return <span style={defenseRankStyle(rank,total)} title={description || `Defense rank ${rank} of ${total}`}>
    {description || `#${rank}`}
  </span>;
}

export default function HitRate({rate}) {
  return <span className="hit-percent" style={rateStyle(rate)}>{formatRate(Number.isFinite(rate)?rate:null)}</span>;
}
