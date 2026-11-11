export function playerKey(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, '').trim().replace(/ (jr|sr|ii|iii|iv)$/, '').replace(/ /g, '');
}

const teamCode=team=>({LA:'LAR',WSH:'WAS',JAC:'JAX'}[team]||team);

export function matchupBook(games,game) {
  return game && games?.find(b=>teamCode(b.away)===teamCode(game.away) && teamCode(b.home)===teamCode(game.home) &&
    Math.abs(Date.parse(b.kickoff)-Date.parse(game.kickoff))<12*3600000);
}

export function postedLines(book) {
  return [...(book?.lines||[]), ...(book?.anytime||[]).map(q=>({...q,metric:'scoredTDs',point:.5,over:q.price,anytime:true}))]
    .filter(q=>Number.isFinite(q.point) && (Number.isFinite(q.over)||Number.isFinite(q.under)));
}

export function quotedPlayers(book,game,players) {
  const names=new Map();
  for(const p of players){
    if(![teamCode(game.home),teamCode(game.away)].includes(teamCode(p.team)))continue;
    const key=playerKey(p.name);
    names.set(key,names.has(key)?null:p);
  }
  return postedLines(book).map(line=>{
    const key=playerKey(line.player);
    const player=names.get(key);
    const report=[...(game.injuries?.[game.away]||[]),...(game.injuries?.[game.home]||[])]
      .find(r=>(player?.id && r.id===player.id)||playerKey(r.name||'')===key);
    return {line,player,status:report?.gameStatus||null};
  });
}

export function bookLine(games, upcoming, name, metric) {
  if (!upcoming || !name) return null;
  const matches=postedLines(matchupBook(games,upcoming)).filter(q=>q.metric===metric && playerKey(q.player)===playerKey(name));
  return matches.find(q=>!q.anytime)||matches[0]||null;
}

export function fairSideProbability(quote,side,line){
  if(!quote||!Number.isFinite(line)||Number(quote.point)!==Number(line)||!Number.isFinite(quote.over)||!Number.isFinite(quote.under))return null;
  const implied=price=>price>=0?100/(price+100):Math.abs(price)/(Math.abs(price)+100);
  const over=implied(quote.over),under=implied(quote.under),sum=over+under;
  return sum>0?(side==='under'?under:over)/sum:null;
}

export const priceText = price => Number.isFinite(price) ? (price > 0 ? '+' + price : String(price)) : '—';

export function usageFor(metric) {
  if (metric === 'scoredTDs') return {key:'opportunities', label:'Carries + Targets'};
  if (metric === 'passingYards' || metric === 'passingTDs') return {key:'attempts', label:'Pass Attempts'};
  if (metric === 'rushingYards' || metric === 'rushingAttempts') return {key:'carries', label:'Carries'};
  return {key:'targets', label:'Targets'};
}
