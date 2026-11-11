"""Enrich the weekly NFL slate with pregame efficiency, quarterback and forecast inputs."""
from collections import Counter
import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from nfl_features import Form, plays, number
from elo_backtest import evaluate_rows as evaluate_elo_rows, upcoming_forecasts

SKILL_POSITIONS={'QB','RB','FB','WR','TE'}

# Venue coordinates rounded to the forecast grid. Keys identify the venue, including neutral sites.
VENUES={'BAL00':(39.28,-76.62),'BOS00':(42.09,-71.26),'BUF00':(42.77,-78.79),
        'CAR00':(35.23,-80.85),'CHI98':(41.86,-87.62),'CIN00':(39.10,-84.52),
        'CLE00':(41.51,-81.70),'DEN00':(39.74,-105.02),'GNB00':(44.50,-88.06),
        'JAX00':(30.32,-81.64),'KAN00':(39.05,-94.48),'MEX00':(19.30,-99.15),
        'MIA00':(25.96,-80.24),'NAS00':(36.17,-86.77),'NYC01':(40.81,-74.07),
        'PHI00':(39.90,-75.17),'PIT00':(40.45,-80.02),'SEA00':(47.60,-122.33),
        'SFO01':(37.40,-121.97),'TAM00':(27.98,-82.50),'WAS00':(38.91,-76.86),
        'MAD01':(40.45,-3.69),'ATL97':(33.76,-84.40),'DAL00':(32.75,-97.09),
        'HOU00':(29.68,-95.41),'IND00':(39.76,-86.16),'PHO00':(33.53,-112.26)}


def forecast(item):
    game,row=item
    coords=VENUES.get(row.get('stadium_id'))
    kickoff=datetime.fromisoformat(game['kickoff']).astimezone(timezone.utc)
    if not coords or row.get('roof') in ('dome','closed') or not game['timeKnown']:
        return None
    params=dict(latitude=coords[0],longitude=coords[1],timezone='GMT',temperature_unit='fahrenheit',
                wind_speed_unit='mph',hourly='temperature_2m,wind_speed_10m,precipitation_probability',
                start_date=kickoff.date().isoformat(),end_date=kickoff.date().isoformat())
    try:
        with urlopen('https://api.open-meteo.com/v1/forecast?'+urlencode(params),timeout=12) as r:
            h=json.load(r)['hourly']
        i=h['time'].index(kickoff.strftime('%Y-%m-%dT%H:00'))
        return {'temp':h['temperature_2m'][i],'wind':h['wind_speed_10m'][i],'rain':h['precipitation_probability'][i],
                'asOf':datetime.now(timezone.utc).isoformat(timespec='minutes')}
    except (OSError,ValueError,KeyError,IndexError):
        return None


def _timestamp(value):
    if not value:return None
    try:
        result=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except ValueError:
        return None


def parse_depth_charts(text,now):
    """Read the current timestamped nflverse charts (2025+ schema)."""
    latest_by_team={}
    for row in csv.DictReader(io.StringIO(text)):
        player_id=(row.get('gsis_id') or '').strip()
        team=(row.get('team') or row.get('club_code') or row.get('depth_team') or '').strip().upper()
        position=(row.get('pos_abb') or row.get('position') or row.get('depth_position') or '').strip().upper()
        stamp=_timestamp(row.get('dt'))
        if not player_id or not team or position not in SKILL_POSITIONS or not stamp:continue
        age=(now.astimezone(timezone.utc)-stamp).total_seconds()
        if age<0 or age>10*86400:continue
        try:rank=int(float(row.get('pos_rank') or row.get('depth_team') or 99))
        except (TypeError,ValueError):rank=99
        if rank<1:continue
        entry={'id':player_id,'team':team,'position':position,'rank':rank,
               'slot':(row.get('pos_slot') or '').strip(),
               'name':(row.get('player_name') or row.get('full_name') or '').strip(),
               'updatedAt':stamp.isoformat()}
        previous=latest_by_team.get(team)
        if previous is None or stamp>previous[0]:latest_by_team[team]=(stamp,{})
        if stamp==latest_by_team[team][0]:
            key=(player_id,position)
            old=latest_by_team[team][1].get(key)
            if old is None or rank<old['rank']:latest_by_team[team][1][key]=entry
    teams={team:sorted(roster.values(),key=lambda item:(item['position'],item['rank'],item['name']))
           for team,(_,roster) in latest_by_team.items()}
    by_player={}
    conflicts=set()
    for team,roster in teams.items():
        for entry in roster:
            old=by_player.get(entry['id'])
            stamp=_timestamp(entry['updatedAt'])
            old_stamp=_timestamp(old['updatedAt']) if old else None
            if old is None or stamp>old_stamp:
                by_player[entry['id']]=entry.copy();conflicts.discard(entry['id'])
            elif stamp==old_stamp and old['team']!=team:
                conflicts.add(entry['id'])
    for player_id in conflicts:by_player.pop(player_id,None)
    newest=max((entry['updatedAt'] for rows in teams.values() for entry in rows),default=None)
    return {'source':'nflverse depth charts','updatedAt':newest,'teams':teams,'players':by_player}


def depth_chart(season,now):
    url=f'https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv'
    try:
        with urlopen(url,timeout=40) as response:
            return parse_depth_charts(io.TextIOWrapper(response,encoding='utf-8-sig').read(),now)
    except (OSError,ValueError,KeyError) as exc:
        print(f'Depth charts unavailable: {exc}')
        return {'source':'nflverse depth charts','updatedAt':None,'teams':{},'players':{}}


def current_roster(season,depth,now):
    """Overlay daily roster membership/status with the latest depth-chart roles."""
    url=f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv'
    try:
        with urlopen(url,timeout=40) as response:
            text=io.TextIOWrapper(response,encoding='utf-8-sig').read()
    except (OSError,ValueError) as exc:
        print(f'Current roster unavailable: {exc}')
        return None
    players={}
    excluded={'CUT','UFA','NWT','TRC','TRD','TRT','RET'}
    for row in csv.DictReader(io.StringIO(text)):
        player_id=(row.get('gsis_id') or '').strip()
        team=(row.get('team') or '').strip().upper()
        if not player_id or not team:continue
        status=(row.get('status') or '').strip().upper()
        if status in excluded:continue
        chart=depth.get('players',{}).get(player_id,{})
        if chart and chart['team']!=team:chart={}
        entry={'team':team,'position':(row.get('position') or chart.get('position') or '').strip().upper(),
               'status':status or 'UNK','name':(row.get('full_name') or chart.get('name') or '').strip(),
               'photo':row.get('headshot_url') or '', 'active':status=='ACT',
               'depthChartPosition':chart.get('position'),'depthChartRank':chart.get('rank'),
               'depthChartSlot':chart.get('slot'),
               'depthChartUpdatedAt':chart.get('updatedAt')}
        players[player_id]=entry
    if not players:return None
    updated=now.astimezone(timezone.utc).isoformat(timespec='minutes')
    return {'source':'nflverse current roster + depth charts','checkedAt':updated,
            'depthChartsUpdatedAt':depth.get('updatedAt'),'players':players}


def attach_current_roster(payload,roster,season):
    if not roster:
        cached_path=Path(__file__).resolve().parents[1]/'public'/'data'/'stats.json'
        try:
            cached=json.loads(cached_path.read_text(encoding='utf-8')).get('currentRoster')
            checked=_timestamp((cached or {}).get('checkedAt'))
            if checked and (datetime.now(timezone.utc)-checked).total_seconds()<=3*86400:
                roster=cached
                print('Using current-roster cache after upstream roster refresh failed.')
        except (OSError,ValueError,TypeError):
            pass
    if not roster:return None
    payload['currentRoster']=roster
    by_id=roster['players']
    existing={player['id'] for player in payload.get('players',[])}
    for player in payload.get('players',[]):
        current=by_id.get(player['id'])
        if not current:
            player.update({'team':None,'currentTeam':None,'currentRoster':False,
                           'rosterStatus':'NOT ON CURRENT ROSTER','rosterActive':False,
                           'depthChartPosition':None,'depthChartRank':None,'depthChartSlot':None,'depthChartUpdatedAt':None})
            continue
        player.update({'team':current['team'],'currentTeam':current['team'],'currentRoster':True,
                       'rosterStatus':current['status'],'rosterActive':current['active'],
                       'depthChartPosition':current['depthChartPosition'],
                       'depthChartRank':current['depthChartRank'],'depthChartSlot':current.get('depthChartSlot'),
                       'depthChartUpdatedAt':current['depthChartUpdatedAt']})
        if current.get('position'):player['position']=current['position']
        if current.get('photo'):player['photo']=current['photo']
    for player_id,current in by_id.items():
        if player_id in existing or current['position'] not in SKILL_POSITIONS:continue
        if current['status'] not in ('ACT','DEV') and not current.get('depthChartRank'):continue
        payload.setdefault('players',[]).append({'id':player_id,'name':current['name'],
            'position':current['position'],'team':current['team'],'currentTeam':current['team'],'currentRoster':True,
            'rosterStatus':current['status'],'rosterActive':current['active'],
            'depthChartPosition':current['depthChartPosition'],'depthChartRank':current['depthChartRank'],
            'depthChartSlot':current.get('depthChartSlot'),
            'depthChartUpdatedAt':current['depthChartUpdatedAt'],'photo':current.get('photo') or '',
            'seasons':[season],'games':[]})
    return roster


def enrich(payload,schedule_text):
    config=json.loads(Path(__file__).with_name('nfl_weights.json').read_text())
    season=max(payload['seasons'])
    all_schedule_rows=list(csv.DictReader(io.StringIO(schedule_text)))
    regular_schedule_rows=[r for r in all_schedule_rows if r['game_type']=='REG']
    elo_forecasts=upcoming_forecasts(regular_schedule_rows,current_season=season)
    elo_report=evaluate_elo_rows(regular_schedule_rows)
    latest_elo_fold=elo_report['folds'][-1] if elo_report['folds'] else None
    rows=[r for r in all_schedule_rows if r['season']==str(season) and r['game_type']!='PRE']
    lookup={(r['gameday'],r['week'],r['away_team'],r['home_team']):r for r in rows}
    normalize=lambda team:{'LAR':'LA','WAS':'WAS','JAX':'JAX'}.get(team,team)
    games=[]
    for g in payload.get('schedule',[]):
        r=lookup.get((g['date'],g['week'],normalize(g['away']),normalize(g['home'])))
        if r and g['season']==season:
            games.append((g,r))
    now=datetime.now(timezone.utc)
    near=[item for item in games if 0<(datetime.fromisoformat(item[0]['kickoff'])-now).total_seconds()<7*86400]
    with ThreadPoolExecutor(max_workers=4) as pool:
        weather={r['game_id']:w for (_,r),w in zip(near,pool.map(forecast,near))}
    chances = {}
    red_zone = {}
    logs = {}
    for year in payload['seasons']:
        pbp_url = f'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.csv.gz'
        season_chances = {}
        try:
            with urlopen(pbp_url, timeout=65) as response:
                season_logs = plays(response.read(), season_chances, include_efficiency=(year == season),
                                    red_zone=red_zone if year == season else None)
            chances.update(season_chances)
            if year == season:
                logs = season_logs
        except (OSError,ValueError,KeyError) as exc:
            if year == season:
                red_zone.clear()
            print(f'{year} play-by-play unavailable: {exc}')
    completed = {r['game_id'] for r in csv.DictReader(io.StringIO(schedule_text))
                 if number(r.get('result')) is not None}
    for player in payload['players']:
        for game in player['games']:
            key=(game['gameId'],normalize(game['team']))
            if key in chances and key[0] in completed:
                game['scoringChances']=chances[key].get(player['id'],[0,0,0,0,0])
    depths=depth_chart(season,now)
    roster=current_roster(season,depths,now)
    roster=attach_current_roster(payload,roster,season)
    form=Form()
    for r in sorted(rows,key=lambda r:(r['gameday'],r['gametime'])):
        if number(r.get('result')) is not None:form.add(logs.get(r['game_id'],{}))
    for g,r in games:
        w=weather.get(r['game_id'])
        info={'stadium':r['stadium'],'roof':r['roof'] or 'Unconfirmed','surface':r['surface'],
              'weather':w,'total':number(r.get('total_line')),'marketWeight':config['marketWeight']}
        for side in ('away','home'):
            team = r[side+'_team']
            prior = [red_zone[(past['game_id'],team)] for past in rows
                     if past['game_id'] in completed and int(past['week']) < int(r['week'])
                     and (past['game_id'],team) in red_zone]
            if prior:
                outcomes = Counter(outcome for drives in prior for outcome in drives.values())
                info.setdefault('redZoneDefense', {})[g[side]] = {
                    'games': len(prior), 'trips': sum(len(drives) for drives in prior),
                    'touchdowns': outcomes['rushTD'] + outcomes['passTD'] + outcomes['otherTD'],
                    'rushingTDs': outcomes['rushTD'], 'passingTDs': outcomes['passTD'],
                    'otherTDs': outcomes['otherTD']}
            unavailable={p['id'] for p in g.get('injuries',{}).get(g[side],[]) if (p.get('gameStatus') or '').lower()=='out'}
            chart=[q for q in depths.get('teams',{}).get(r[side+'_team'],depths.get('teams',{}).get(g[side],[]))
                   if q['position']=='QB' and q['id'] not in unavailable]
            p=form.matchup(r,side,w if r['roof'] in ('open','outdoors') else None,chart)
            if p:
                delta={k:round((value-config['centers'][k])*config['weights'][k],3) for k,value in p['inputs'].items()}
                delta['Calibration']=round(config['intercept'],3)
                p['parts']=delta
                p['backupDelta']=round(p.pop('qbChange')*config['weights']['Quarterback'],2)
                info[side]=p
        if r['game_id'] in elo_forecasts:
            info['elo']=elo_forecasts[r['game_id']]
        if roster:
            info['rosterUpdatedAt']=roster.get('checkedAt')
            info['depthChartsUpdatedAt']=roster.get('depthChartsUpdatedAt')
        info['injuriesUpdatedAt']=g.get('injuriesUpdatedAt')
        g['id']=r['game_id'];g['context']=info
    payload['modelValidation']={'games':config['games'],'results':config['validation'],
                                'elo':{'model':elo_report['model'],'marketNote':elo_report['marketNote'],
                                       'latest':latest_elo_fold}}
    return {r['game_id']:[int(r['away_score']),int(r['home_score'])] for r in all_schedule_rows if number(r.get('result')) is not None}
