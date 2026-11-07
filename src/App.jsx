import HitRate, {rateStyle} from './components/HitRate.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUpRight, BarChart3, Check, ChevronDown,
  ChevronRight, Info, Search, ShieldCheck,
  
} from 'lucide-react';
import { defenseTable } from './lib/matchup.js';
import initialSchedule from './lib/initialSchedule.json';
import { nextGame } from './lib/schedule.js';
import VenueSplits from './components/VenueSplits.jsx';
import { bookLine, priceText, usageFor } from './lib/bookLine.js';
import SportHome,{toolsBySport} from './components/SportHome.jsx';
import CbbBoard from './components/CbbBoard.jsx';
import CbbAnalyzer from './components/CbbAnalyzer.jsx';
import PropsBoard from './components/PropsBoard.jsx';
import LineSelect from './components/LineSelect.jsx';
import Matchup from './components/Matchup.jsx';
import PropChart from './components/PropChart.jsx';
import { demoData } from './lib/demoData.js';
import {
  METRICS, preferredMetric, isHit, summarize, formatNumber,
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
        placeholder={selected ? `${selected.name} · ${selected.team || selected.position}` : 'Search Any NFL Player…'}
        onFocus={() => { setOpen(true); setFocusIndex(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setFocusIndex(0); }}
        onKeyDown={onKeyDown}
      />
      
    </div>
    {open && <div className="search-results" id="player-suggestions" role="listbox">
      <div className="result-header">PLAYERS <span>{results.length ? (showRoster ? 'Team Roster' : 'Top Matches') : 'No Matches'}</span></div>
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
    <div className="stat-card-number"><HitRate rate={summary.rate}/></div>
    <div className="stat-card-footer"><span>{summary.hits} of {summary.total} games</span></div>
    <div className="rate-track" aria-hidden="true"><i style={{...rateStyle(summary.rate), width: `${(summary.rate || 0) * 100}%`}} /></div>
  </button>;
}

function Insights({ games, metric, line, direction }) {
  const summaries = summarize(games, metric, line, direction);
  const lastThree = summarize(games.slice(-3), metric, line, direction);
  const changes = games.length >= 6 ?
    (games.slice(-3).reduce((t,g)=>t+g.stats[metric],0)/3) - (games.slice(-6,-3).reduce((t,g)=>t+g.stats[metric],0)/3) : null;
  return <div className="insight-grid">
    <div className="small-card"><span>Average</span><strong>{formatNumber(summaries.average)}</strong><small>Per Game</small></div>
    <div className="small-card"><span>Median</span><strong>{formatNumber(summaries.median)}</strong><small>Per Game</small></div>
    <div className="small-card"><span>Last 3 Hit Rate</span><strong><HitRate rate={lastThree.rate}/></strong><small>{lastThree.hits}/{lastThree.total} games</small></div>
    <div className="small-card"><span>Recent Trend</span><strong className={changes == null ? '' : changes>=0 ? 'positive' : 'negative'}>{changes == null ? '—' : `${changes >= 0 ? '+' : ''}${changes.toFixed(1)}`}</strong><small>last 3 vs prior 3</small></div>
  </div>;
}

function GameLog({ multi, games, metric, line, direction }) {
  return <div className="game-log-wrap">
    <table className="game-log"><thead><tr><th>Game</th><th>Opponent</th><th>Venue</th><th>{METRICS[metric].short}</th><th>{usageFor(metric).label}</th><th>Result</th></tr></thead>
      <tbody>{[...games].reverse().map((game, i) => {
        const val = Number(game.stats[metric] ?? 0);
        const hit = isHit(val, line, direction);
        return <tr key={`${game.gameId}-${game.week}-${i}`}>
          <td><strong>{multi && `${game.season} · `}W{game.week}</strong></td>
          <td><strong>{game.opponent || '—'}</strong></td>
          <td>{game.venue === 'H' ? <span className="venue-pill">Home</span> : game.venue === 'A' ? <span className="venue-pill away">Away</span> : '—'}</td>
          <td className="table-num">{val}</td><td>{game.usage?.[usageFor(metric).key] ?? "—"}</td>
          <td><span className={`result-pill ${val === line ? 'push' : hit?'hit':'miss'}`}>{val === line ? 'Push' : hit ? 'Hit' : 'Miss'}</span></td>
        </tr>;
      })}</tbody>
    </table>
    {games.length === 0 && <div className="empty-log">No matching games found.</div>}
  </div>;
}

function activePage() {
  return ({'#nfl-home':'nfl-home','#cbb-home':'cbb-home','#analyzer':'analyzer','#game-log':'analyzer',
    '#about':'analyzer','#cbb':'cbb','#props':'board','#best-hit-rates':'best',
    '#cbb-props':'cbb-props','#cbb-best':'cbb-best'})[window.location.hash] || 'home';
}

export default function App() {
  const [page, setPage] = useState(activePage);
  const launch = ['home','nfl-home','cbb-home'].includes(page);
  const cbb = page.startsWith('cbb');
  const nflTool = !launch && !cbb;
  const [initialCbb,setInitialCbb] = useState({});
  const [dark,setDark] = useState(() => {
    try { return localStorage.getItem('propbets-theme') !== 'light'; } catch { return true; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('propbets-theme',dark ? 'dark' : 'light'); } catch {}
  },[dark]);
  useEffect(() => {
    const changePage = () => { setPage(activePage()); window.scrollTo(0,0); };
    window.addEventListener('hashchange',changePage);
    return () => window.removeEventListener('hashchange',changePage);
  },[]);
  const boardSelection = useRef(null);
  const [data, setData] = useState(demoData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [season, setSeason] = useState(2026);
  const [team, setTeam] = useState('ALL');
  const [metric, setMetric] = useState('receivingYards');
  const [custom, setCustom] = useState(null);
  const [bookGames, setBookGames] = useState([]);
  useEffect(() => {
    if (!nflTool) return;
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + 'data/lines.json', {signal:controller.signal, cache:'no-cache'})
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.games)) setBookGames(data.games); })
      .catch(() => {});
    return () => controller.abort();
  }, [nflTool]);
  const [direction, setDirection] = useState('over');
  const [venue, setVenue] = useState('ALL');
  const [opponent, setOpponent] = useState('ALL');
  const [windowSize, setWindowSize] = useState('10');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLog, setShowLog] = useState(true);

  useEffect(() => {
    if (!nflTool || data.status === 'ready') return;
    let active = true;
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}data/stats.json?v=${Date.now()}`, {cache:'no-store'})
      .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => {
        if (!active) return;
        if (payload.schemaVersion === 1 && payload.status === 'ready' && Array.isArray(payload.players) && payload.players.length && Array.isArray(payload.seasons)) {
          setLoading(false);
          setData(payload);
          setSeason(Math.max(...payload.seasons));
        } else { setError('Live stats have not been imported yet.'); }
      })
      .catch(err => { if (active) setError(`Live data unavailable (${err.message}).`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nflTool,data.status]);

  const players = data.players || [];
  const seasons = data.seasons || [];
  const multi = season === 'ALL';
  const seasonLabel = multi ? 'All Seasons' : String(season);
  const seasonPlayers = useMemo(() => players.flatMap(p => {
    const latest = (p.games || []).reduce((last, game) =>
      (season === 'ALL' || game.season === season) && (!last || game.season > last.season || (game.season === last.season && game.week >= last.week)) ? game : last, null);
    return latest ? [{ ...p, team: latest.team || p.team }] : [];
  }), [players, season]);
  const teams = useMemo(() => [...new Set(seasonPlayers.map(p => p.team).filter(Boolean))].sort(), [seasonPlayers]);
  const activeTeam = teams.includes(team) ? team : 'ALL';
  const roster = useMemo(() => activeTeam === 'ALL' ? seasonPlayers :
    seasonPlayers.filter(p => p.team === activeTeam), [seasonPlayers, activeTeam]);
  const player = roster.find(p => p.id === selectedId) ||
    roster.find(p => ['WR','QB','RB','TE'].includes(p.position)) || roster[0];
  useEffect(() => {
    if (boardSelection.current === player?.id) { boardSelection.current=null; return; }
    const key = preferredMetric(player?.position);
    setMetric(key);
    setCustom(null);
  }, [player?.id, player?.position]);

  const onSelectPlayer = id => {
    setSelectedId(id);
    const picked = players.find(p=>p.id===id);
    const key = preferredMetric(picked?.position);
    setMetric(key);
    setCustom(null);
    setOpponent('ALL'); setVenue('ALL');
  };
  const onMetricChange = key => { setMetric(key); setCustom(null); };
  const onSeasonChange = next => { setSeason(next === 'ALL' ? next : Number(next)); if (next === 'ALL') setWindowSize('season'); setOpponent('ALL'); setVenue('ALL'); };

  const isDemo = data.status !== 'ready';
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const scheduleSeason = multi ? Math.max(...seasons) : season;
  const upcoming = !isDemo && player?.seasons?.includes(scheduleSeason) && nextGame(data.schedule ?? initialSchedule, player?.team, scheduleSeason, now);
  const quote = bookLine(bookGames, upcoming, player?.name, metric);
  const lineContext = [player?.id, metric, upcoming?.kickoff].join('|');
  const manual = custom?.context === lineContext;
  const line = manual ? custom.value : quote?.point ?? METRICS[metric].defaultLine;
  const setLine = value => setCustom({context:lineContext, value});
  const defenseRows = useMemo(() => defenseTable(players, season, player?.position, metric), [players, season, player?.position, metric]);
  const opponents = useMemo(() => getDistinctOpponents(player, season), [player, season]);
  const allGames = useMemo(() => getPlayerGames(player, season, opponent, venue), [player, season, opponent, venue]);
  const splitGames = useMemo(() => getPlayerGames(player, season, opponent), [player, season, opponent]);
  const displayed = useMemo(() => filteredWindow(allGames, windowSize), [allGames,windowSize]);
  const last5 = useMemo(() => summarize(filteredWindow(allGames, '5'), metric, line, direction), [allGames,metric,line,direction]);
  const last10 = useMemo(() => summarize(filteredWindow(allGames, '10'), metric, line, direction), [allGames,metric,line,direction]);
  const whole = useMemo(() => summarize(allGames, metric, line, direction), [allGames,metric,line,direction]);
  const current = windowSize === '5' ? last5 : windowSize === '10' ? last10 : whole;
  function openFromBoard(p, market, side, game) {
    const latest = Math.max(...seasons);
    const history = getPlayerGames(p,latest);
    const next = nextGame(data.schedule ?? initialSchedule,history.at(-1)?.team || p.team,latest,now);
    boardSelection.current = p.id !== player?.id ? p.id : null;
    setTeam('ALL'); setSeason(latest); setVenue('ALL'); setOpponent('ALL');
    setSelectedId(p.id); setMetric(market.metric); setDirection(side); setWindowSize('10');
    const saved = bookLine([game],next,p.name,market.metric);
    setCustom(saved?.point === market.point ? null : {context:[p.id,market.metric,next?.kickoff].join('|'),value:market.point});
    setPage('analyzer'); window.location.hash='analyzer'; window.scrollTo(0,0);
  }
  const nextDate = upcoming && new Intl.DateTimeFormat('en-US', {
    weekday:'short', month:'short', day:'numeric', timeZone:'America/New_York',
    ...(upcoming.timeKnown ? {hour:'numeric', minute:'2-digit', timeZoneName:'short'} : {})
  }).format(new Date(upcoming.kickoff));
  const updateLabel = data.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Not yet imported';

  return <div className="app">
    
    <header className="topbar">
      <div className="shell topbar-inner">
        <a className="brand" href="/" aria-label="PropBets home"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" />
          <span className="brand-name">Prop<span>Bets</span></span></a>
        {!launch && <nav className="view-tabs" aria-label="Sport Tools"><a href={cbb?'#cbb-home':'#nfl-home'}>{cbb?'CBB':'NFL'}</a>{toolsBySport[cbb?'cbb':'nfl'].map(([label,path])=><a key={path} href={'#'+path} aria-current={activePage()===page && window.location.hash==='#'+path?'page':undefined}>{label}</a>)}</nav>}
        <button className="theme-button" aria-label={dark?'Switch to light mode':'Switch to dark mode'} onClick={()=>setDark(!dark)}>{dark ? '☀ Light' : '☾ Dark'}</button>
        {!launch && <div className={`data-status ${isDemo ? 'status-demo' : ''}`}><span className="status-light" />{cbb ? 'HOOPR DATA' : loading ? 'Checking data…' : isDemo ? 'DEMO DATA' : 'NFLVERSE DATA'}</div>}
      </div>
    </header>
    <main className="shell" id="analyzer">
      {launch ? <SportHome sport={page==='home'?null:(cbb?'cbb':'nfl')}/> :
       page==='cbb' ? <CbbAnalyzer initial={initialCbb}/> :
       cbb ? <CbbBoard key={page} ranked={page==='cbb-best'} onOpen={pick=>{setInitialCbb(pick);window.location.hash='cbb';}}/> :
       page!=='analyzer' ? <PropsBoard key={page} ranked={page==='best'} games={bookGames} players={players} season={Math.max(...seasons)} now={now} onOpen={openFromBoard}/> : <>
      <section className="match-header" aria-label="Selected player and prop">
        <div className="field-lines" aria-hidden="true"/><img className="hero-football" src={import.meta.env.BASE_URL + "football.svg"} alt="" /><div className="match-player">
          <div className="match-context">{multi ? `All Seasons · ${Math.min(...seasons)}–${Math.max(...seasons)}` : `${season} regular season`} <span>/</span> {player?.team || 'NFL'} · {player?.position || 'Player'}</div>
          <h1>{player?.name || 'Player props'}</h1>
          <p>{METRICS[metric].label} <b>{direction} {line}</b></p>
          {!isDemo && <div className="next-match"><span>Next Game</span>
            {upcoming ? <><strong>vs {upcoming.name}</strong><small>{upcoming.venue} · {nextDate}{upcoming.timeKnown ? '' : ' · Time TBD'}</small></> :
              <small>No upcoming game listed for {scheduleSeason}.</small>}
          </div>}
        </div>
        <div className="recent-form">
          <span>{allGames.length ? 'Recent Games · Oldest First' : 'No matching games'}</span>
          <div className="form-tiles">{allGames.slice(-5).map(game => {
            const value = game.stats[metric];
            const result = value === line ? 'Push' : isHit(value, line, direction) ? 'Hit' : 'Miss';
            return <div key={game.gameId} className={`form-tile form-${result.toLowerCase()}`} title={`Week ${game.week} vs ${game.opponent} · ${result}`}>
              <small>{multi && `${String(game.season).slice(-2)} · `}W{game.week}</small><b>{value}</b><em>{result}</em>
            </div>;
          })}</div>
        </div>
        <div className="match-form">
          <span>{windowSize === 'season' ? (multi ? 'All Seasons hit rate' : 'Season Hit Rate') : `Last ${windowSize} Hit Rate`}</span>
          <strong><HitRate rate={current.rate}/></strong>
          <small>{current.hits} of {current.total} matching games</small>
        </div>
      </section>
      {isDemo && <div className="demo-warning" role="status"><Info size={20} /><div><strong>Demo mode — not real NFL statistics.</strong><span>{error || 'This first-run preview uses fictional players and sample game logs.'} Run the <b>Update NFL Data</b> GitHub workflow after publishing to load actual player data.</span></div></div>}
      <div className="workspace"><div className="analysis-rail"><aside className="panel setup" aria-label="Prop Settings"><button type="button" className="phone-settings" aria-expanded={settingsOpen} aria-controls="settings-fields" onClick={()=>setSettingsOpen(!settingsOpen)}>
        <span>{settingsOpen ? 'Close Prop Settings' : 'Edit Player & Line'}</span>
        <span className="phone-line">{direction} {line} <ChevronDown size={16}/></span>
      </button><div id="settings-fields" className={settingsOpen ? 'settings-fields expanded' : 'settings-fields'}><section className="controls-panel" aria-labelledby="controls-title">
        <div className="section-topline"><div><h2 id="controls-title">Prop Settings</h2></div><div className="controls-side"><span className="label-small">Season</span><div className="select-wrap"><select value={season} onChange={e=>onSeasonChange(e.target.value)} aria-label="Season"><option value="ALL">All Seasons</option>{seasons.map(y=><option key={y} value={y}>{y}</option>)}</select><ChevronDown size={15}/></div></div></div>
        <div className="controls-grid">
          <div className="field"><label htmlFor="team">Team</label><div className="select-wrap large-select">
            <select id="team" value={activeTeam} onChange={e => { setTeam(e.target.value); setVenue('ALL'); setOpponent('ALL'); }}>
              <option value="ALL">All Teams</option>{teams.map(t => <option key={t}>{t}</option>)}
            </select><ChevronDown size={16}/></div></div>
          <div className="field field-player"><label>Player <span>{!isDemo && <span className="field-quiet">{roster.length.toLocaleString()} searchable</span>}</span></label><PlayerSearch key={`${season}-${activeTeam}`} players={roster} showRoster={activeTeam !== 'ALL'} selected={player} season={season} onSelect={onSelectPlayer} /></div>
          <div className="field"><label>Stat Category</label><div className="select-wrap large-select"><select value={metric} onChange={e=>onMetricChange(e.target.value)} aria-label="Statistic category">{Object.entries(METRICS).map(([key,m])=><option key={key} value={key}>{m.label}</option>)}</select><ChevronDown size={16}/></div></div>
          <div className="field"><label>Opponent</label><div className="select-wrap large-select"><select value={opponent} onChange={e=>setOpponent(e.target.value)} aria-label="Filter by opponent"><option value="ALL">All Opponents</option>{opponents.map(o=><option key={o} value={o}>{o}</option>)}</select><ChevronDown size={16}/></div></div>
          <div className="field"><label>Location</label><div className="segmented venue-control"><button type="button" className={venue==='ALL'?'active':''} onClick={()=>setVenue('ALL')}>All</button><button type="button" className={venue==='H'?'active':''} onClick={()=>setVenue('H')}>Home</button><button type="button" className={venue==='A'?'active':''} onClick={()=>setVenue('A')}>Away</button></div></div>
        </div>
      </section>
      <section className="line-panel" aria-labelledby="line-title">
        <div className="line-left"><h2 id="line-title">Prop Line</h2></div>
        <div className="line-controls"><div className="segmented direction-switch"><button className={direction==='over'?'active':''} onClick={()=>setDirection('over')} type="button"><ArrowUpRight size={16}/> Over</button><button className={direction==='under'?'active':''} onClick={()=>setDirection('under')} type="button"><ArrowDown size={16}/> Under</button></div><LineSelect key={metric} metric={metric} value={line} onChange={setLine} /></div>
        {quote && <div className="quote-prices"><b>DK {quote.point}</b><span>Over <strong>{priceText(quote.over)}</strong></span><span>Under <strong>{priceText(quote.under)}</strong></span></div>}
        <p className="book-source">{manual ? 'Custom Line' : quote ? 'DraftKings Pregame Line' : 'Preset Line · No Sportsbook Quote Available'}
          {quote && <> · {quote.point} on DraftKings · {new Date(quote.updated).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</>}
          {manual && quote && <button type="button" onClick={()=>setCustom(null)}>Use Book Line</button>}
        </p>
      </section>
      </div></aside>
      <div className="rail-graphics"><VenueSplits multi={multi} games={splitGames} metric={metric} line={line} direction={direction} windowSize={windowSize}/></div>
      </div><div className="results"><section className="hit-section" aria-labelledby="hit-title"><div className="section-header"><div><h2 id="hit-title">Hit Rates</h2><p>For <strong>{player?.name || 'the selected player'}</strong> · {METRICS[metric].label.toLowerCase()} {direction} {line} · {opponent==='ALL'?'All Opponents':`vs ${opponent}`} · {venue==='ALL'?'All Venues':venue==='H'?'Home Only':'Away Only'}</p></div></div>
        <div className="stat-grid"><StatCard label="Last 5" summary={last5} selected={windowSize==='5'} onClick={()=>setWindowSize('5')} /><StatCard label="Last 10" summary={last10} selected={windowSize==='10'} onClick={()=>setWindowSize('10')} /><StatCard label={multi ? "All Seasons" : "Full Season"} summary={whole} selected={windowSize==='season'} onClick={()=>setWindowSize('season')} /></div>
      </section>
      <section className="panel chart-panel" aria-labelledby="chart-title">
        <div className="chart-top"><div><h2 id="chart-title">Game-by-Game Performance</h2><p>{windowSize==='season'?(multi ? 'All Regular Seasons' : 'Full Regular Season'):`Last ${windowSize} matching games`} · {METRICS[metric].label}</p></div><div className="chart-top-right"><div className="legend"><span><i className="legend-hit"/> Hit</span><span><i className="legend-miss"/> Miss</span>{displayed.some(g=>g.stats[metric] === line) && <span><i className="legend-push"/> Push</span>}</div></div></div>
        <PropChart multi={multi} defenses={defenseRows} games={displayed} metric={metric} line={line} direction={direction} />
        <div className="chart-note"><Info size={15}/><span>DEF shows the opponent’s rank for {seasonLabel.toLowerCase()} using all games in that period. #1 allows the most {METRICS[metric].label.toLowerCase()} Per Game to {player?.position || "this position"}. A hit requires a value strictly {direction==='over'?'above':'below'} the selected line. Filters apply before L5/L10 are calculated.</span></div>
      </section>
      <Matchup key={`${player?.team}-${season}`} upcomingOpponent={upcoming?.opponent} rows={defenseRows} player={player} season={season} metric={metric} line={line} direction={direction} />
      <section className="insights" aria-labelledby="insights-title"><div className="section-header"><div><h2 id="insights-title">Player Trends</h2></div></div><Insights games={allGames} metric={metric} line={line} direction={direction} /></section>
      <section className="panel log-panel" data-multi-season={multi} id="game-log" aria-labelledby="log-title"><div className="log-heading"><div><h2 id="log-title">Game Log</h2><p>All {allGames.length} games matching the filters, newest first.</p></div><button type="button" className="outline-button" aria-expanded={showLog} onClick={()=>setShowLog(x=>!x)}>{showLog ? 'Hide Table' : 'Show Table'} <ChevronDown size={15} className={showLog?'up':''}/></button></div>{showLog && <GameLog multi={multi} games={allGames} metric={metric} line={line} direction={direction} />}</section>
      </div></div></>}{nflTool && <footer id="about"><div className="footer-top"><div className="footer-logo"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" /><strong>Prop<span>Bets</span></strong></div><div className="footer-status"><ShieldCheck size={16}/>{isDemo ? 'Illustrative demo dataset' : `Data refreshed ${updateLabel}`}</div></div>
        <p>Stats source: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse-data</a>. Current player stats are sourced from the published weekly player-stat releases and updated by a scheduled GitHub workflow. Regular-season games only. Available DraftKings pregame lines are sourced from The Odds API.</p>
        <p className="footer-disclaimer">Historical Hit Rates are descriptive, not predictions or guarantees. For research and informational use only.</p>
      </footer>}
    </main>
  </div>;
}
