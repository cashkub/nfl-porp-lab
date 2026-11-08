import {teamColor} from '../lib/teamColors.js';
import {ChevronDown} from 'lucide-react';
import PropChart from './PropChart.jsx';
import StatCard from './StatCard.jsx';
import {availableStats} from '../lib/availableStats.js';
import {UsageTrends} from './Research.jsx';
import ConferenceFilter from './ConferenceFilter.jsx';
import React, {useEffect, useMemo, useState} from 'react';
import HitRate, {rateStyle} from './HitRate.jsx';
import LineSelect from './LineSelect.jsx';
import {filteredWindow, summarize} from '../lib/stats.js';

export const markets = {
  points:{label:'Points',maximum:100,unit:'pts',defaultLine:15.5},
  rebounds:{label:'Rebounds',maximum:50,unit:'reb',defaultLine:5.5},
  assists:{label:'Assists',maximum:40,unit:'ast',defaultLine:3.5},
  threes:{label:'Made Threes',maximum:25,unit:'3PM',defaultLine:1.5}
};

export function useCbbFile(path) {
  const [result,setResult] = useState(null);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    fetch(import.meta.env.BASE_URL+'data/cbb/'+path,{signal:controller.signal,cache:'no-cache'})
      .then(r=>{if (!r.ok) throw new Error();return r.json();})
      .then(data=>setResult({path,data}))
      .catch(()=>{if (!controller.signal.aborted) setResult({path,error:true});});
    return ()=>controller.abort();
  },[path,retry]);
  return {data:result?.path===path ? result?.data : null,error:result?.path===path && result?.error,
    reload:()=>{setResult(null);setRetry(n=>n+1);}};
}

export default function CbbAnalyzer({initial = {}}) {
  const [settingsOpen,setSettingsOpen]=useState(false);
  const index=useCbbFile('index.json');
  const [year,setYear]=useState(initial.season || '');
  const season=year || index.data?.seasons[0];
  const source=useCbbFile(season ? season+'/teams.json' : null);
  const [conference,setConference]=useState('');
  const teams=Object.entries(source.data?.teams || {}).filter(([id])=>!conference || source.data?.conferences?.[id]===conference).sort((a,b)=>a[1].localeCompare(b[1]));
  const [selection,setSelection]=useState(initial.team || '');
  const team=teams.some(([id])=>id===selection) ? selection : (teams.find(([,name])=>name==='Illinois Fighting Illini') || teams[0])?.[0];
  const roster=useCbbFile(team ? season+'/'+team+'.json' : null);
  const [athlete,setAthlete]=useState(initial.player || '');
  const eligible=useMemo(()=>(roster.data || []).filter(p=>availableStats(markets,p.games).length),[roster.data]);
  const player=eligible.find(p=>p.id===athlete) || eligible[0];
  const [requestedMetric,setMetric]=useState(initial.metric || 'points');
  const statOptions=availableStats(markets,player?.games || []);
  const metric=statOptions.includes(requestedMetric)?requestedMetric:statOptions[0] || 'points';
  const [chosenLine,setLine]=useState(initial.line ?? markets.points.defaultLine);
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
  return <div className="college-analyzer"><section className="match-header team-banner" style={{'--team-color':teamColor(team,source.data?.colors || {})}}><div className="match-player"><div className="match-context">Men’s College Basketball · {season ? (season-1)+'–'+String(season).slice(-2):''}</div><h1>{player?.name || 'CBB Analyzer'}</h1><p>{source.data?.teams?.[team]} · {statOptions.length?markets[metric].label+' '+direction+' '+line:'Player Research'}</p></div><div className="match-form"><span>Hit Rate</span><strong><HitRate rate={statOptions.length?summary.rate:null}/></strong><small>{summary.total} matching games</small></div></section>
    <div className="workspace"><div className="analysis-rail"><aside className="panel setup college-settings" aria-label="Prop Settings">
      <button type="button" className="phone-settings" aria-expanded={settingsOpen} aria-controls="college-settings-fields" onClick={()=>setSettingsOpen(!settingsOpen)}>
        <span>{settingsOpen?'Fewer Filters':'More Filters'}</span>
        <ChevronDown size={16}/>
      </button>
      <div id="college-settings-fields" className={settingsOpen?'settings-fields expanded':'settings-fields'}><h2>Prop Settings</h2>
    <div className="board-controls">
      <label className="extra-filter">Season<select value={season || ''} onChange={e=>{setYear(Number(e.target.value));setConference('');setAthlete('');}}>{index.data?.seasons.map(y=><option value={y} key={y}>{y-1}–{String(y).slice(-2)}</option>)}</select></label>
      <div className="extra-filter conference-field"><ConferenceFilter metadata={source.data} value={conference} onChange={value=>{setConference(value);setSelection('');setAthlete('');}}/></div>
      <label>Team<select value={team || ''} onChange={e=>{setSelection(e.target.value);setAthlete('');}}>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Player<select value={player?.id || ''} onChange={e=>setAthlete(e.target.value)}>{eligible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Stat<select value={metric} onChange={e=>{setMetric(e.target.value);setLine(markets[e.target.value].defaultLine);}}>{statOptions.map(k=><option value={k} key={k}>{markets[k].label}</option>)}</select></label>
      <label className="extra-filter">Location<select value={venue} onChange={e=>setVenue(e.target.value)}>{['All Venues','Home','Away','Neutral'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="extra-filter">Games<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full Season</option></select></label>
      <label>Side<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
    </div>
    <div className="cbb-line"><LineSelect key={metric} metric={metric} markets={markets} value={line} onChange={setLine}/></div>
    <small>Manual Line</small></div></aside>{statOptions.length>0 && <><UsageTrends games={games} label="Minutes" value={g=>g.minutes}/><UsageTrends games={games} label="Shot Attempts" value={g=>g.shots}/></>}</div>
    <div className="results">{failed ? <p role="status">Box Scores Are Unavailable. <button onClick={failed.reload}>Retry</button></p> :
      !roster.data ? <p role="status">Loading College Basketball Box Scores…</p> :
      !statOptions.length?<p>No recorded prop categories for this player and season.</p>:
      <><section className="hit-section"><h2>Hit Rates</h2><div className="stat-grid">{[['5','Last 5'],['10','Last 10'],['season','Full Season']].map(([key,label])=><StatCard key={key} label={label} summary={summarize(filteredWindow(history,key),metric,line,direction)} selected={period===key} onClick={()=>setPeriod(key)}/>)}</div></section>
      <section className="panel chart-panel"><div className="chart-top"><h2>Game-by-Game Performance</h2><small>{markets[metric].label}</small></div><PropChart college games={games.map(g=>({...g,gameId:g.id,venue:({Home:'H',Away:'A'})[g.venue] || '?'}))} markets={markets} rankCount={rankCount} metric={metric} direction={direction} line={line} defenses={Object.entries(source.data.ranks).map(([team,r])=>({team,rank:r[metric]}))}/></section>
      <section className="panel log-panel"><h2>Game Log</h2>
      {games.length ? <div className="board-scroll"><table className="game-log"><thead><tr>{['Date','Opponent','Location',markets[metric].label,'Minutes','DEF Rank','Result'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>
      {[...games].reverse().map(g=>{
        const val=g.stats[metric],rank=source.data.ranks[g.opponent]?.[metric];
        const outcome=val===line?'Push':(direction==='over'?val>line:val<line)?'Hit':'Miss';
        return <tr key={g.id}><td>{g.date}</td><td>{source.data.teams[g.opponent] || g.abbr}</td><td>{g.venue}</td>
          <td><div className="cbb-bar"><b>{val}</b><div aria-hidden="true"><i className={'cbb-'+outcome} style={{width:100*val/highest+'%'}}/><em style={{left:100*line/highest+'%'}}/></div></div></td>
          <td>{g.minutes}</td><td style={rankCount>1 && rank ? rateStyle((rankCount-rank)/(rankCount-1)):undefined}>{rank ? '#'+rank : '—'}</td>
          <td><span className={'result-pill '+outcome.toLowerCase()}>{outcome}</span></td></tr>;
      })}</tbody></table></div>:<p>No Recorded Games Match These Filters.</p>}

      <p className="board-foot">Bar markers show your line. Defense #1 allows the most of the selected stat per game to all opposing players combined. Rankings use the selected season’s available box scores.</p></section></>}
    <p className="board-foot">Box Scores and Schedules · <a href="https://github.com/sportsdataverse/hoopR-mbb-data">SportsDataverse / hoopR</a></p>
  </div></div></div>;
}
