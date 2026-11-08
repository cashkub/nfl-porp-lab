"""Enrich the weekly NFL slate with pregame efficiency, quarterback and forecast inputs."""
import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from nfl_features import Form, plays, number

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


def depth_chart(season,now):
    url=f'https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv'
    teams={}
    try:
        with urlopen(url,timeout=40) as response:
            for row in csv.DictReader(io.TextIOWrapper(response,encoding='utf-8-sig')):
                if row['pos_abb']!='QB' or not row['gsis_id'] or not row['pos_rank'].isdigit():continue
                dt=datetime.fromisoformat(row['dt'].replace('Z','+00:00'))
                if not 0<=(now-dt).total_seconds()<=10*86400:continue
                team=row['team']
                if team not in teams or dt>teams[team][0]:teams[team]=(dt,{})
                if dt==teams[team][0]:
                    teams[team][1][row['gsis_id']]={'id':row['gsis_id'],'rank':int(row['pos_rank']),'name':row['player_name']}
    except (OSError,ValueError,KeyError) as exc:
        print(f'Depth charts unavailable: {exc}')
    return {t:sorted(roster.values(),key=lambda q:q['rank']) for t,(_,roster) in teams.items()}


def enrich(payload,schedule_text):
    config=json.loads(Path(__file__).with_name('nfl_weights.json').read_text())
    season=max(payload['seasons'])
    rows=[r for r in csv.DictReader(io.StringIO(schedule_text)) if r['season']==str(season) and r['game_type']!='PRE']
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
    logs = {}
    for year in payload['seasons']:
        pbp_url = f'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.csv.gz'
        season_chances = {}
        try:
            with urlopen(pbp_url, timeout=65) as response:
                season_logs = plays(response.read(), season_chances, include_efficiency=(year == season))
            chances.update(season_chances)
            if year == season:
                logs = season_logs
        except (OSError,ValueError,KeyError) as exc:
            print(f'{year} play-by-play unavailable: {exc}')
    completed = {r['game_id'] for r in csv.DictReader(io.StringIO(schedule_text))
                 if number(r.get('result')) is not None}
    for player in payload['players']:
        for game in player['games']:
            key=(game['gameId'],normalize(game['team']))
            if key in chances and key[0] in completed:
                game['scoringChances']=chances[key].get(player['id'],[0,0,0,0,0])
    depths=depth_chart(season,now)
    form=Form()
    for r in sorted(rows,key=lambda r:(r['gameday'],r['gametime'])):
        if number(r.get('result')) is not None:form.add(logs.get(r['game_id'],{}))
    for g,r in games:
        w=weather.get(r['game_id'])
        info={'stadium':r['stadium'],'roof':r['roof'] or 'Unconfirmed','surface':r['surface'],
              'weather':w,'total':number(r.get('total_line')),'marketWeight':config['marketWeight']}
        for side in ('away','home'):
            unavailable={p['id'] for p in g.get('injuries',{}).get(g[side],[]) if (p.get('gameStatus') or '').lower()=='out'}
            chart=[q for q in depths.get(r[side+'_team'],depths.get(g[side],[])) if q['id'] not in unavailable]
            p=form.matchup(r,side,w if r['roof'] in ('open','outdoors') else None,chart)
            if p:
                delta={k:round((value-config['centers'][k])*config['weights'][k],3) for k,value in p['inputs'].items()}
                delta['Calibration']=round(config['intercept'],3)
                p['parts']=delta
                p['backupDelta']=round(p.pop('qbChange')*config['weights']['Quarterback'],2)
                info[side]=p
        g['id']=r['game_id'];g['context']=info
    payload['modelValidation']={'games':config['games'],'results':config['validation']}
    return {r['game_id']:[int(r['away_score']),int(r['home_score'])] for r in csv.DictReader(io.StringIO(schedule_text)) if number(r.get('result')) is not None}
