const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const shortDay=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'});

export function recordWeek(row,sport){
  if(sport==='nfl'){
    const match=/^(\d{4})_(\d{1,2})_/.exec(row.gameId || row.id || '');
    if(match)return match[1]+'-'+match[2].padStart(2,'0');
  }
  const kickoff=Date.parse(row.kickoff);
  if(!row.date && !Number.isFinite(kickoff))return '';
  const day=new Date((row.date || easternDay.format(kickoff))+'T12:00:00Z');
  if(!Number.isFinite(+day))return '';
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
  return day.toISOString().slice(0,10);
}

export function weekLabel(key){
  if(key.length===7)return key.slice(0,4)+' · Week '+Number(key.slice(5));
  const start=new Date(key+'T12:00:00Z'),end=new Date(start);
  end.setUTCDate(end.getUTCDate()+6);
  return shortDay.format(start)+' – '+shortDay.format(end)+', '+end.getUTCFullYear();
}
