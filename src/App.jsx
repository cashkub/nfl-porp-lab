import {useChartSlate} from './components/ChartSlate.jsx';
import NflCharts,{chartMarkets} from './components/NflCharts.jsx';
import NflPropList from './components/NflPropList.jsx';
import TopLooks from './components/TopLooks.jsx';
import NflGames from './components/NflGames.jsx';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {activePage,menuPath} from './routes.js';
import {availableStats} from './lib/availableStats.js';
import ModelRecord from './components/ModelRecord.jsx';
import NflToolHeader from './components/NflToolHeader.jsx';
import {defenseTable} from './lib/matchup.js';
import initialSchedule from './lib/initialSchedule.json';
import {nextGame} from './lib/schedule.js';
import {playerAverageLine,matchupBook,postedLines,playerKey,bookLine} from './lib/bookLine.js';
import {demoData} from './lib/demoData.js';
import {preferredMetric,getPlayerGames} from './lib/stats.js';

export default function App() {
  const [page, setPage] = useState(activePage);
  const propListReturn=useRef(null);
  useLayoutEffect(()=>{
    if(page==='prop-lists' && propListReturn.current){
      window.scrollTo({top:propListReturn.current.top,behavior:'instant'});
    }
  },[page]);
  useEffect(()=>{document.documentElement.dataset.theme='dark';},[]);
  useEffect(() => {
    const changePage = () => {
      const next=activePage();
      if(!next){window.location.replace(menuPath(new URL(window.location.href)));return;}
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
  const [requestedMetric, setMetric] = useState('receivingYards');
  const [custom, setCustom] = useState(null);
  const [bookGames, setBookGames] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + 'data/lines.json', {signal:controller.signal, cache:'no-cache'})
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.games)) setBookGames(data.games); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [direction, setDirection] = useState('over');
  const [venue, setVenue] = useState('ALL');
  const [windowSize, setWindowSize] = useState('10');

  useEffect(() => {
    if (data.status === 'ready') return;
    let active = true;
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}data/stats.json`, {cache:'no-cache'})
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
  }, [data.status]);

  useEffect(() => {
    if (data.status !== 'ready') return;
    const hasTouches = payload => payload.players?.some(p => p.games?.some(g => g.scoringChances?.length >= 5));
    if (hasTouches(data)) return;
    const controller = new AbortController();
    let pending = false;
    let lastCheck = Date.now();
    async function refreshTouches() {
      if (pending || document.hidden || Date.now() - lastCheck < 600000) return;
      lastCheck = Date.now();
      pending = true;
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'data/stats.json',
          {cache:'no-cache', signal:controller.signal});
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
    const timer = window.setInterval(refreshTouches, 600000);
    document.addEventListener('visibilitychange', refreshTouches);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshTouches);
    };
  }, [data]);

  const markets=chartMarkets;
  const players=useMemo(()=>{
    const source=data.players || [];
    return source.map(p=>({...p,games:p.games.map(g=>({...g,date:data.gameDates?.[g.gameId] ?? g.date,stats:{...g.stats,
      scrimmageYards:(g.stats?.rushingYards ?? 0)+(g.stats?.receivingYards ?? 0)}}))}));
  },[data.players,data.gameDates]);
  const seasons = data.seasons || [];
  const multi = season === 'ALL';
  const seasonPlayers = useMemo(() => players.flatMap(p => {
    const history=getPlayerGames(p,season);
    if(!history.length)return [];
    const latest=history.at(-1);
    return [{...p,team:latest.team || p.team}];
  }), [players, season]);
  const slateSeason = multi || page!=='analyzer' ? Math.max(...seasons) : season;
  const nflSchedule = useMemo(()=>(data.schedule ?? initialSchedule).filter(g=>g.season===slateSeason),[data.schedule,slateSeason]);
  const normalizeTeam = team => ({LA:'LAR',WSH:'WAS',JAC:'JAX'}[team] || team);
  const chartSlate=useChartSlate(nflSchedule,Date.now());
  const chartGames=chartSlate.game?[chartSlate.game]:chartSlate.games;
  const pricedTeams=useMemo(()=>{
    const grouped=new Map();
    for(const game of chartGames){
      if(page!=='analyzer')break;
      const lines=postedLines(matchupBook(bookGames,game));
      if(!lines.length)continue;
      const byName=new Map();
      for(const line of lines){
        const key=playerKey(line.player);
        if(!byName.has(key))byName.set(key,new Set());
        byName.get(key).add(line.metric);
      }
      for(const team of [game.home,game.away])grouped.set(normalizeTeam(team),byName);
    }
    return grouped;
  },[bookGames,chartGames,page]);
  const roster=seasonPlayers.filter(p=>{
    const code=normalizeTeam(p.team);
    const listed=pricedTeams.get(code);
    if(page==='analyzer'&&listed&&!listed.has(playerKey(p.name)))return false;
    return chartSlate.allows(code);
  });
  const player = roster.find(p => p.id === selectedId) ||
    roster.find(p => ['WR','QB','RB','TE'].includes(p.position)) || roster[0];
  const statOptions=useMemo(()=>{
    const priced=player&&pricedTeams.get(normalizeTeam(player.team))?.get(playerKey(player.name));
    return priced?[...priced].filter(key=>markets[key]):availableStats(markets,getPlayerGames(player,season));
  },[markets,player,season,pricedTeams]);
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
  };
  const onMetricChange = key => { setMetric(key); setCustom(null); };

  const isDemo = data.status !== 'ready';
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const scheduleSeason = multi ? Math.max(...seasons) : season;
  const upcoming=!isDemo && player?.seasons?.includes(scheduleSeason) && nextGame(chartGames,player.team,scheduleSeason,-Infinity);
  const quote = bookLine(bookGames, upcoming, player?.name, metric);
  const lineContext = [player?.id, metric, upcoming?.kickoff].join('|');
  const hasMarket=upcoming && postedLines(matchupBook(bookGames,upcoming)).length>0;
  const averageLine=upcoming && !hasMarket
    ? playerAverageLine(getPlayerGames(player,scheduleSeason,'ALL',venue).filter(g=>Number(g.week)<Number(upcoming.week)),metric)
    : null;
  const manual = custom?.context === lineContext && !(custom.source==='Player Average' && hasMarket);
  const line = manual ? custom.value : quote?.point ?? averageLine;
  const setLine = value => setCustom({context:lineContext, value});
  const defenseRows = useMemo(() => page==='analyzer' ? defenseTable(players, season, player?.position, metric) : [], [page,players, season, player?.position, metric]);
  function openFromBoard(p, market, side, game) {
    const latest = Math.max(...seasons);
    const history = getPlayerGames(p,latest);
    const next=game || nextGame(data.schedule ?? initialSchedule,history.at(-1)?.team || p.team,latest,now);
    boardSelection.current = p.id !== player?.id ? p.id : null;
    setSeason(latest); setVenue('ALL');
    setSelectedId(p.id); setMetric(market.metric); setDirection(side); setWindowSize('10');
    if(next){
      chartSlate.changeWeek(String(next.week));chartSlate.changeMatch(next.id);
    }
    const saved=bookLine(bookGames,next,p.name,market.metric);
    setCustom(saved?.point===market.point?null:{context:[p.id,market.metric,next?.kickoff].join('|'),value:market.point,source:market.source||'Selected Prop Line'});
    setPage('analyzer'); window.location.hash='analyzer'; window.scrollTo(0,0);
  }
  function openTopLookChart(p, market, side, game) {
    const latest=Math.max(...seasons);
    setSeason(latest);setVenue('ALL');setWindowSize('10');
    boardSelection.current=p.id!==player?.id?p.id:null;
    setSelectedId(p.id);setMetric(market.metric);setDirection(side);
    setCustom({context:[p.id,market.metric,game.kickoff].join('|'),value:market.point,source:market.source||'Player Average'});
    chartSlate.changeWeek(String(game.week));chartSlate.changeMatch(game.id);
    setPage('analyzer');window.location.hash='analyzer';window.scrollTo(0,0);
  }
  const updateLabel = data.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Not yet imported';

    if(page==='nfl-top')return <><TopLooks players={players} schedule={nflSchedule} books={bookGames} season={scheduleSeason} now={now} loading={loading} error={error} onOpen={openTopLookChart}/></>;
    if(page==='nfl-games')return <><main className="chart-lab model-record-preview"><NflToolHeader active="games"/><NflGames schedule={isDemo?[]:data.schedule} books={bookGames} players={players} validation={isDemo?null:data.modelValidation} season={scheduleSeason} now={now} onOpen={openFromBoard} updated={updateLabel} loading={loading} error={error}/></main></>;
    if(page==='model-record')return <><main className="chart-lab model-record-preview"><NflToolHeader active="record"/><ModelRecord/></main></>;
    if(page!=='prop-lists' && page!=='analyzer')return <a href="/preview/nfl/">NFL Menu</a>;
    return <>
      {(page==='prop-lists' || propListReturn.current) && <div hidden={page!=='prop-lists'}>
      <NflPropList players={players} roster={seasonPlayers}
      schedule={nflSchedule} season={scheduleSeason} books={bookGames} markets={chartMarkets} now={now} loading={loading} error={error}
      onOpen={({player:p,game,metric:key,quote:saved,point},side,historyVenue)=>{
        propListReturn.current={top:window.scrollY};
        chartSlate.changeWeek(String(game.week));chartSlate.changeMatch(game.id);
        boardSelection.current=p.id!==player?.id?p.id:null;
        setVenue(historyVenue);setWindowSize('10');
        setSelectedId(p.id);setMetric(key);setDirection(side);
        setCustom(saved?null:{context:[p.id,key,game.kickoff].join('|'),value:point,source:'Player Average'});
        window.location.hash='analyzer';
      }}/></div>}
      {page==='analyzer' && <NflCharts players={players} seasons={seasons} nextFixture={nextGame(nflSchedule,player?.team,scheduleSeason,now)} slate={chartSlate} venue={venue} onVenue={setVenue} resetLine={()=>setCustom(null)} player={player} roster={roster} onPlayer={onSelectPlayer} season={season} markets={statOptions}
      metric={metric} onMetric={onMetricChange} line={line} setLine={setLine} quote={quote} manual={manual} manualLabel={custom?.source || 'Custom Line'} direction={direction} setDirection={setDirection}
      windowSize={windowSize} setWindowSize={setWindowSize} upcoming={upcoming} defenses={defenseRows}
      loading={loading} error={error}/>}</>;
}
