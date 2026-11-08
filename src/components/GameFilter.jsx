import React, {useMemo, useState} from 'react';

const selections = new Map();
const easternDate = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'});
export const gameDay = game => easternDate.format(new Date(game.kickoff));
const gameKey = game => [gameDay(game), game.away, game.home].join('|');

export function useGameFilter(sport, season, schedule) {
  const key = sport + ':' + season;
  const [, redraw] = useState(0);
  const saved = selections.get(key);
  const today = easternDate.format(new Date());
  const end = new Date(today + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() + (sport === 'nfl' ? 6 : 1));
  const lastDay = end.toISOString().slice(0,10);
  const byDate = useMemo(() => {
    const groups = new Map();
    for (const game of schedule || []) {
      if (!Number.isFinite(Date.parse(game.kickoff))) continue;
      const day = gameDay(game);
      if (day < today || day > lastDay) continue;
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(game);
    }
    return groups;
  }, [schedule,today,lastDay]);
  const days = [...byDate.keys()].sort();
  const date = byDate.has(saved?.date) ? saved.date : '';
  const slate = date ? byDate.get(date) || [] : schedule || [];
  const game = date && saved?.match && slate.find(g => gameKey(g) === saved.match);
  const match = game ? saved.match : '';
  const teams = new Set((game ? [game] : date ? slate : []).flatMap(g => [g.away,g.home]));
  function select(date, match='') {
    selections.set(key, {date,match});
    redraw(n => n+1);
  }
  return {date,match,days,slate,game,select,allows:team => (!date && !match) || teams.has(team)};
}

export default function GameFilter({filter, onChange, names={}}) {
  const {date, match, days, slate, select} = filter;
  function change(day, game='') { select(day,game); onChange?.(); }
  return <>
    <label>Game Date (ET)<select value={date} onChange={e=>change(e.target.value)}>
      <option value="">All Dates</option>{days.map(d=><option key={d}>{d}</option>)}
    </select></label>
    <label>Game<select disabled={!date} value={match} onChange={e=>change(date,e.target.value)}>
      <option value="">{date ? 'All Games' : 'Select a Date First'}</option>{date && slate.map(g=><option key={gameKey(g)} value={gameKey(g)}>{g.awayName || names[g.away] || g.away} at {g.homeName || names[g.home] || g.home}{!date && ' · '+gameDay(g)}</option>)}
    </select></label>
  </>;
}
