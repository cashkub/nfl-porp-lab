import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUpRight, BarChart3, Check, ChevronDown,
  ChevronRight, Info, Search, ShieldCheck,
  
} from 'lucide-react';
import VenueSplits from './components/VenueSplits.jsx';
import LineSelect from './components/LineSelect.jsx';
import Matchup from './components/Matchup.jsx';
import PropChart from './components/PropChart.jsx';
import { demoData } from './lib/demoData.js';
import {
  METRICS, preferredMetric, isHit, summarize, formatRate, formatNumber,
  getPlayerGames, getDistinctOpponents, filteredWindow
} from './lib/stats.js';

function PlayerSearch({ players, selected, season, onSelect, showRoster }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const wrap = useRef(null);
  useEffect(() => setQuery(''), [selected?.id]);
  useEffect(() => {
    const close = event => { if (!wrap.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const results = useMemo(() => {
    const term = query.toLowerCase().trim();
    const ranked = players.filter(p => !term || `${p.name} ${p.team} ${p.position}`.toLowerCase().includes(term));
    return ranked.sort((a, b) => {
      const active = Number(b.seasons?.includes(season)) - Number(a.seasons?.includes(season));
      if (active) return active;
      const aStarts = a.name.toLowerCase().startsWith(term);
      const bStarts = b.name.toLowerCase().startsWith(term);
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name);
    }).slice(0, showRoster ? undefined : 10);
  }, [players, query, season, showRoster]);
  const choose = player => { onSelect(player.id); setOpen(false); setQuery(''); };
  const onKeyDown = event => {
    if (!open && ['ArrowDown','Enter'].includes(event.key)) { setOpen(true); return; }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'ArrowDown') { event.preventDefault(); setFocusIndex(i => Math.min(i + 1, results.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); }
    if (event.key === 'Enter' && open && results[focusIndex]) { event.preventDefault(); choose(results[focusIndex]); }
  };
  return <div className="player-picker" ref={wrap}>
    <div className={`search-input-shell ${open ? 'search-open' : ''}`}>
      <Search size={19} aria-hidden="true" className="muted-icon" />
      <input
        type="search" value={query} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls="player-suggestions" aria-label="Search players"
        placeholder={selected ? `${selected.name} · ${selected.team || selected.position}` : 'Search any NFL player…'}
        onFocus={() => { setOpen(true); setFocusIndex(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setFocusIndex(0); }}
        onKeyDown={onKeyDown}
      />
      
    </div>
    {open && <div className="search-results" id="player-suggestions" role="listbox">
      <div className="result-header">PLAYERS <span>{results.length ? (showRoster ? 'Team roster' : 'Top matches') : 'No matches'}</span></div>
      {results.length ? results.map((player, i) => <button
        type="button" role="option" aria-selected={i === focusIndex}
        key={player.id} className={`player-result ${i === focusIndex ? 'result-focused' : ''}`}
        onMouseEnter={() => setFocusIndex(i)} onClick={() => choose(player)}
      >
        <div className="player-result-icon">{player.position || 'NFL'}</div>
        <div className="result-player-name"><strong>{player.name}</strong><small>{player.team || 'NFL'} · {player.position || 'Player'}</small></div>
        {player.seasons?.includes(season) && <span className="available-dot" title="Stats available in selected season" />}
        <ChevronRight size={15} className="muted-icon" />
      </button>) : <div className="no-results">Try a different name or select a different season.</div>}
    </div>}
  </div>;
}

function StatCard({ label, summary, emphasized = false, selected, onClick }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`stat-card ${selected ? 'stat-card-selected' : ''} ${emphasized ? 'stat-card-featured' : ''}`}>
    <div className="stat-card-heading"><span>{label}</span>{selected && <Check size={16} className="selected-check" />}</div>
    <div className="stat-card-number">{formatRate(summary.rate)}</div>
    <div className="stat-card-footer"><span>{summary.hits} of {summary.total} games</span></div>
    <div className="rate-track" aria-hidden="true"><i style={{width: `${(summary.rate || 0) * 100}%`}} /></div>
  </button>;
}

function Insights({ games, metric, line, direction }) {
  const summaries = summarize(games, metric, line, direction);
  const lastThree = summarize(games.slice(-3), metric, line, direction);
  const changes = games.length >= 6 ?
    (games.slice(-3).reduce((t,g)=>t+g.stats[metric],0)/3) - (games.slice(-6,-3).reduce((t,g)=>t+g.stats[metric],0)/3) : null;
  return <div className="insight-grid">
    <div className="small-card"><span>Average</span><strong>{formatNumber(summaries.average)}</strong><small>per game</small></div>
    <div className="small-card"><span>Median</span><strong>{formatNumber(summaries.median)}</strong><small>per game</small></div>
    <div className="small-card"><span>Last 3 hit rate</span><strong>{formatRate(lastThree.rate)}</strong><small>{lastThree.hits}/{lastThree.total} games</small></div>
    <div className="small-card"><span>Recent trend</span><strong className={changes == null ? '' : changes>=0 ? 'positive' : 'negative'}>{changes == null ? '—' : `${changes >= 0 ? '+' : ''}${changes.toFixed(1)}`}</strong><small>last 3 vs prior 3</small></div>
  </div>;
}

function GameLog({ games, metric, line, direction }) {
  return <div className="game-log-wrap">
    <table className="game-log"><thead><tr><th>GAME</th><th>OPPONENT</th><th>VENUE</th><th>{METRICS[metric].short}</th><th>RESULT</th></tr></thead>
      <tbody>{[...games].reverse().map((game, i) => {
        const val = Number(game.stats[metric] ?? 0);
        const hit = isHit(val, line, direction);
        return <tr key={`${game.gameId}-${game.week}-${i}`}>
          <td><strong>W{game.week}</strong></td>
          <td><strong>{game.opponent || '—'}</strong></td>
          <td>{game.venue === 'H' ? <span className="venue-pill">HOME</span> : game.venue === 'A' ? <span className="venue-pill away">AWAY</span> : '—'}</td>
          <td className="table-num">{val}</td>
          <td><span className={`result-pill ${val === line ? 'push' : hit?'hit':'miss'}`}>{val === line ? 'PUSH' : hit ? 'HIT' : 'MISS'}</span></td>
        </tr>;
      })}</tbody>
    </table>
    {games.length === 0 && <div className="empty-log">No matching games found.</div>}
  </div>;
}

export default function App() {
  const [data, setData] = useState(demoData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [season, setSeason] = useState(2026);
  const [team, setTeam] = useState('ALL');
  const [metric, setMetric] = useState('receivingYards');
  const [line, setLine] = useState(69.5);
  const [direction, setDirection] = useState('over');
  const [venue, setVenue] = useState('ALL');
  const [opponent, setOpponent] = useState('ALL');
  const [windowSize, setWindowSize] = useState('10');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLog, setShowLog] = useState(true);

  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}data/stats.json?v=${Date.now()}`, {cache:'no-store'})
      .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => {
        if (!active) return;
        if (payload.schemaVersion === 1 && payload.status === 'ready' && Array.isArray(payload.players) && payload.players.length && Array.isArray(payload.seasons)) {
          setData(payload);
          setSeason(Math.max(...payload.seasons));
        } else { setError('Live stats have not been imported yet.'); }
      })
      .catch(err => { if (active) setError(`Live data unavailable (${err.message}).`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const players = data.players || [];
  const seasons = data.seasons || [];
  const seasonPlayers = useMemo(() => players.flatMap(p => {
    const latest = (p.games || []).reduce((last, game) =>
      game.season === season && (!last || game.week >= last.week) ? game : last, null);
    return latest ? [{ ...p, team: latest.team || p.team }] : [];
  }), [players, season]);
  const teams = useMemo(() => [...new Set(seasonPlayers.map(p => p.team).filter(Boolean))].sort(), [seasonPlayers]);
  const activeTeam = teams.includes(team) ? team : 'ALL';
  const roster = useMemo(() => activeTeam === 'ALL' ? seasonPlayers :
    seasonPlayers.filter(p => p.team === activeTeam), [seasonPlayers, activeTeam]);
  const player = roster.find(p => p.id === selectedId) ||
    roster.find(p => ['WR','QB','RB','TE'].includes(p.position)) || roster[0];
  useEffect(() => {
    const key = preferredMetric(player?.position);
    setMetric(key);
    setLine(METRICS[key].defaultLine);
  }, [player?.id, player?.position]);

  const onSelectPlayer = id => {
    setSelectedId(id);
    const picked = players.find(p=>p.id===id);
    const key = preferredMetric(picked?.position);
    setMetric(key);
    setLine(METRICS[key].defaultLine);
    setOpponent('ALL'); setVenue('ALL');
  };
  const onMetricChange = key => { setMetric(key); setLine(METRICS[key].defaultLine); };
  const onSeasonChange = next => { setSeason(Number(next)); setOpponent('ALL'); setVenue('ALL'); };

  const opponents = useMemo(() => getDistinctOpponents(player, season), [player, season]);
  const allGames = useMemo(() => getPlayerGames(player, season, opponent, venue), [player, season, opponent, venue]);
  const splitGames = useMemo(() => getPlayerGames(player, season, opponent), [player, season, opponent]);
  const displayed = useMemo(() => filteredWindow(allGames, windowSize), [allGames,windowSize]);
  const last5 = useMemo(() => summarize(filteredWindow(allGames, '5'), metric, line, direction), [allGames,metric,line,direction]);
  const last10 = useMemo(() => summarize(filteredWindow(allGames, '10'), metric, line, direction), [allGames,metric,line,direction]);
  const whole = useMemo(() => summarize(allGames, metric, line, direction), [allGames,metric,line,direction]);
  const current = windowSize === '5' ? last5 : windowSize === '10' ? last10 : whole;
  const isDemo = data.status !== 'ready';
  const updateLabel = data.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Not yet imported';

  return <div className="app">
    
    <header className="topbar">
      <div className="shell topbar-inner">
        <a className="brand" href="/" aria-label="PropBets home"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" />
          <span className="brand-name">Prop<span>Bets</span></span></a>
        <nav className="topnav" aria-label="Primary"><a className="topnav-active" href="#analyzer"><BarChart3 size={16} /> Prop analyzer</a><a href="#game-log">Game log</a><a href="#about">About</a></nav>
        <div className={`data-status ${isDemo ? 'status-demo' : ''}`}><span className="status-light" />{loading ? 'Checking data…' : isDemo ? 'DEMO DATA' : 'NFLVERSE DATA'}</div>
      </div>
    </header>
    <main className="shell" id="analyzer">
      <section className="match-header" aria-label="Selected player and prop">
        <div className="field-lines" aria-hidden="true"/><img className="hero-football" src={import.meta.env.BASE_URL + "football.svg"} alt="" /><div className="match-player">
          <div className="match-context">{season} regular season <span>/</span> {player?.team || 'NFL'} · {player?.position || 'Player'}</div>
          <h1>{player?.name || 'Player props'}</h1>
          <p>{METRICS[metric].label} <b>{direction} {line}</b></p>
        </div>
        <div className="recent-form">
          <span>{allGames.length ? 'Recent games · oldest first' : 'No matching games'}</span>
          <div className="form-tiles">{allGames.slice(-5).map(game => {
            const value = game.stats[metric];
            const result = value === line ? 'Push' : isHit(value, line, direction) ? 'Hit' : 'Miss';
            return <div key={game.gameId} className={`form-tile form-${result.toLowerCase()}`} title={`Week ${game.week} vs ${game.opponent} · ${result}`}>
              <small>W{game.week}</small><b>{value}</b><em>{result}</em>
            </div>;
          })}</div>
        </div>
        <div className="match-form">
          <span>{windowSize === 'season' ? 'Season hit rate' : `Last ${windowSize} hit rate`}</span>
          <strong>{formatRate(current.rate)}</strong>
          <small>{current.hits} of {current.total} matching games</small>
        </div>
      </section>
      {isDemo && <div className="demo-warning" role="status"><Info size={20} /><div><strong>Demo mode — not real NFL statistics.</strong><span>{error || 'This first-run preview uses fictional players and sample game logs.'} Run the <b>Update NFL Data</b> GitHub workflow after publishing to load actual player data.</span></div></div>}
      <div className="workspace"><div className="analysis-rail"><aside className="panel setup" aria-label="Prop settings"><button type="button" className="phone-settings" aria-expanded={settingsOpen} aria-controls="settings-fields" onClick={()=>setSettingsOpen(!settingsOpen)}>
        <span>{settingsOpen ? 'Close prop settings' : 'Edit player & line'}</span>
        <span className="phone-line">{direction} {line} <ChevronDown size={16}/></span>
      </button><div id="settings-fields" className={settingsOpen ? 'settings-fields expanded' : 'settings-fields'}><section className="controls-panel" aria-labelledby="controls-title">
        <div className="section-topline"><div><h2 id="controls-title">Prop settings</h2></div><div className="controls-side"><span className="label-small">SEASON</span><div className="select-wrap"><select value={season} onChange={e=>onSeasonChange(e.target.value)} aria-label="Season">{seasons.map(y=><option key={y} value={y}>{y}</option>)}</select><ChevronDown size={15}/></div></div></div>
        <div className="controls-grid">
          <div className="field"><label htmlFor="team">TEAM</label><div className="select-wrap large-select">
            <select id="team" value={activeTeam} onChange={e => { setTeam(e.target.value); setVenue('ALL'); setOpponent('ALL'); }}>
              <option value="ALL">All teams</option>{teams.map(t => <option key={t}>{t}</option>)}
            </select><ChevronDown size={16}/></div></div>
          <div className="field field-player"><label>PLAYER <span>{!isDemo && <span className="field-quiet">{roster.length.toLocaleString()} searchable</span>}</span></label><PlayerSearch key={`${season}-${activeTeam}`} players={roster} showRoster={activeTeam !== 'ALL'} selected={player} season={season} onSelect={onSelectPlayer} /></div>
          <div className="field"><label>STAT CATEGORY</label><div className="select-wrap large-select"><select value={metric} onChange={e=>onMetricChange(e.target.value)} aria-label="Statistic category">{Object.entries(METRICS).map(([key,m])=><option key={key} value={key}>{m.label}</option>)}</select><ChevronDown size={16}/></div></div>
          <div className="field"><label>OPPONENT</label><div className="select-wrap large-select"><select value={opponent} onChange={e=>setOpponent(e.target.value)} aria-label="Filter by opponent"><option value="ALL">All opponents</option>{opponents.map(o=><option key={o} value={o}>{o}</option>)}</select><ChevronDown size={16}/></div></div>
          <div className="field"><label>LOCATION</label><div className="segmented venue-control"><button type="button" className={venue==='ALL'?'active':''} onClick={()=>setVenue('ALL')}>All</button><button type="button" className={venue==='H'?'active':''} onClick={()=>setVenue('H')}>Home</button><button type="button" className={venue==='A'?'active':''} onClick={()=>setVenue('A')}>Away</button></div></div>
        </div>
      </section>
      <section className="line-panel" aria-labelledby="line-title">
        <div className="line-left"><h2 id="line-title">Prop line</h2></div>
        <div className="line-controls"><div className="segmented direction-switch"><button className={direction==='over'?'active':''} onClick={()=>setDirection('over')} type="button"><ArrowUpRight size={16}/> Over</button><button className={direction==='under'?'active':''} onClick={()=>setDirection('under')} type="button"><ArrowDown size={16}/> Under</button></div><LineSelect key={metric} metric={metric} value={line} onChange={setLine} /></div>
      </section>
      </div></aside>
      <div className="rail-graphics"><VenueSplits games={splitGames} metric={metric} line={line} direction={direction} windowSize={windowSize}/></div>
      </div><div className="results"><section className="hit-section" aria-labelledby="hit-title"><div className="section-header"><div><h2 id="hit-title">Hit rates</h2><p>For <strong>{player?.name || 'the selected player'}</strong> · {METRICS[metric].label.toLowerCase()} {direction} {line} · {opponent==='ALL'?'all opponents':`vs ${opponent}`} · {venue==='ALL'?'all venues':venue==='H'?'home only':'away only'}</p></div></div>
        <div className="stat-grid"><StatCard label="LAST 5" summary={last5} selected={windowSize==='5'} onClick={()=>setWindowSize('5')} /><StatCard label="LAST 10" summary={last10} selected={windowSize==='10'} onClick={()=>setWindowSize('10')} /><StatCard label="FULL SEASON" summary={whole} selected={windowSize==='season'} onClick={()=>setWindowSize('season')} /></div>
      </section>
      <section className="panel chart-panel" aria-labelledby="chart-title">
        <div className="chart-top"><div><h2 id="chart-title">Game-by-game performance</h2><p>{windowSize==='season'?'Full regular season':`Last ${windowSize} matching games`} · {METRICS[metric].label}</p></div><div className="chart-top-right"><div className="legend"><span><i className="legend-hit"/> Hit</span><span><i className="legend-miss"/> Miss</span>{displayed.some(g=>g.stats[metric] === line) && <span><i className="legend-push"/> Push</span>}</div></div></div>
        <PropChart games={displayed} metric={metric} line={line} direction={direction} />
        <div className="chart-note"><Info size={15}/><span>Tap or hover a bar for game details. A hit requires a value strictly {direction==='over'?'above':'below'} the selected line. Filters apply before L5/L10 are calculated.</span></div>
      </section>
      <Matchup players={players} player={player} season={season} metric={metric} line={line} direction={direction} />
      <section className="insights" aria-labelledby="insights-title"><div className="section-header"><div><h2 id="insights-title">Player trends</h2></div></div><Insights games={allGames} metric={metric} line={line} direction={direction} /></section>
      <section className="panel log-panel" id="game-log" aria-labelledby="log-title"><div className="log-heading"><div><h2 id="log-title">Game log</h2><p>All {allGames.length} games matching the filters, newest first.</p></div><button type="button" className="outline-button" aria-expanded={showLog} onClick={()=>setShowLog(x=>!x)}>{showLog ? 'Hide table' : 'Show table'} <ChevronDown size={15} className={showLog?'up':''}/></button></div>{showLog && <GameLog games={allGames} metric={metric} line={line} direction={direction} />}</section>
      </div></div><footer id="about"><div className="footer-top"><div className="footer-logo"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" /><strong>Prop<span>Bets</span></strong></div><div className="footer-status"><ShieldCheck size={16}/>{isDemo ? 'Illustrative demo dataset' : `Data refreshed ${updateLabel}`}</div></div>
        <p>Stats source: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse-data</a>. Current player stats are sourced from the published weekly player-stat releases and updated by a scheduled GitHub workflow. Regular-season games only. No sportsbook odds, injury status, or official betting lines are provided in this version.</p>
        <p className="footer-disclaimer">Historical hit rates are descriptive, not predictions or guarantees. For research and informational use only.</p>
      </footer>
    </main>
  </div>;
}
