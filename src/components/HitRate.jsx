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

// NFL defensive ranks run in reverse order of the existing percentage palette.
export function defenseRankStyle(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 32) return undefined;
  return rateStyle((32 - rank) / 31);
}

export default function HitRate({rate}) {
  return <span className="hit-percent" style={rateStyle(rate)}>{formatRate(rate)}</span>;
}
