import React, {useEffect, useState} from 'react';
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
  const index=useCbbFile('index.json');
  const [year,setYear]=useState(initial.season || '');
  const season=year || index.data?.seasons[0];
  const source=useCbbFile(season ? season+'/teams.json' : null);
  const teams=Object.entries(source.data?.teams || {}).sort((a,b)=>a[1].localeCompare(b[1]));
  const [selection,setSelection]=useState(initial.team || '');
  const team=source.data?.teams[selection] ? selection : (teams.find(([,name])=>name==='Illinois Fighting Illini') || teams[0])?.[0];
  const roster=useCbbFile(team ? season+'/'+team+'.json' : null);
  const [athlete,setAthlete]=useState(initial.player || '');
  const player=roster.data?.find(p=>p.id===athlete) || roster.data?.[0];
  const [metric,setMetric]=useState(initial.metric || 'points');
  const [line,setLine]=useState(initial.line ?? markets.points.defaultLine);
  const [direction,setDirection]=useState(initial.side || 'over');
  const [venue,setVenue]=useState('All Venues');
  const [period,setPeriod]=useState('10');
  const games=filteredWindow((player?.games || []).filter(g=>venue==='All Venues'||g.venue===venue),period);
  const summary=summarize(games,metric,line,direction);
  const failed=[index,source,roster].find(s=>s.error);
  const highest=Math.max(1,line,...games.map(g=>g.stats[metric]));
  const rankCount=Object.keys(source.data?.ranks || {}).length;
  return <section className="panel props-board cbb-board">
    <header><h1>CBB Analyzer</h1><p>Men’s College Basketball · Manual Lines{index.data && season && ' · Games Through '+index.data.through[season]}</p></header>
    <div className="board-controls">
      <label>Season<select value={season || ''} onChange={e=>{setYear(Number(e.target.value));setAthlete('');}}>{index.data?.seasons.map(y=><option value={y} key={y}>{y-1}–{String(y).slice(-2)}</option>)}</select></label>
      <label>Team<select value={team || ''} onChange={e=>{setSelection(e.target.value);setAthlete('');}}>{teams.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Player<select value={player?.id || ''} onChange={e=>setAthlete(e.target.value)}>{roster.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Stat<select value={metric} onChange={e=>{setMetric(e.target.value);setLine(markets[e.target.value].defaultLine);}}>{Object.entries(markets).map(([k,m])=><option value={k} key={k}>{m.label}</option>)}</select></label>
      <label>Location<select value={venue} onChange={e=>setVenue(e.target.value)}>{['All Venues','Home','Away','Neutral'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Games<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="5">Last 5</option><option value="10">Last 10</option><option value="season">Full Season</option></select></label>
      <label>Side<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select></label>
    </div>
    <div className="cbb-line"><LineSelect key={metric} metric={metric} markets={markets} value={line} onChange={setLine}/></div>
    {failed ? <p role="status">Box Scores Are Unavailable. <button onClick={failed.reload}>Retry</button></p> :
      !roster.data ? <p role="status">Loading College Basketball Box Scores…</p> :
      <><div className="cbb-summary"><h2>{player?.name} · {markets[metric].label}</h2><strong><HitRate rate={summary.rate}/> Hit Rate</strong><span>{summary.hits} of {summary.total} Games</span></div>
      {games.length ? <div className="board-scroll"><table className="game-log"><thead><tr>{['Date','Opponent','Location',markets[metric].label,'Minutes','DEF Rank','Result'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>
      {[...games].reverse().map(g=>{
        const val=g.stats[metric],rank=source.data.ranks[g.opponent]?.[metric];
        const outcome=val===line?'Push':(direction==='over'?val>line:val<line)?'Hit':'Miss';
        return <tr key={g.id}><td>{g.date}</td><td>{source.data.teams[g.opponent] || g.abbr}</td><td>{g.venue}</td>
          <td><div className="cbb-bar"><b>{val}</b><div aria-hidden="true"><i className={'cbb-'+outcome} style={{width:100*val/highest+'%'}}/><em style={{left:100*line/highest+'%'}}/></div></div></td>
          <td>{g.minutes}</td><td style={rankCount>1 && rank ? rateStyle((rankCount-rank)/(rankCount-1)):undefined}>{rank ? '#'+rank : '—'}</td>
          <td><span className={'result-pill '+outcome.toLowerCase()}>{outcome}</span></td></tr>;
      })}</tbody></table></div>:<p>No Recorded Games Match These Filters.</p>}
      <p className="board-foot">Bar markers show your line. Defense #1 allows the most of the selected stat per game to all opposing players combined. Rankings use the selected season’s available box scores.</p></>}
    <p className="board-foot">Box Scores and Schedules · <a href="https://github.com/sportsdataverse/hoopR-mbb-data">SportsDataverse / hoopR</a></p>
  </section>;
}
