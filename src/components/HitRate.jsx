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

export default function HitRate({rate}) {
  return <span className="hit-percent" style={rateStyle(rate)}>{formatRate(rate)}</span>;
}
