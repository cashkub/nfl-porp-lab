import React, {useState} from 'react';
import {MatchReport} from './MatchReport.jsx';
import PropsBoard from './PropsBoard.jsx';
import {priceText} from '../lib/bookLine.js';
import {teamColor} from '../lib/teamColors.js';
import FilterMenu from './FilterMenu.jsx';
import './NflGames.css';

const kickoff = new Intl.DateTimeFormat('en-US', {
  weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit',
  timeZone:'America/New_York', timeZoneName:'short'
});
const weekOf = game => game.season + ' · Week ' + game.week;

function Team({code,price}) {
  const logoCode = ({WAS:'wsh',LAR:'lar'})[code] || code.toLowerCase();
  return <span className="nfl-game-team" style={{'--club':teamColor(code)}}>
    <img alt="" loading="lazy" src={'https://a.espncdn.com/i/teamlogos/nfl/500/'+logoCode+'.png'}
      onError={e=>{e.currentTarget.hidden=true}}/>
    <b>{code}</b><span>ML {priceText(price)}</span>
  </span>;
}

export default function NflGames({schedule,books,players,season,now,onOpen,updated,loading,error}) {
  const [requestedWeek,setWeek] = useState('');
  const [selectedId,setSelected] = useState('');
  const upcoming = (schedule || []).filter(g=>Date.parse(g.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  const weeks = [...new Set(upcoming.map(weekOf))];
  const week = weeks.includes(requestedWeek) ? requestedWeek : weeks[0];
  return <section className="panel nfl-games"><h1>NFL Games</h1>
    {weeks.length>0 && <><div className="board-controls"><label>Game week
      <FilterMenu aria-label="Game Week" value={week} onChange={e=>{setWeek(e.target.value);setSelected('')}}>{weeks.map(w=><option key={w}>{w}</option>)}</FilterMenu>
    </label></div><p>Pregame market snapshot · {updated} · American odds</p></>}
    {upcoming.filter(g=>weekOf(g)===week).map(g=>{
      const id=g.id || g.kickoff+g.home, open=id===selectedId;
      return <article className="nfl-game" key={id}>
        <button type="button" className="nfl-match-button" aria-expanded={open} onClick={()=>setSelected(open?'':id)}>
          <span className="nfl-game-date">{g.timeKnown===false?g.date+' · Time TBD':kickoff.format(new Date(g.kickoff))}</span>
          <span className="nfl-game-pair"><Team code={g.away} price={g.awayPrice}/><small>at</small><Team code={g.home} price={g.homePrice}/></span>
          <span className="nfl-game-market">{Number.isFinite(g.totalLine)?'Total '+g.totalLine+' · Over '+priceText(g.overPrice)+' / Under '+priceText(g.underPrice):'Total unavailable'}</span>
          <span className="nfl-game-action">{open?'Close matchup ↑':'View matchup ↓'}</span>
        </button>
        {open && <div className="nfl-match-detail"><h2>Matchup projection</h2>
          <MatchReport game={g} away={g.awayRating} home={g.homeRating}/>
          <PropsBoard fixedGame={g} games={books.filter(b=>b.away===g.away && b.home===g.home && Math.abs(Date.parse(b.kickoff)-Date.parse(g.kickoff))<12*3600000)}
            schedule={[g]} players={players} season={season} now={now} onOpen={onOpen}/>
        </div>}
      </article>;
    })}
    {!upcoming.length && <p>{loading?'Loading the NFL schedule…':error || 'No upcoming games in the current schedule.'}</p>}
  </section>;
}
