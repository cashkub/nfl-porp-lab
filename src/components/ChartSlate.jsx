import ChartSelect from './ChartSelect.jsx';
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
    <ChartSelect label="Game week" value={slate.week} onChange={slate.changeWeek}>{slate.weeks.map(w=><option key={w} value={w}>Week {w}</option>)}</ChartSelect>
    <ChartSelect label="Matchup" value={slate.game?.id || ''} onChange={slate.changeMatch}><option value="">All matchups</option>{slate.games.map(g=><option key={g.id} value={g.id}>{g.away} at {g.home}</option>)}</ChartSelect>
    <ChartSelect label="Team" value={slate.team} onChange={slate.changeTeam}><option value="">All teams</option>{slate.teams.map(t=><option key={t}>{t}</option>)}</ChartSelect>
  </div>;
}
