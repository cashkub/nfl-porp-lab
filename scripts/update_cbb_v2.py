"""Build small, day-scoped CBB snapshots from hoopR and observed pregame odds."""
import json
import os
from collections import defaultdict
from datetime import datetime,timedelta,timezone
from pathlib import Path
from statistics import mean
from urllib.request import urlopen
from zoneinfo import ZoneInfo
from cbb_bracket import project
from cbb_model import Teams,Players,MARKETS,FIELDS,combine,outcomes
from cbb_feeds import injuries,instant,team_directory,d1_conferences

ROOT=Path(__file__).resolve().parents[1]/'public/data/cbb-v2'
CACHE=Path(os.environ.get('CBB_CACHE','/tmp/cbb-cache'))
ET=ZoneInfo('America/New_York')
SOURCE='https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb'
def read(path,default):
    return json.loads(path.read_text()) if path.exists() else default

def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,separators=(',',':'),allow_nan=False)+'\n')

def source(folder,prefix,season,cols):
    import pyarrow.parquet as pq
    path=CACHE/f'{prefix}_{season}.parquet'
    if not path.exists():
        CACHE.mkdir(parents=True,exist_ok=True)
        with urlopen(f'{SOURCE}/{folder}/parquet/{path.name}',timeout=120) as response:path.write_bytes(response.read())
    return pq.read_table(path,columns=cols.split()).to_pylist()

def expected(p,price,push=0):
    payout=price/100 if price>0 else 100/-price
    return round(p*payout-(1-p-push),4)

def choose(market,quotes,values,tid):
    candidates=[]
    for side,q in quotes.items():
        sign=1 if side in ('home','over') else -1
        if market=='Moneyline':
            chance=mean(1 if sign*v>0 else .5 if v==0 else 0 for v in values);push=0
        else:
            scores=[sign*(v-q['line']) if market=='Total' else sign*v+q['line'] for v in values]
            chance=mean(s>0 for s in scores);push=mean(s==0 for s in scores)
        candidates.append(dict(market=market,side=side,label=tid.get(side,side.title()),**q,
                               prob=round(chance,3),ev=expected(chance,q['price'],push)))
    return max(candidates,key=lambda r:r['ev'],default=None)


def main():
    now=datetime.now(timezone.utc);day=now.astimezone(ET).date()
    year=day.year+int(day.month>=7)
    days=[str(day+timedelta(days=i)) for i in range(3)]
    teams=Teams();teams.eval_year=year-1
    players=Players();names={};finals={};pending=[];actual={}
    player_errors=defaultdict(list)
    directory_file=ROOT/'team-directory.json'
    directory=team_directory(year,read(directory_file,{}))
    for season in range(year-2,year+1):
        teams.rollover()
        schedule=source('schedules','mbb_schedule',season,'game_id date status_type_completed status_period neutral_site home_id away_id home_conference_id away_conference_id home_display_name away_display_name home_color away_color venue_full_name home_score away_score')
        members=directory['conferences'] if season==year else d1_conferences(season)
        schedule=[g for g in schedule if str(g['home_id']) in members and str(g['away_id']) in members]
        box=source('team_box','team_box',season,'game_id team_id team_score field_goals_made field_goals_attempted three_point_field_goals_made free_throws_attempted offensive_rebounds defensive_rebounds total_turnovers')
        totals={(r['game_id'],r['team_id']):r for r in box}
        bygame=defaultdict(list)
        if season==year-1:
            eligible_games={g['game_id'] for g in schedule}
            prior=defaultdict(lambda:defaultdict(float))
            mapping={**{k:k for k in FIELDS},'threes':'three_point_field_goals_made','orb':'offensive_rebounds','drb':'defensive_rebounds','fgm':'field_goals_made','ftm':'free_throws_made','fga':'field_goals_attempted','tpa':'three_point_field_goals_attempted','fta':'free_throws_attempted','fouls':'fouls'}
            for r in source('player_box','player_box',season,'game_id athlete_id minutes '+' '.join(mapping.values())):
                if r['game_id'] not in eligible_games or not r['minutes'] or not r['athlete_id']:continue
                acc=prior[str(r['athlete_id'])]
                acc['minutes']+=r['minutes']
                for k,col in mapping.items():acc[k]+=r[col] or 0
            players.priors={pid:{k:a[k]/a['minutes'] for k in mapping} for pid,a in prior.items()}
        if season==year:
            for r in source('player_box','player_box',year,'game_id athlete_id athlete_display_name team_id minutes starter did_not_play athlete_position_abbreviation points rebounds assists steals blocks turnovers three_point_field_goals_made field_goals_attempted three_point_field_goals_attempted free_throws_attempted fouls field_goals_made free_throws_made offensive_rebounds defensive_rebounds'):
                bygame[r['game_id']].append(r)
        batch=[];previous_day=None
        for s in sorted(schedule,key=lambda r:r['date'] or ''):
            if not all(s.get(k) for k in ['date','home_id','away_id']):continue
            if not s['home_conference_id'] or not s['away_conference_id']:continue
            gid=s['game_id'];start=instant(s['date'])
            game_day=start.astimezone(ET).date()
            if previous_day!=game_day:
                for args in batch:teams.update(*args)
                batch.clear()
                previous_day=game_day
            g=dict(id=str(gid),time=s['date'],season=season,neutral=bool(s['neutral_site']),arena=s['venue_full_name'],
                   home=str(s['home_id']),away=str(s['away_id']),homeConf=s['home_conference_id'],awayConf=s['away_conference_id'])
            for side in ['home','away']:
                names[g[side]]=dict(name=s[side+'_display_name'],color=s[side+'_color'] or 'a87ecb')
            if start>now:
                if season==year and str(start.astimezone(ET).date()) in days:pending.append(g)
                continue
            if not s['status_type_completed']:continue
            if season==year and s['home_score'] is not None and s['away_score'] is not None:
                finals[g['id']]=[int(s['home_score']),int(s['away_score'])]
            h=totals.get((gid,s['home_id']));a=totals.get((gid,s['away_id']))
            if not h or not a or any(v is None for r in (h,a) for v in r.values()):continue
            poss=mean(r['field_goals_attempted']+.475*r['free_throws_attempted']-r['offensive_rebounds']+r['total_turnovers'] for r in [h,a])
            if season==year:
                if int(gid)%7==0:
                    hs,aws,pace,_=teams.forecast(g)
                    observed={str(r['athlete_id']):r for r in bygame[gid] if r['minutes']}
                    for t,o in [(g['home'],g['away']),(g['away'],g['home'])]:
                        venue='Neutral' if g['neutral'] else 'Home' if t==g['home'] else 'Away'
                        for proj in players.project(t,o,venue,pace,hs-aws,set(),teams.profile(t),teams.profile(o)):
                            row=observed.get(proj['id'])
                            if not row:continue
                            stats=combine({k:row.get('three_point_field_goals_made' if k=='threes' else k) or 0 for k in FIELDS})
                            player_errors['minutes'].append(abs(proj['minutes']-row['minutes']))
                            for k in MARKETS:player_errors[k].append(abs(proj['estimate'][k]-stats[k]))
                players.ingest(g,bygame[gid],poss*40/(40+5*max(0,(s['status_period'] or 2)-2)))
                for r in bygame[gid]:
                    if r['athlete_id']:
                        actual[g['id'],str(r['athlete_id'])]=None if not r['minutes'] else combine({k:r.get('three_point_field_goals_made' if k=='threes' else k) or 0 for k in FIELDS})
            batch.append((g,h,a,s['status_period'] or 2,teams.forecast(g),[teams.context(g,g[t],g[o]) for t,o in [('home','away'),('away','home')]]))
        for args in batch:teams.update(*args)
    if not players.logs or len(teams.errors)<100:raise ValueError('Incomplete CBB inputs')
    write(directory_file,directory)
    reports,report_ok=injuries()
    inactive={p for p,r in reports.items() if (r['status'] or '').lower() in ('out','inactive','suspended')}
    ranks={}
    groups=defaultdict(list)
    for (tid,group,metric),(obs,exp,n) in players.allow.items():
        if n>=5:groups[group,metric].append(((obs+35)/(exp+35),tid))
    for (group,metric),entries in groups.items():
        for rank,(_,tid) in enumerate(sorted(entries,reverse=True),1):ranks[tid,group,metric]=[rank,len(entries)]
    now=datetime.now(timezone.utc)
    pending=[g for g in pending if instant(g['time'])>now]
    archive=read(ROOT/'record.json',[])
    saved_winners={r['game'] for r in archive if r['market']=='Moneyline'}
    frozen=[r for r in archive if instant(r['time'])<=now]
    for r in frozen:
        result=finals.get(r['game'])
        if not result or r.get('result'):continue
        if r['market']=='Player prop':
            if (r['game'],r['pid']) not in actual:continue
            stats=actual[r['game'],r['pid']]
            if stats is None:r['result']='Void';continue
            diff=stats[r['metric']]-r['line'];diff*=1 if r['side']=='over' else -1
        elif r['market']=='Total':diff=(sum(result)-r['line'])*(1 if r['side']=='over' else -1)
        else:diff=(result[0]-result[1])*(1 if r['side']=='home' else -1)+r['line']
        r['result']='Win' if diff>0 else 'Loss' if diff<0 else 'Push'
    day_games=defaultdict(list);live=[];errors=teams.errors[-3500:]
    for g in pending:
        h,a=g['home'],g['away'];hs,aws,pace,court=teams.forecast(g);id=g['id']
        # Estimate the scoring lost after a replacement takes an unavailable player's minutes.
        def availability(t):
            rotation=players.appearances[t][-5:]
            if not rotation:return 0
            lost=0
            for pid in inactive:
                if players.last_team.get(pid)!=t:continue
                recent=[r for r in players.logs[pid] if r['game'] in rotation]
                lost+=sum(max(0,r['points']-.30*r['min']) for r in recent)/len(rotation)
            return min(9,round(lost,1))
        g['missingScoring']={t:availability(t) for t in (h,a)}
        hs-=g['missingScoring'][h];aws-=g['missingScoring'][a]
        g.update(homeScore=round(hs,1),awayScore=round(aws,1),pace=round(pace,1),court=round(court,1),
                 ratings={t:teams.profile(t) for t in [h,a]},rest={t:(instant(g['time']).date()-instant(teams.last[t]).date()).days if t in teams.last else None for t in [h,a]})
        score_draws=[(round(hs+x),round(aws+y)) for x,y in errors]
        margins=[x-y for x,y in score_draws];totals=[x+y for x,y in score_draws]
        g['homeWin']=round(mean(1 if m>0 else .5 if m==0 else 0 for m in margins),3)
        if id not in saved_winners and instant(g['time']).astimezone(ET).date()==day and instant(g['time'])>datetime.now(timezone.utc):
            side='home' if g['homeWin']>=.5 else 'away'
            archive.append(dict(game=id,time=g['time'],market='Moneyline',side=side,label=names[g[side]]['name'],
                                matchup=names[a]['name']+' @ '+names[h]['name'],away=a,home=h,
                                prob=round(max(g['homeWin'],1-g['homeWin']),3),price=None,line=0,
                                saved=datetime.now(timezone.utc).isoformat(),result=None))
            saved_winners.add(id)
        g['picks']=[]
        roster=[]
        for t,o in [(h,a),(a,h)]:
            v='Neutral' if g['neutral'] else 'Home' if t==h else 'Away'
            roster.extend(players.project(t,o,v,pace,hs-aws,inactive,g['ratings'][t],g['ratings'][o]))
        g['priced']=False
        g['injuries']=[r for pid,r in reports.items() if players.last_team.get(pid) in (h,a)]
        for p in roster:
            p.pop('draws')
            opponent=a if p['team']==h else h
            p['defenseRank']={k:ranks[opponent,p['role'],k] for k in FIELDS if (opponent,p['role'],k) in ranks}
        g['roster']=roster;g['lines']=[]
        day_games[str(instant(g['time']).astimezone(ET).date())].append(g)
    write(ROOT/'record.json',archive)
    for d in days:write(ROOT/(d+'.json'),day_games[d])
    for p in (ROOT.glob('????-??-??.json')):
        if p.stem not in days:p.unlink()
    grouped=defaultdict(dict)
    for pid,logs in players.logs.items():grouped[players.last_team[pid]][pid]=logs
    for tid,logs in grouped.items():write(ROOT/'teams'/(tid+'.json'),logs)
    write(ROOT/'index.json',dict(days=days,firstDay=next((d for d in days if day_games[d]),days[0]),teams=names,updated=now.isoformat(),season=year,injuryFeed=report_ok,
        evaluation=dict(playerCount=len(player_errors['minutes']),playerErrors={k:round(mean(values),1) for k,values in player_errors.items() if values},season=teams.eval_year,games=len(teams.check),marginMAE=round(mean(x[0] for x in teams.check),1),
                        totalMAE=round(mean(x[1] for x in teams.check),1),winner=round(mean(x[2] for x in teams.check),3))))
    if year==2027 and str(day)<='2027-03-14':
        bracket=project(schedule,directory['conferences'],teams,day,now.isoformat())
        folder=ROOT/'bracket'/str(year)
        write(folder/(str(day)+'.json'),bracket)
        write(ROOT/'bracket.json',dict(season=year,dates=sorted(p.stem for p in folder.glob('*.json'))))
    print(f'CBB: {len(pending)} upcoming games, {len(players.logs)} players, {len(teams.check)} chronological evaluation games')

if __name__=='__main__':main()
