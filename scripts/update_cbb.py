"""Build compact men's basketball research data from public hoopR box scores."""
import json
import os
from collections import defaultdict
from datetime import date
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

import pyarrow.parquet as pq

OUT = Path(__file__).resolve().parents[1] / 'public/data/cbb'
SOURCE = 'https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb'
STATS = {'points':'points', 'rebounds':'rebounds', 'assists':'assists', 'threes':'three_point_field_goals_made'}


def read_source(folder, name, season, columns):
    with urlopen(f'{SOURCE}/{folder}/parquet/{name}_{season}.parquet', timeout=90) as response:
        return pq.read_table(BytesIO(response.read()), columns=columns).to_pylist()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':'), ensure_ascii=False) + '\n')


def build(season):
    fixtures = read_source('schedules','mbb_schedule',season,['game_id','neutral_site'])
    neutral = {str(g['game_id']) for g in fixtures if g['neutral_site']}
    columns = ['game_id','game_date','athlete_id','athlete_display_name','team_id','team_display_name',
               'opponent_team_id','opponent_team_abbreviation','home_away','minutes','did_not_play',*STATS.values()]
    rows = read_source('player_box','player_box',season,columns)
    rosters = defaultdict(dict)
    teams, allowed, seen = {}, defaultdict(dict), set()
    for row in rows:
        if row['did_not_play'] or row['minutes'] is None or not row['athlete_id'] or not row['team_id'] or not row['opponent_team_id']:
            continue
        if any(row[k] is None for k in STATS.values()):
            continue
        team, opp, game, player = (str(row[k]) for k in ('team_id','opponent_team_id','game_id','athlete_id'))
        if (team, game, player) in seen:
            continue
        seen.add((team, game, player))
        teams[team] = row['team_display_name'] or team
        stats = {k:int(row[v]) for k,v in STATS.items()}
        totals = allowed[opp].setdefault(game, dict.fromkeys(STATS, 0))
        for k in STATS:
            totals[k] += stats[k]
        venue = 'Neutral' if game in neutral else {'home':'Home','away':'Away'}.get(row['home_away'],'Unknown')
        p = rosters[team].setdefault(player, {'id':player,'name':row['athlete_display_name'],'games':[]})
        p['games'].append({'id':game,'date':str(row['game_date'])[:10], 'opponent':opp,
                           'abbr':row['opponent_team_abbreviation'] or opp,'venue':venue,
                           'minutes':row['minutes'],'stats':stats})
    if not teams:
        raise ValueError(f'No usable player games for {season}')
    ranks = {}
    for key in STATS:
        ordered = sorted(((sum(g[key] for g in games.values()) / len(games), tid)
                          for tid,games in allowed.items()), reverse=True)
        prev,rank = None,0
        for i,(value,tid) in enumerate(ordered,1):
            if value != prev:
                prev,rank = value,i
            ranks.setdefault(tid,{})[key] = rank
    for team,players in rosters.items():
        for p in players.values():
            p['games'].sort(key=lambda g:(g['date'],g['id']))
        write(OUT/str(season)/(team+'.json'), sorted(players.values(),key=lambda p:p['name'] or ''))
    write(OUT/str(season)/'teams.json', {'teams':teams,'ranks':ranks})
    return max(g['date'] for roster in rosters.values() for p in roster.values() for g in p['games'])


if __name__ == '__main__':
    today = date.today()
    current = today.year + int(today.month >= 11)
    seasons = [current,current-1]
    through = {}
    for season in seasons:
        through[season] = build(season)
    write(OUT/'index.json', {'seasons':seasons,'through':through})
