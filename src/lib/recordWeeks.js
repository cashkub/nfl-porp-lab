const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const shortDay=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'});

export function recordPeriod(row,sport){
  if(sport==='cfb' && row.season && row.week)return row.season+'-'+(row.postseason?'P':'')+String(row.week).padStart(2,'0');
  if(sport==='nfl'){
    const match=/^(\d{4})_(\d{1,2})_/.exec(row.gameId || row.id || '');
    if(match)return match[1]+'-'+match[2].padStart(2,'0');
  }
  const kickoff=Date.parse(row.kickoff);
  if(!row.date && !Number.isFinite(kickoff))return '';
  const day=new Date((row.date || easternDay.format(kickoff))+'T12:00:00Z');
  if(!Number.isFinite(+day))return '';
  if((sport==='cbb'||sport==='nba'))return day.toISOString().slice(0,10);
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
  return day.toISOString().slice(0,10);
}

const fullDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'});
export function periodLabel(key,sport){
  if(!key)return '—';
  if((sport==='cbb'||sport==='nba'))return fullDate.format(new Date(key+'T12:00:00Z'));
  if(sport==='cfb' && key.includes('-P'))return key.slice(0,4)+' · Postseason Week '+Number(key.slice(6));
  if(key.length===7)return key.slice(0,4)+' · Week '+Number(key.slice(5));
  const start=new Date(key+'T12:00:00Z'),end=new Date(start);
  end.setUTCDate(end.getUTCDate()+6);
  return shortDay.format(start)+' – '+shortDay.format(end)+', '+end.getUTCFullYear();
}
