import React,{useState} from 'react';

export function useChartSlate(schedule,now) {
  const [week,setWeek]=useState('');
  const [match,setMatch]=useState('');
  const [team,setTeam]=useState('');
  const weeks=[...new Set(schedule.map(g=>String(g.week)))];
  const next=schedule.find(g=>Date.parse(g.kickoff)>now);
  const activeWeek=weeks.includes(week)?week:String(next?.week || weeks[0] || '');
  const games=schedule.filter(g=>String(g.week)===activeWeek);
  const game=games.find(g=>g.id===match);
  const teams=[...new Set((game?[game]:games).flatMap(g=>[g.away,g.home]))].sort();
  const activeTeam=teams.includes(team)?team:'';
  return {weeks,week:activeWeek,games,game,teams,team:activeTeam,
    allows:code=>activeTeam?code===activeTeam:!teams.length || teams.includes(code),
    changeWeek:value=>{setWeek(value);setMatch('');setTeam('')},
    changeMatch:value=>{setMatch(value);setTeam('')},changeTeam:setTeam};
}

export function ChartSlate({slate}) {
  return <div className="chart-slate">
    <label>Game week<select value={slate.week} onChange={e=>slate.changeWeek(e.target.value)}>{slate.weeks.map(w=><option key={w} value={w}>Week {w}</option>)}</select></label>
    <label>Matchup<select value={slate.game?.id || ''} onChange={e=>slate.changeMatch(e.target.value)}><option value="">All matchups</option>{slate.games.map(g=><option key={g.id} value={g.id}>{g.away} at {g.home}</option>)}</select></label>
    <label>Team<select value={slate.team} onChange={e=>slate.changeTeam(e.target.value)}><option value="">All teams</option>{slate.teams.map(t=><option key={t}>{t}</option>)}</select></label>
  </div>;
}
