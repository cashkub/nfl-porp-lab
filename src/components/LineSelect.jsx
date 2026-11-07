import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { METRICS } from '../lib/stats.js';

const PAGE_SIZE = 12;

export default function LineSelect({ metric, value, onChange }) {
  const { maximum, unit } = METRICS[metric];
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const wrapper = useRef(null);
  const trigger = useRef(null);
  const input = useRef(null);
  const lastPage = Math.floor(maximum * 2 / PAGE_SIZE);
  const start = page * PAGE_SIZE / 2;
  const end = Math.min(maximum, start + (PAGE_SIZE - 1) / 2);
  const search = query.trim();
  const exact = Number(search);
  const valid = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(search) &&
    exact <= maximum && Number.isInteger(exact * 2);
  const options = search ? (valid ? [exact] : []) :
    Array.from({ length: (end - start) * 2 + 1 }, (_, i) => start + i / 2);

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const outside = event => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function choose(next) {
    onChange(next);
    close();
  }
  return <div className="line-picker" ref={wrapper}
    onBlur={e => { if (e.relatedTarget && !wrapper.current.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); close(); } }}>
    <button className="line-trigger" ref={trigger} type="button" aria-haspopup="dialog"
      aria-expanded={open} aria-label={`Prop line, ${value} ${unit}`}
      onClick={() => { setPage(Math.floor(value * 2 / PAGE_SIZE)); setQuery(''); setOpen(!open); }}>
      <span><small>Prop line</small><strong>{value} <em>{unit}</em></strong></span><ChevronDown size={17}/>
    </button>
    {open && <div className="line-menu" role="dialog" aria-label="Choose a prop line">
      <label htmlFor="exact-line">Choose a line</label>
      <input id="exact-line" ref={input} type="text" inputMode="decimal" value={query}
        placeholder="Enter an exact line…" autoComplete="off" onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) { e.preventDefault(); choose(exact); } }}/>
      {!search && <div className="line-pages">
        <button type="button" aria-label="Previous line range" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></button>
        <span>{start} – {end} {unit}</span>
        <button type="button" aria-label="Next line range" disabled={page === lastPage} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></button>
      </div>}
      <div className="line-options">{options.map(n => <button type="button" key={n} aria-pressed={value === n}
        onClick={() => choose(n)}>{n}{n === value && <Check size={11}/>}</button>)}</div>
      {search && !valid && <p role="status">Use a whole or half number from 0 to {maximum}.</p>}
    </div>}
  </div>;
}
