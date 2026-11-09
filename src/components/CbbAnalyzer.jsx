import FilterMenu from './FilterMenu.jsx';
import PlayerStepper from './PlayerStepper.jsx';
import GameFilter, {useGameFilter} from './GameFilter.jsx';
import SortableTable from './SortableTable.jsx';
import PlayerPhoto from './PlayerPhoto.jsx';
import {teamColor} from '../lib/teamColors.js';
import {ChevronDown} from 'lucide-react';
import PropChart from './PropChart.jsx';
import StatCard from './StatCard.jsx';
import {availableStats} from '../lib/availableStats.js';
import {UsageTrends} from './Research.jsx';
import ConferenceFilter from './ConferenceFilter.jsx';
import React, {useEffect, useMemo, useState} from 'react';
import HitRate, {DefenseRank} from './HitRate.jsx';
import LineSelect from './LineSelect.jsx';
import {filteredWindow, summarize} from '../lib/stats.js';

import {manualMarkets,seasonLabel,sportNames} from '../lib/manualSports.js';
import {useLeague} from './ManualLeague.jsx';

export function useCbbFile(path) {
  const sport=useLeague();
  const [result,setResult] = useState(null);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    fetch(import.meta.env.BASE_URL+'data/'+sport+'/'+path,{signal:controller.signal,cache:'no-cache'})
      .then(r=>{if (!r.ok) throw new Error();return r.json();})
      .then(data=>setResult({sport,path,data}))
      .catch(()=>{if (!controller.signal.aborted) setResult({sport,path,error:true});});
    return ()=>controller.abort();
  },[sport,path,retry]);
  return {data:result?.sport===sport && result.path===path ? result?.data : null,error:result?.sport===sport && result.path===path && result.error,
    reload:()=>{setResult(null);setRetry(n=>n+1);}};
}

export default function CbbAnalyzer({initial = {}}) {
  const sport=useLeague(),markets=manualMarkets(sport),football=sport==='cfb';
  const fallback=football?'passingYards':'points';
  const [settingsOpen,setSettingsOpen]=useState(false);
  const index=useCbbFile('index.json');
  const [year,setYear]=useState(initial.season || '');
  const season=year || index.data?.seasons[0];
  const source=useCbbFile(season ? season+'/teams.json' : null);
  const [conference,setConference]=useState('');
  const schedule=useCbbFile(season ? season+'/schedule.json':null);
  const gameFilter=useGameFilter(sport,season,schedule.data);
  const teams=Object.entries(source.data?.teams || {}).filter(([id])=>gameFilter.allows(id)).filter(([id])=>!conference || source.data?.conferences?.[id]===conference).sort((a,b)=>a[1].localeCompare(b[1]));
  const [selection,setSelection]=useState(initial.team || '');
  const team=teams.some(([id])=>id===selection) ? selection : (teams.find(([,name])=>name==='Illinois Fighting Illini') || teams[0])?.[0];
  const roster=useCbbFile(team ? season+'/'+team+'.json' : null);
  const [athlete,setAthlete]=useState(initial.player || '');
  const eligible=useMemo(()=>(roster.data || []).filter(p=>availableStats(markets,p.games).length),[roster.data]);
  const player=eligible.find(p=>p.id===athlete) || eligible[0];
  const [requestedMetric,setMetric]=useState(initial.metric || fallback);
  const statOptions=availableStats(markets,player?.games || []);
  const metric=statOptions.includes(requestedMetric)?requestedMetric:statOptions[0] || fallback;
  const [chosenLine,setLine]=useState(initial.line ?? markets[fallback].defaultLine);
  const line=requestedMetric===metric?chosenLine:markets[metric].defaultLine;
  useEffect(()=>{if(player && metric!==requestedMetric){setMetric(metric);setLine(markets[metric].defaultLine)}},[player,metric,requestedMetric]);
  const [direction,setDirection]=useState(initial.side || 'over');
  const [venue,setVenue]=useState('All Venues');
  const [period,setPeriod]=useState('10');
  const history=(player?.games || []).filter(g=>venue==='All Venues'||g.venue===venue);
  const games=filteredWindow(history,period);
  const summary=summarize(games,metric,line,direction);
  const failed=[index,source,roster].find(s=>s.error);
  const highest=Math.max(1,line,...games.map(g=>g.stats[metric]));
  const rankCount=Object.keys(source.data?.ranks || {}).length;
  return <div className="college-analyzer"><section className="match-header team-banner" style={{'--team-color':teamColor(team,source.data?.colors || {})}}><div className="match-player"><div className="match-context">{sportNames[sport]} · {season ? seasonLabel(sport,season):''}</div><h1 className="player-title">{player && <PlayerPhoto large id={player.id} name={player.name} url={player.photo}/>} {player?.name || sport.toUpperCase()+' Analyzer'}</h1><p>{source.data?.teams?.[team]} · {statOptions.length?markets[metric].label+' '+direction+' '+line:'Player Research'}</p></div><div className="match-form"><span>Hit Rate</span><strong><HitRate rate={statOptions.length?summary.rate:null}/></strong><small>{summary.total} matching games</small></div></section>
    <div className="workspace"><div className="analysis-rail"><aside className="panel setup college-settings" aria-label="Prop Settings">
      <button type="button" className="phone-settings" aria-expanded={settingsOpen} aria-controls="college-settings-fields" onClick={()=>setSettingsOpen(!settingsOpen)}>
        <span>{settingsOpen?'Fewer Filters':'More Filters'}</span>
        <ChevronDown size={16}/>
      </button>
      <div id="college-settings-fields" className={settingsOpen?'settings-fields expanded':'settings-fields'}><h2>Prop Settings</h2>
    <div className="board-controls">
      <label className="extra-filter">Season<FilterMenu value={season || ''} onChange={e=>{setYear(Number(e.target.value));setConference('');setAthlete('');}}>{index.data?.seasons.map(y=><option value={y} key={y}>{seasonLabel(sport,y)}</option>)}</FilterMenu></label>
      <div className="extra-filter conference-field">{sport!=='nba' && <ConferenceFilter metadata={source.data} value={conference} onChange={value=>{setConference(value);setSelection('');setAthlete('');}}/>}</div>
      {<GameFilter filter={gameFilter} onChange={()=>{setConference('');setSelection('');setAthlete('');}}/>}
      <label>Team<FilterMenu value={team || ''} onChange={e=>{setSelection(e.target.value);setAthlete('');}}>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</FilterMenu></label>
      <div className="stepper-field"><label htmlFor="analyzer-player">Player</label><PlayerStepper choices={eligible.map(p=>p.id)} value={player?.id} onSelect={setAthlete}><FilterMenu id="analyzer-player" value={player?.id || ''} onChange={e=>setAthlete(e.target.value)}>{eligible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</FilterMenu></PlayerStepper></div>
      <label>Stat<FilterMenu value={metric} onChange={e=>{setMetric(e.target.value);setLine(markets[e.target.value].defaultLine);}}>{statOptions.map(k=><option value={k} key={k}>{markets[k].label}</option>)}</FilterMenu></label>
      <label className="extra-filter">Location<FilterMenu value={venue} onChange={e=>setVenue(e.target.value)}>{['All Venues','Home','Away','Neutral'].map(v=><option key={v}>{v}</option>)}</FilterMenu></label>
      <label className="extra-filter">Games<FilterMenu value={period} onChange={e=>setPeriod(e.target.value)}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full Season</option></FilterMenu></label>
      <label>Side<FilterMenu value={direction} onChange={e=>setDirection(e.target.value)}><option value="over">Over</option><option value="under">Under</option></FilterMenu></label>
    </div>
    <div className="cbb-line"><LineSelect key={metric} metric={metric} markets={markets} value={line} onChange={setLine}/></div>
    <small>Manual Line</small></div></aside>{statOptions.length>0 && !football && <><UsageTrends games={games} label="Minutes" value={g=>g.minutes}/><UsageTrends games={games} label="Shot Attempts" value={g=>g.shots}/></>}</div>
    <div className="results">{failed ? <p role="status">Box Scores Are Unavailable. <button onClick={failed.reload}>Retry</button></p> :
      !team && source.data ? <p>No Teams Match This Game Filter.</p> : !roster.data ? <p role="status">Loading Box Scores…</p> :
      !statOptions.length?<p>No recorded prop categories for this player and season.</p>:
      <><section className="hit-section"><h2>Hit Rates</h2><div className="stat-grid">{[['5','Last 5'],['10','Last 10'],['season','Full Season']].map(([key,label])=><StatCard key={key} label={label} summary={summarize(filteredWindow(history,key),metric,line,direction)} selected={period===key} onClick={()=>setPeriod(key)}/>)}</div></section>
      <section className="panel chart-panel"><div className="chart-top"><h2>Game-by-Game Performance</h2><small>{markets[metric].label}</small></div><PropChart college football={football} games={games.map(g=>({...g,gameId:g.id,venue:({Home:'H',Away:'A'})[g.venue] || '?'}))} markets={markets} rankCount={rankCount} metric={metric} direction={direction} line={line} defenses={Object.entries(source.data.ranks).map(([team,r])=>({team,rank:r[metric]}))}/></section>
      <section className="panel log-panel"><h2>Game Log</h2>
      {games.length ? <div className="board-scroll"><SortableTable headers={['Date','Opponent','Location',markets[metric].label,...(football?[]:['Minutes']),'DEF Rank','Result']} rows={[...games].reverse()}
      values={g=>[g.date,source.data.teams[g.opponent] || g.abbr,g.venue,g.stats[metric],...(football?[]:[g.minutes]),source.data.ranks[g.opponent]?.[metric],g.stats[metric]===line?'Push':(direction==='over'?g.stats[metric]>line:g.stats[metric]<line)?'Hit':'Miss']}
      descending={[0,3]} renderRow={g=>{
        const val=g.stats[metric],rank=source.data.ranks[g.opponent]?.[metric];
        const outcome=val===line?'Push':(direction==='over'?val>line:val<line)?'Hit':'Miss';
        return <tr key={g.id}><td>{g.date}</td><td>{source.data.teams[g.opponent] || g.abbr}</td><td>{g.venue}</td>
          <td><div className="cbb-bar"><b>{val}</b><div aria-hidden="true"><i className={'cbb-'+outcome} style={{width:100*val/highest+'%'}}/><em style={{left:100*line/highest+'%'}}/></div></div></td>
          {!football && <td>{g.minutes}</td>}<td><DefenseRank rank={rank} total={rankCount} side={direction}/></td>
          <td><span className={'result-pill '+outcome.toLowerCase()}>{outcome}</span></td></tr>;
      }}/></div>:<p>No Recorded Games Match These Filters.</p>}

      <p className="board-foot">Bar markers show your line. Rankings use the selected season’s available box scores.</p></section></>}
    <p className="board-foot">Box Scores and Schedules · <a href={'https://github.com/sportsdataverse/'+(football?'cfbfastR-cfb-data':sport==='nba'?'hoopR-nba-data':'hoopR-mbb-data')}>SportsDataverse</a> · Stats through {index.data?.through?.[season] || '—'}</p>
  </div></div></div>;
}
