import React,{useEffect,useMemo,useState} from 'react';
import {ChevronDown,Activity,Info} from 'lucide-react';
import PlayerPhoto from './PlayerPhoto.jsx';
import NflToolHeader from './NflToolHeader.jsx';
import {teamColor} from '../lib/teamColors.js';
import {formatRate,METRICS} from '../lib/stats.js';
import {rateStyle,defenseRankStyle} from './HitRate.jsx';
import FilterMenu from './FilterMenu.jsx';
import './TopLooks.css';

import {buildTopLooks,dayKey,dayLabel,fmtShare,averageLineLabel,projectionReason,gameContext} from '../lib/topLooksModel.js';
export default function TopLooks({players,schedule,books,season,now,loading,error,onOpen}) {
  const future=schedule.filter(game=>Date.parse(game.kickoff)>now);
  const days=[...new Set(future.map(game=>dayKey(game.kickoff)))].sort();
  const weeks=[...new Set(future.map(game=>String(game.week)))].sort((a,b)=>Number(a)-Number(b));
  const initialParams=new URLSearchParams(window.location.search);
  const [type,setType]=useState(()=>initialParams.get('topType')==='anytime'?'anytime':'props');
  const [mode,setMode]=useState(()=>initialParams.get('topMode')==='week'?'week':'day');
  const [selected,setSelected]=useState(()=>initialParams.get('topSelection')||'');
  const [openWhy,setOpenWhy]=useState('');
  const options=mode==='day'?days:weeks;
  const value=options.includes(selected)?selected:options[0]||'';
  const slate=future.filter(game=>mode==='day'?dayKey(game.kickoff)===value:String(game.week)===value);
  useEffect(()=>{
    const url=new URL(window.location.href);
    url.searchParams.set('topMode',mode);
    url.searchParams.set('topType',type);
    if(value)url.searchParams.set('topSelection',value);else url.searchParams.delete('topSelection');
    window.history.replaceState(window.history.state,'',url);
  },[mode,value,type]);
  const picks=useMemo(()=>buildTopLooks({players,slate,books,season,type}),[slate,players,season,books,type]);
  const markets=Object.fromEntries(Object.entries(METRICS).map(([key,market])=>[key,market.label]));
  const kickDate=value&&mode==='day'?dayLabel(value):value?'Week '+value:'Upcoming';
  return <main className="top-looks chart-lab"><NflToolHeader active="top"/>
    <div className="top-looks-heading">
      <div><span className="top-kicker">MODEL RANKED PLAYER PROPS</span><h1>Top <em>Looks</em></h1>
        <p>Qualified picks ranked by recent production, usage, and matchup.</p></div>
      <span className="slate-count">{picks.length} QUALIFIED</span>
    </div>
    <section className="top-filter panel">
      <label>Show Picks By<FilterMenu value={mode} onChange={event=>{setMode(event.target.value);setSelected('');}}>
        <option value="day">Game Date</option><option value="week">Week</option>
      </FilterMenu></label>
      <label>{mode==='day'?'Date':'Week'}<FilterMenu value={value} onChange={event=>setSelected(event.target.value)}>
        {options.map(option=><option key={option} value={option}>{mode==='day'?dayLabel(option):'Week '+option}</option>)}
      </FilterMenu></label>
      <div className="pick-type" role="group" aria-label="Pick Type"><span>PICK TYPE</span><div><button type="button" aria-pressed={type==='anytime'} onClick={()=>setType('anytime')}>Anytime Touchdowns</button><button type="button" aria-pressed={type==='props'} onClick={()=>setType('props')}>Player Props</button></div></div>
      <span>{kickDate} · {slate.length} {slate.length===1?'game':'games'}</span>
      <details className="model-guide"><summary aria-label="What The Model Considers" title="What The Model Considers"><Info size={17}/></summary><div className="model-guide-panel"><b>WHAT TOP LOOKS CONSIDERS</b><p>Picks with real sportsbook lines come first. Within the real-line and average-line groups, picks sort by comparative model score; averages fill the remaining places after the sportsbook picks.</p><div className="model-guide-grid"><section><strong>38% · MARKET EDGE</strong><span>Estimated chance compared with available sportsbook odds after removing two-way vig. Anytime touchdown Yes prices are shown as listed, before removing margin.</span></section><section><strong>22% · PROJECTION</strong><span>Weighted season and recent averages compared with the selected prop line.</span></section><section><strong>12% · DEFENSE MATCHUP</strong><span>Whether the defense allows more or fewer of that position’s selected stat. Color reflects the bet direction.</span></section><section><strong>{type==='anytime'?'12%':'18%'} · WORKLOAD</strong><span>{type==='anytime'?'Attempts, carries, targets, touches, and team share, alongside red-zone scoring opportunities.':'Volume and team share are matched to the selected prop: pass attempts for passing props, carries for rushing props, and targets for receiving props.'}</span></section><section><strong>6% · WEATHER</strong><span>Wind, rain, and cold are used only when the forecast is available and relevant to the market.</span></section>{type==='anytime'&&<section><strong>6% · RED-ZONE USAGE</strong><span>Red-zone target share for receivers, carry share for runners and quarterbacks; running backs can benefit from either. Scoring-area volume is included when play-by-play data exists.</span></section>}<section className="guide-injuries"><strong>4% · INJURY EFFECTS FOR {type==='anytime'?'ANYTIME TOUCHDOWNS':'PLAYER PROPS'}</strong><span>{type==='anytime'?'Checks the selected player’s availability and meaningful absences among players who share scoring work, such as a lead running back or primary red-zone target. Red-zone opportunity data helps identify whether the injured player’s role overlaps.':'Checks the selected player’s availability and high-impact teammates whose absence could change this prop’s workload: QB1 for passing and receiving markets, or a leading same-position player for targets or carries. Only an estimated top role and a relevant injury status qualify.'} The effect is signed to the pick: an absence that supports this side can help it; one that creates risk can lower it. If no relevant injury is reported, or the player’s role cannot be estimated, the injury factor is neutral and the pick is unchanged.</span></section></div><small>The score is for comparing picks, not a win probability. Missing lines and odds are labeled. A date appears only when at least one future game is scheduled.</small></div></details>
    </section>
    {loading||error?<p>{error||'Loading Top Looks…'}</p>:picks.length?
      <section className="top-pick-list">{picks.map((pick,index)=>{
        const context=gameContext(pick.game,pick);
        const recentLabel=pick.recent.length?'last '+pick.recent.length:'recent';
        const shareLabel=pick.usageKey==='targets'?'Target Share':pick.usageKey==='carries'?'Carry Share':pick.usageKey==='attempts'?'Attempt Share':'Touch Share';
        const pickKey=pick.game.id+'|'+pick.player.id+'|'+pick.metric+'|'+pick.side;
        const whyId='pick-why-'+index;
        const whyOpen=openWhy===pickKey;
        return <article className="top-pick panel" key={pick.game.id+pick.player.id+pick.metric+pick.side} style={{'--club':teamColor(pick.player.team)||'#a775cf'}}>
          <div className="pick-rank"><b>{String(index+1).padStart(2,'0')}</b><small title="Comparative Model Score, Not A Percentage">{pick.rankScore} SCORE</small></div>
          <PlayerPhoto id={pick.player.id} name={pick.player.name} url={pick.player.photo}/>
          <div className="top-pick-main">
            <div className="top-matchup">{pick.player.team} · {pick.game.opponent} · {new Date(pick.game.kickoff).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</div>
            <h2>{pick.player.name}</h2><p>{pick.quote.anytime?(pick.side==='over'?'ANYTIME TD · YES':'ANYTIME TD · NO'):pick.side.toUpperCase()+' '+pick.line+' '+markets[pick.metric]}</p>
            <div className="pick-meta-row"><small className={'line-origin '+(pick.quote.isBookLine?'sportsbook':'average')}>{pick.quote.anytime?(pick.quote.isBookLine?'DRAFTKINGS ANYTIME TD ODDS':'MODEL ESTIMATE · NO ODDS'):pick.quote.isBookLine?'DRAFTKINGS LINE':'PLAYER AVERAGE LINE'}</small><button className="why-toggle" type="button" aria-expanded={whyOpen} aria-controls={whyId} onClick={()=>setOpenWhy(whyOpen?'':pickKey)}><Info size={14}/>{whyOpen?'Hide Why':'Why This Pick'}<ChevronDown size={14}/></button></div>
          </div>
          <div className="top-pick-stat projection-stat"><small>PROJECTION</small><b>{pick.projection.toFixed(1)}</b><small>vs. {pick.line} Line</small></div>
          <div className="top-pick-stat chance-stat"><small title="The model's predicted chance that this prop hits, based on the available data.">MODEL PREDICTED HIT RATE</small><b style={rateStyle(pick.chance)}>{formatRate(pick.chance)}</b><small>{pick.hits}/{pick.history.length} PRIOR · <span style={rateStyle(pick.hits/pick.history.length)}>{formatRate(pick.hits/pick.history.length)} PRIOR RATE</span></small></div>
          <div className="top-pick-stat defense-stat"><small>TOP REASON</small><b data-fit={pick.favoriteReason.label==='Matchup'?pick.matchupTone:undefined} style={pick.favoriteReason.label==='Matchup'?defenseRankStyle(pick.defense?.rank,32,pick.side):undefined}>{pick.favoriteReason.label}</b><small className="top-reason-detail">{pick.favoriteReason.label==='Matchup'?pick.matchup:pick.favoriteReason.detail}</small><small>{pick.quote.isBookLine?(pick.side==='over'?'DK YES ':'DK NO ')+(pick.side==='over'?pick.quote.over:pick.quote.under):'Odds unavailable'}</small></div>
          <div className="top-pick-actions">
            <button type="button" onClick={()=>onOpen(pick.player,{metric:pick.metric,point:pick.line,source:pick.quote.anytime?(pick.quote.isBookLine?'DraftKings Anytime TD Odds':'Model Estimate'):(pick.quote.isBookLine?'DraftKings':'Player Average')},pick.side,pick.game)}><Activity size={15}/>Charts</button>
          </div>
          <div id={whyId} className={'pick-reason-collapse'+(whyOpen?' is-open':'')} aria-hidden={!whyOpen}>
              <div className="pick-reason">
                <b>WHY THE MODEL LIKES THIS PICK</b>
                <div className="pick-reason-grid">
                  <section className="favorite-reason"><strong>TOP REASON · {pick.favoriteReason.label.toUpperCase()}</strong><span>{pick.favoriteReason.detail}</span></section>
                  <section><strong>RANKING SCORE · {pick.rankScore}/100</strong><span>Ranked #{index+1} of {picks.length}. This comparative score shows how strongly the available signals support the pick; it is not a hit probability. Tap the information button beside the filters for the full scoring method.</span></section>
                  <section><strong>HISTORICAL RESULTS</strong><span>{pick.side.toUpperCase()} hit {pick.hits} of {pick.history.length} prior games (<b style={rateStyle(pick.hits/pick.history.length)}>{formatRate(pick.hits/pick.history.length)} prior hit rate</b>); {pick.recentHits} of {pick.recent.length} in the {recentLabel}.</span></section>
                  <section><strong>PROJECTION</strong><span>{projectionReason(pick)}</span></section>
                  {pick.volumeSignal>.1&&<section><strong>{shareLabel.toUpperCase()}</strong><span>{fmtShare(pick.share.average)} of team {pick.usageKey} across {pick.share.count} recent games{pick.share.trend!=null?'; recent share '+(pick.share.trend>0?'+':'')+(pick.share.trend*100).toFixed(1)+' percentage points':''}.</span></section>}
                  {pick.usageTrend!=null&&pick.usageTrend*(pick.side==='over'?1:-1)>0&&<section><strong>RECENT WORKLOAD</strong><span>{pick.usageKey}: {pick.usageTrend>0?'+':''}{pick.usageTrend.toFixed(1)} per game over the last 3 compared with the previous 3.</span></section>}
                  {pick.defense&&<section><strong>DEFENSE MATCHUP</strong><span data-fit={pick.matchupTone} style={defenseRankStyle(pick.defense.rank,32,pick.side)}>{pick.game.opponent} · {pick.matchup.toLowerCase()} ({pick.defense.average.toFixed(1)} per game over {pick.defense.games} games).</span></section>}
                  {pick.metric==='scoredTDs'&&pick.scoring?.games>0&&(pick.scoring.targetShare!=null||pick.scoring.carryShare!=null)&&<section><strong>RED-ZONE USAGE · {pick.scoring.games} GAMES</strong><span>{pick.scoring.targetShare!=null?'Red-zone target share '+fmtShare(pick.scoring.targetShare):''}{pick.scoring.targetShare!=null&&pick.scoring.carryShare!=null?' · ':''}{pick.scoring.carryShare!=null?'Red-zone carry share '+fmtShare(pick.scoring.carryShare):''}{pick.scoring.redZoneTargets!=null?' · '+pick.scoring.redZoneTargets.toFixed(1)+' targets per game':''}{pick.scoring.redZoneCarries!=null?' · '+pick.scoring.redZoneCarries.toFixed(1)+' carries per game':''}{pick.scoring.redZoneTouches!=null?' · '+pick.scoring.redZoneTouches.toFixed(1)+' touches inside the 20 per game':''}{pick.scoring.inside5Touches!=null?' · '+pick.scoring.inside5Touches.toFixed(1)+' touches inside the 5 per game':''}.</span></section>}
                  {pick.quote.isBookLine&&pick.fairSide!=null&&pick.fairSide>=.52&&<section><strong>{pick.quote.anytime?'ANYTIME TD PRICE':'NO-VIG MARKET'}</strong><span>{pick.quote.anytime?'The listed Yes price implies '+formatRate(pick.fairSide)+' before removing sportsbook margin.':'Market price implies '+formatRate(pick.fairSide)+' for the '+pick.side+' side after removing the two-way vig.'}</span></section>}
                  {pick.weather&&pick.weather.signal>.08&&<section><strong>WEATHER FORECAST</strong><span>{pick.weather.details}. {pick.weather.interpretation}</span></section>}
                  {context.injuries.length>0&&<section className="injury-reason"><strong>KEY INJURIES</strong><span>{context.injuries.map(item=><span key={item.team+item.role+item.name}>{item.team} {item.role} · {item.name} · {item.status}{item.injury?' · '+item.injury:''}{Number.isFinite(item.volume)?' · '+item.volume.toFixed(1)+' workload per game':''}{item.selected?' · THIS PLAYER':''}</span>)}<small>Role ranks use recent team workload; only key skill-position reports are shown.</small></span></section>}
                </div>
              </div>
          </div>
        </article>;
      })}</section>:
      <section className="no-top-picks panel"><h2>No qualified picks for {kickDate}</h2>
        <p>Top Looks ranks real DraftKings lines first and uses a player-average line only when no sportsbook line is available. A short slate may have fewer than three picks.</p>
      </section>}
  </main>;
}

