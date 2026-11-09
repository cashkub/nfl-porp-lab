import {useChartSlate} from './components/ChartSlate.jsx';
import NflCharts,{chartMarkets} from './components/NflCharts.jsx';
import NflPropList from './components/NflPropList.jsx';
import TopLooks from './components/TopLooks.jsx';
import NflGames from './components/NflGames.jsx';
import FilterMenu from './components/FilterMenu.jsx';
import PlayerStepper from './components/PlayerStepper.jsx';
import GameFilter, {useGameFilter} from './components/GameFilter.jsx';
import SortableTable from './components/SortableTable.jsx';
import PlayerPhoto from './components/PlayerPhoto.jsx';
import {ManualLeague} from './components/ManualLeague.jsx';
import {teamColor} from './lib/teamColors.js';
import TrackedPicks from './components/TrackedPicks.jsx';
import StatCard from './components/StatCard.jsx';
import {availableStats} from './lib/availableStats.js';
import ModelRecord from './components/ModelRecord.jsx';
import HitRate from './components/HitRate.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUpRight, BarChart3, ChevronDown,
  ChevronRight, Info, Search, ShieldCheck,
  
} from 'lucide-react';
import { defenseTable } from './lib/matchup.js';
import initialSchedule from './lib/initialSchedule.json';
import { nextGame } from './lib/schedule.js';
import VenueSplits from './components/VenueSplits.jsx';
import { bookLine, priceText, usageFor } from './lib/bookLine.js';
import {CbbGames,Moneylines,UsageTrends} from './components/Research.jsx';
import SportHome,{toolsBySport} from './components/SportHome.jsx';
import CbbBoard from './components/CbbBoard.jsx';
import CbbAnalyzer from './components/CbbAnalyzer.jsx';
import PropsBoard from './components/PropsBoard.jsx';
import LineSelect from './components/LineSelect.jsx';
import Matchup from './components/Matchup.jsx';
import PropChart from './components/PropChart.jsx';
import { demoData } from './lib/demoData.js';
import {
  METRICS, preferredMetric, isHit, summarize,
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
  const matches = useMemo(() => {
    const term = query.toLowerCase().trim();
    const ranked = players.filter(p => !term || `${p.name} ${p.team} ${p.position}`.toLowerCase().includes(term));
    return ranked.sort((a, b) => {
      const active = Number(b.seasons?.includes(season)) - Number(a.seasons?.includes(season));
      if (active) return active;
      const aStarts = a.name.toLowerCase().startsWith(term);
      const bStarts = b.name.toLowerCase().startsWith(term);
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name);
    });
  }, [players, query, season]);
  const results = showRoster ? matches : matches.slice(0,10);
  const choose = player => { onSelect(player.id); setOpen(false); setQuery(''); };
  const onKeyDown = event => {
    if (!open && ['ArrowDown','Enter'].includes(event.key)) { setOpen(true); return; }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'ArrowDown') { event.preventDefault(); setFocusIndex(i => Math.min(i + 1, results.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); }
    if (event.key === 'Enter' && open && results[focusIndex]) { event.preventDefault(); choose(results[focusIndex]); }
  };
  return <PlayerStepper choices={matches.map(p=>p.id)} value={selected?.id} onSelect={id=>{onSelect(id);setOpen(false);setQuery('');}}>
    <div className="player-picker"  ref={wrap}>
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
  </div></PlayerStepper>;
}


function GameLog({ multi, games, metric, line, direction }) {
  return <div className="game-log-wrap">
    <SortableTable headers={['Game','Opponent','Venue',METRICS[metric].short,usageFor(metric).label,'Result']} rows={[...games].reverse()}
      values={g=>[Number(g.season)*100+Number(g.week),g.opponent,g.venue,g.stats[metric],g.usage?.[usageFor(metric).key],g.stats[metric]===line?'Push':isHit(g.stats[metric],line,direction)?'Hit':'Miss']}
      descending={[0,3,4]} renderRow={(game,i)=>{
        const val = Number(game.stats[metric] ?? 0);
        const hit = isHit(val, line, direction);
        return <tr key={`${game.gameId}-${game.week}-${i}`}>
          <td><strong>{multi && `${game.season} · `}W{game.week}</strong></td>
          <td><strong>{game.opponent || '—'}</strong></td>
          <td>{game.venue === 'H' ? <span className="venue-pill">Home</span> : game.venue === 'A' ? <span className="venue-pill away">Away</span> : '—'}</td>
          <td className="table-num">{val}</td><td>{game.usage?.[usageFor(metric).key] ?? "—"}</td>
          <td><span className={`result-pill ${val === line ? 'push' : hit?'hit':'miss'}`}>{val === line ? 'Push' : hit ? 'Hit' : 'Miss'}</span></td>
        </tr>;
      }}/>
    {games.length === 0 && <div className="empty-log">No matching games found.</div>}
  </div>;
}

function activePage(hash=window.location.hash) {
  const manual=hash.slice(1).match(/^(nba|cfb)(-home|-top-eight|-games|-props|-record)?$/);
  if(manual)return manual[1]+(manual[2]==='-top-eight'?'-top':manual[2] || '');
  return ({'#prop-lists':'prop-lists','#nfl-games':'nfl-games','#nfl-home':'nfl-home','#cbb-home':'cbb-home','#analyzer':'analyzer','#game-log':'analyzer',
    '#about':'analyzer','#cbb':'cbb','#props':'board','#best-hit-rates':'board',
    '#top-eight':'nfl-top','#cbb-top-eight':'cbb-top','#top-five':'nfl-top','#model-record':'model-record','#cbb-record':'cbb-record','#moneylines':'moneylines','#cbb-top':'cbb-top','#cbb-games':'cbb-games','#cbb-props':'cbb-props','#cbb-best':'cbb-props'})[hash] || 'home';
}

export default function App() {
  const [page, setPage] = useState(activePage);
  const propListReturn=useRef(null);
  useLayoutEffect(()=>{
    if(page==='prop-lists' && propListReturn.current){
      window.scrollTo({top:propListReturn.current.top,behavior:'instant'});
    }
  },[page]);
  const launch = page==='home' || page.endsWith('-home');
  const sport = ['cbb','nba','cfb'].find(s=>page.startsWith(s)) || 'nfl';
  const manualLeague = sport!=='nfl';
  const nflTool = !launch && !manualLeague;
  const previewTools=new URLSearchParams(window.location.search).get('view')==='nfl';
  useEffect(()=>{
    if(previewTools && !['analyzer','prop-lists','nfl-top'].includes(page))window.location.replace('/preview/nfl/');
  },[previewTools,page]);
  const [initialCbb,setInitialCbb] = useState({});
  const [dark,setDark] = useState(() => {
    try { return localStorage.getItem('propbets-theme') !== 'light'; } catch { return true; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('propbets-theme',dark ? 'dark' : 'light'); } catch {}
  },[dark]);
  useEffect(() => {
    const changePage = () => {
      const next=activePage();
      if(next!=='prop-lists' || !propListReturn.current)window.scrollTo(0,0);
      setPage(next);
    };
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
  const [requestedMetric, setMetric] = useState('receivingYards');
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

  useEffect(() => {
    if (!previewTools || data.status !== 'ready') return;
    const hasTouches = payload => payload.players?.some(p => p.games?.some(g => g.scoringChances?.length >= 5));
    if (hasTouches(data)) return;
    const controller = new AbortController();
    let pending = false;
    async function refreshTouches() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'data/stats.json?v=' + Date.now(),
          {cache:'no-store', signal:controller.signal});
        if (response.ok) {
          const payload = await response.json();
          if (!controller.signal.aborted && payload.status === 'ready' && hasTouches(payload)) setData(payload);
        }
      } catch {
        // Keep the selected player and retry on the next check.
      } finally {
        pending = false;
      }
    }
    const timer = window.setInterval(refreshTouches, 60000);
    document.addEventListener('visibilitychange', refreshTouches);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshTouches);
    };
  }, [previewTools, data]);

  const markets=previewTools ? chartMarkets : METRICS;
  const players=useMemo(()=>{
    const source=data.players || [];
    if(!previewTools)return source;
    return source.map(p=>({...p,games:p.games.map(g=>({...g,date:data.gameDates?.[g.gameId] ?? g.date,stats:{...g.stats,
      scrimmageYards:(g.stats?.rushingYards ?? 0)+(g.stats?.receivingYards ?? 0)}}))}));
  },[data.players,data.gameDates,previewTools]);
  const seasons = data.seasons || [];
  const multi = season === 'ALL';
  const seasonLabel = multi ? 'All Seasons' : String(season);
  const seasonPlayers = useMemo(() => players.flatMap(p => {
    const history=getPlayerGames(p,season);
    if(!availableStats(METRICS,history).length)return [];
    const latest=history.at(-1);
    return [{...p,team:latest.team || p.team}];
  }), [players, season]);
  const slateSeason = multi || page!=='analyzer' ? Math.max(...seasons) : season;
  const nflSchedule = useMemo(()=>(data.schedule ?? initialSchedule).filter(g=>g.season===slateSeason),[data.schedule,slateSeason]);
  const gameFilter = useGameFilter('nfl',slateSeason,nflSchedule);
  const normalizeTeam = team => ({LA:'LAR',WSH:'WAS',JAC:'JAX'}[team] || team);
  const chartSlate=useChartSlate(previewTools?nflSchedule:[],Date.now());
  const scope=previewTools?chartSlate:gameFilter;
  const scopedPlayers=seasonPlayers.filter(p=>scope.allows(normalizeTeam(p.team)));
  const teams = useMemo(() => [...new Set(scopedPlayers.map(p => p.team).filter(Boolean))].sort(), [scopedPlayers]);
  const activeTeam = teams.includes(team) ? team : 'ALL';
  const roster = useMemo(() => activeTeam === 'ALL' ? scopedPlayers :
    scopedPlayers.filter(p => p.team === activeTeam), [scopedPlayers, activeTeam]);
  const player = roster.find(p => p.id === selectedId) ||
    roster.find(p => ['WR','QB','RB','TE'].includes(p.position)) || roster[0];
  const statOptions=useMemo(()=>availableStats(markets,getPlayerGames(player,season)),[markets,player,season]);
  const metric=statOptions.includes(requestedMetric)?requestedMetric:statOptions[0] || 'receivingYards';
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
    setOpponent('ALL'); if(!previewTools)setVenue('ALL');
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
  const contextSchedule=previewTools ? (chartSlate.game?[chartSlate.game]:chartSlate.games) : gameFilter.game?[gameFilter.game]:nflSchedule;
  const upcoming = !isDemo && player?.seasons?.includes(scheduleSeason) && nextGame(contextSchedule, player?.team, scheduleSeason, previewTools || gameFilter.game ? -Infinity : now);
  const quote = bookLine(bookGames, upcoming, player?.name, metric);
  const lineContext = [player?.id, metric, upcoming?.kickoff].join('|');
  const manual = custom?.context === lineContext;
  const line = manual ? custom.value : quote?.point ?? (previewTools?null:markets[metric].defaultLine);
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
    if (!gameFilter.allows(normalizeTeam(history.at(-1)?.team || p.team))) gameFilter.select('');
    const next = gameFilter.game && gameFilter.allows(normalizeTeam(history.at(-1)?.team || p.team)) ? gameFilter.game : nextGame(data.schedule ?? initialSchedule,history.at(-1)?.team || p.team,latest,now);
    boardSelection.current = p.id !== player?.id ? p.id : null;
    setTeam('ALL'); setSeason(latest); setVenue('ALL'); setOpponent('ALL');
    setSelectedId(p.id); setMetric(market.metric); setDirection(side); setWindowSize('10');
    const saved = bookLine([game],next,p.name,market.metric);
    setCustom(saved?.point === market.point ? null : {context:[p.id,market.metric,next?.kickoff].join('|'),value:market.point});
    setPage('analyzer'); window.location.hash='analyzer'; window.scrollTo(0,0);
  }
  function openTopLookChart(p, market, side, game) {
    const latest=Math.max(...seasons);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.kickoff));
    setTeam('ALL');setSeason(latest);setVenue('ALL');setOpponent('ALL');setWindowSize('10');
    setSelectedId(p.id);setMetric(market.metric);setDirection(side);
    setCustom({context:[p.id,market.metric,game.kickoff].join('|'),value:market.point,source:'DraftKings'});
    if(previewTools){chartSlate.changeWeek(String(game.week));chartSlate.changeMatch(game.id);}
    else gameFilter.select(day,[day,game.away,game.home].join('|'));
    setPage('analyzer');window.location.hash='analyzer';window.scrollTo(0,0);
  }
  const nextDate = upcoming && new Intl.DateTimeFormat('en-US', {
    weekday:'short', month:'short', day:'numeric', timeZone:'America/New_York',
    ...(upcoming.timeKnown ? {hour:'numeric', minute:'2-digit', timeZoneName:'short'} : {})
  }).format(new Date(upcoming.kickoff));
  const updateLabel = data.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Not yet imported';

  if(previewTools){
    if(page==='nfl-top')return <ManualLeague.Provider value="nfl"><TopLooks players={players} schedule={nflSchedule} books={bookGames} season={scheduleSeason} now={now} loading={loading} error={error} onOpen={openTopLookChart}/></ManualLeague.Provider>;
    if(page!=='prop-lists' && page!=='analyzer')return <a href="/preview/nfl/">NFL Menu</a>;
    return <ManualLeague.Provider value="nfl">
      {(page==='prop-lists' || propListReturn.current) && <div hidden={page!=='prop-lists'}>
      <NflPropList players={players} roster={seasonPlayers}
      schedule={nflSchedule} season={scheduleSeason} books={bookGames} markets={chartMarkets} now={now} loading={loading} error={error}
      onOpen={({player:p,game,metric:key,quote:saved,point},side,historyVenue)=>{
        propListReturn.current={top:window.scrollY};
        chartSlate.changeWeek(String(game.week));chartSlate.changeMatch(game.id);
        boardSelection.current=p.id!==player?.id?p.id:null;
        setTeam('ALL');setVenue(historyVenue);setOpponent('ALL');setWindowSize('10');
        setSelectedId(p.id);setMetric(key);setDirection(side);
        setCustom(saved?null:{context:[p.id,key,game.kickoff].join('|'),value:point,source:'Player Average'});
        window.location.hash='analyzer';
      }}/></div>}
      {page==='analyzer' && <NflCharts players={players} seasons={seasons} nextFixture={nextGame(nflSchedule,player?.team,scheduleSeason,now)} slate={chartSlate} venue={venue} onVenue={setVenue} resetLine={()=>setCustom(null)} player={player} roster={roster} onPlayer={onSelectPlayer} season={season} markets={statOptions}
      metric={metric} onMetric={onMetricChange} line={line} setLine={setLine} quote={quote} manual={manual} manualLabel={custom?.source || 'Custom Line'} direction={direction} setDirection={setDirection}
      windowSize={windowSize} setWindowSize={setWindowSize} upcoming={upcoming} defenses={defenseRows}
      loading={loading} error={error}/>}</ManualLeague.Provider>;
  }
  return <ManualLeague.Provider value={sport}><div className="app" data-sport={page==='home'?undefined:sport}>
    
    <header className="topbar">
      <div className="shell topbar-inner">
        <a className="brand" href="/" aria-label="PropBets home"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" />
          <span className="brand-name">Prop<span>Bets</span></span></a>
        {!launch && <nav className="view-tabs" aria-label="Sport Tools"><a href={'#'+sport+'-home'}>{sport.toUpperCase()}</a>{toolsBySport[sport].map(([label,path])=><a key={path} href={'#'+path} aria-current={activePage('#'+path)===page?'page':undefined}>{label}</a>)}</nav>}
        <button className="theme-button" aria-label={dark?'Switch to light mode':'Switch to dark mode'} onClick={()=>setDark(!dark)}>{dark ? '☀ Light' : '☾ Dark'}</button>
        {!launch && <div className={`data-status ${!manualLeague && isDemo ? 'status-demo' : ''}`}><span className="status-light" />{manualLeague ? (sport==='cfb'?'CFBFASTR DATA':'HOOPR DATA') : loading ? 'Checking data…' : isDemo ? 'DEMO DATA' : 'NFLVERSE DATA'}</div>}
      </div>
    </header>
    <main className={page==='analyzer'||page===sport?'shell analyzer-shell':'shell'} id="analyzer">
      {launch ? <SportHome sport={page==='home'?null:sport}/> :
       manualLeague && page===sport ? <CbbAnalyzer key={sport} initial={initialCbb.sport===sport?initialCbb:{}}/> :
       (page==='model-record'||page===sport+'-record') ? <ModelRecord key={page} sport={sport} validation={manualLeague?null:data.modelValidation}/> :
       page==='nfl-top' ? <TopLooks players={players} schedule={nflSchedule} books={bookGames} season={scheduleSeason} now={now} loading={loading} error={error} onOpen={openTopLookChart}/> :
       page==='nfl-games' ? <NflGames schedule={isDemo?[]:data.schedule} books={bookGames} players={players} season={Math.max(...seasons)} now={now} onOpen={openFromBoard} updated={updateLabel} loading={loading} error={error}/> :
       page==='moneylines' ? <Moneylines games={data.schedule} now={now} updated={updateLabel}/> :
       manualLeague && page===sport+'-games' ? <CbbGames key={sport}/> :
       manualLeague ? <CbbBoard top={page===sport+'-top'} key={page} initialRanked={window.location.hash==='#cbb-best'} onOpen={pick=>{setInitialCbb({...pick,sport});window.location.hash=sport;}}/> :
       page!=='analyzer' ? <PropsBoard gameFilter={gameFilter} key={page} initialRanked={window.location.hash==='#best-hit-rates'} games={bookGames} schedule={data.schedule} players={players} season={Math.max(...seasons)} now={now} onOpen={openFromBoard}/> : <>
      <section className="match-header team-banner" style={{'--team-color':teamColor(player?.team)}} aria-label="Selected player and prop">
        <div className="field-lines" aria-hidden="true"/><img className="hero-football" src={import.meta.env.BASE_URL + "football.svg"} alt="" /><div className="match-player">
          <div className="match-context">{multi ? `All Seasons · ${Math.min(...seasons)}–${Math.max(...seasons)}` : `${season} regular season`} <span>/</span> {player?.team || 'NFL'} · {player?.position || 'Player'}</div>
          <h1 className="player-title">{player && <PlayerPhoto large id={player.id} name={player.name} url={player.photo}/>} {player?.name || 'Player props'}</h1>
          <p>{statOptions.length?<>{METRICS[metric].label} <b>{direction} {line}</b></>:'No recorded prop categories this season.'}</p>
          {!isDemo && <div className="next-match"><span>{gameFilter.game ? 'Selected Game' : 'Next Game'}</span>
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
        <span>{settingsOpen ? 'Fewer Filters' : 'More Filters'}</span>
        <ChevronDown size={16}/>
      </button><div id="settings-fields" className={settingsOpen ? 'settings-fields expanded' : 'settings-fields'}><section className="controls-panel" aria-labelledby="controls-title">
        <div className="section-topline"><div><h2 id="controls-title">Prop Settings</h2></div><div className="controls-side"><span className="label-small">Season</span><div className="select-wrap"><FilterMenu value={season} onChange={e=>onSeasonChange(e.target.value)} aria-label="Season"><option value="ALL">All Seasons</option>{seasons.map(y=><option key={y} value={y}>{y}</option>)}</FilterMenu><ChevronDown size={15}/></div></div></div>
        <div className="board-controls"><GameFilter filter={gameFilter} onChange={()=>setTeam('ALL')}/></div><div className="controls-grid">
          <div className="field"><label htmlFor="team">Team</label><div className="select-wrap large-select">
            <FilterMenu id="team" value={activeTeam} onChange={e => { setTeam(e.target.value); setVenue('ALL'); setOpponent('ALL'); }}>
              <option value="ALL">All Teams</option>{teams.map(t => <option key={t}>{t}</option>)}
            </FilterMenu><ChevronDown size={16}/></div></div>
          <div className="field field-player"><label>Player <span>{!isDemo && <span className="field-quiet">{roster.length.toLocaleString()} searchable</span>}</span></label><PlayerSearch key={`${season}-${activeTeam}`} players={roster} showRoster={activeTeam !== 'ALL' || Boolean(gameFilter.game)} selected={player} season={season} onSelect={onSelectPlayer} /></div>
          <div className="field"><label>Stat Category</label><div className="select-wrap large-select"><FilterMenu value={metric} onChange={e=>onMetricChange(e.target.value)} aria-label="Statistic category">{statOptions.map(key=><option key={key} value={key}>{METRICS[key].label}</option>)}</FilterMenu><ChevronDown size={16}/></div></div>
          <div className="field extra-filter"><label>Opponent</label><div className="select-wrap large-select"><FilterMenu value={opponent} onChange={e=>setOpponent(e.target.value)} aria-label="Filter by opponent"><option value="ALL">All Opponents</option>{opponents.map(o=><option key={o} value={o}>{o}</option>)}</FilterMenu><ChevronDown size={16}/></div></div>
          <div className="field extra-filter"><label>Location</label><div className="segmented venue-control"><button type="button" className={venue==='ALL'?'active':''} onClick={()=>setVenue('ALL')}>All</button><button type="button" className={venue==='H'?'active':''} onClick={()=>setVenue('H')}>Home</button><button type="button" className={venue==='A'?'active':''} onClick={()=>setVenue('A')}>Away</button></div></div>
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
      <UsageTrends games={displayed} label={usageFor(metric).label} value={g=>g.usage?.[usageFor(metric).key]}/>
      </div><div className="results">{!statOptions.length?<p>No recorded categories for this player and season.</p>:<><section className="hit-section" aria-labelledby="hit-title"><div className="section-header"><div><h2 id="hit-title">Hit Rates</h2><p>For <strong>{player?.name || 'the selected player'}</strong> · {METRICS[metric].label.toLowerCase()} {direction} {line} · {opponent==='ALL'?'All Opponents':`vs ${opponent}`} · {venue==='ALL'?'All Venues':venue==='H'?'Home Only':'Away Only'}</p></div></div>
        <div className="stat-grid"><StatCard label="Last 5" summary={last5} selected={windowSize==='5'} onClick={()=>setWindowSize('5')} /><StatCard label="Last 10" summary={last10} selected={windowSize==='10'} onClick={()=>setWindowSize('10')} /><StatCard label={multi ? "All Seasons" : "Full Season"} summary={whole} selected={windowSize==='season'} onClick={()=>setWindowSize('season')} /></div>
      </section>
      <section className="panel chart-panel" aria-labelledby="chart-title">
        <div className="chart-top"><div><h2 id="chart-title">Game-by-Game Performance</h2><p>{windowSize==='season'?(multi ? 'All Regular Seasons' : 'Full Regular Season'):`Last ${windowSize} matching games`} · {METRICS[metric].label}</p></div><div className="chart-top-right"><div className="legend"><span><i className="legend-hit"/> Hit</span><span><i className="legend-miss"/> Miss</span>{displayed.some(g=>g.stats[metric] === line) && <span><i className="legend-push"/> Push</span>}</div></div></div>
        <PropChart multi={multi} defenses={defenseRows} rankCount={defenseRows.length} games={displayed} metric={metric} line={line} direction={direction} />
        <div className="chart-note"><Info size={15}/><span>DEF shows the opponent’s rank for {seasonLabel.toLowerCase()} using all games in that period. A hit requires a value strictly {direction==='over'?'above':'below'} the selected line. Filters apply before L5/L10 are calculated.</span></div>
      </section>
      <Matchup key={`${player?.team}-${season}`} upcomingOpponent={upcoming?.opponent} rows={defenseRows} player={player} season={season} metric={metric} line={line} direction={direction} />
      </>}</div></div>{statOptions.length>0 && <div className="analyzer-bottom"><section className="panel log-panel" data-multi-season={multi} id="game-log" aria-labelledby="log-title"><div className="log-heading"><div><h2 id="log-title">Game Log</h2><p>All {allGames.length} games matching the filters, newest first.</p></div><button type="button" className="outline-button" aria-expanded={showLog} onClick={()=>setShowLog(x=>!x)}>{showLog ? 'Hide Table' : 'Show Table'} <ChevronDown size={15} className={showLog?'up':''}/></button></div>{showLog && <GameLog multi={multi} games={allGames} metric={metric} line={line} direction={direction} />}</section>
      </div>}</>}{nflTool && <footer id="about"><div className="footer-top"><div className="footer-logo"><img className="brand-mark" src={import.meta.env.BASE_URL + "favicon.svg?v=3"} alt="" /><strong>Prop<span>Bets</span></strong></div><div className="footer-status"><ShieldCheck size={16}/>{isDemo ? 'Illustrative demo dataset' : `Data refreshed ${updateLabel}`}</div></div>
        <p>Stats source: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse-data</a>. Current player stats are sourced from the published weekly player-stat releases and updated by a scheduled GitHub workflow. Regular-season games only. Available DraftKings pregame lines are sourced from The Odds API.</p>
        <p className="footer-disclaimer">Historical Hit Rates are descriptive, not predictions or guarantees. For research and informational use only.</p>
      </footer>}
    </main>
  </div></ManualLeague.Provider>;
}
