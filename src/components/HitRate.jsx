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

export function DefenseRank({rank,total=32,side,compact=false}) {
  if (!Number.isInteger(rank) || rank < 1) return '—';
  const under = String(side).toLowerCase() === 'under';
  const strength = total > 1 && rank <= total
    ? (under ? rank - 1 : total - rank) / (total - 1)
    : null;
  const sideName = under ? 'Under' : 'Over';
  const assessment = strength == null ? '' : strength >= 0.75 ? 'Favorable' : strength <= 0.25 ? 'Tough' : 'Neutral';
  const description = assessment ? assessment + ' For ' + sideName : '';
  return <span style={rateStyle(strength)} title={`Defense #${rank} By Most Allowed${description ? ' · ' + description : ''}`}>
    #{rank}{description && <>{compact ? <br/> : ' · '}{compact ? assessment : description}</>}
  </span>;
}

export default function HitRate({rate}) {
  return <span className="hit-percent" style={rateStyle(rate)}>{formatRate(Number.isFinite(rate)?rate:null)}</span>;
}
