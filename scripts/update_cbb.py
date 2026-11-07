"""Build compact men's basketball research data from public hoopR box scores."""
import json
import os
from collections import Counter, defaultdict
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


def conference_membership(fixtures):
    # Match each school's own conference ID, including on nonconference games.
    names = {}
    ids = defaultdict(Counter)
    for g in fixtures:
        if g['groups_is_conference'] and g['groups_id'] and g['groups_name']:
            names[str(g['groups_id'])] = g['groups_name']
        for side in ('home', 'away'):
            team, conf = g[f'{side}_id'], g[f'{side}_conference_id']
            if team and conf:
                ids[str(team)][str(conf)] += 1
    return {team:names[conf] for team, counts in ids.items()
            for conf, _ in counts.most_common(1) if conf in names}


def build(season):
    fixtures = read_source('schedules','mbb_schedule',season,['game_id','neutral_site','home_id','away_id',
        'home_conference_id','away_conference_id','groups_id','groups_name','groups_is_conference'])
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
    board = []
    for team,players in rosters.items():
        for p in players.values():
            p['games'].sort(key=lambda g:(g['date'],g['id']))
            recent = p['games'][-10:]
            board.append({'id':p['id'],'name':p['name'],'team':team,
                          'recent':{key:[g['stats'][key] for g in recent] for key in STATS}})
        write(OUT/str(season)/(team+'.json'), sorted(players.values(),key=lambda p:p['name'] or ''))
    write(OUT/str(season)/'board.json', board)
    affiliations = conference_membership(fixtures)
    conferences = {tid:affiliations.get(tid, 'Unclassified') for tid in teams}
    write(OUT/str(season)/'teams.json', {'teams':teams,'ranks':ranks,'conferences':conferences})
    return max(g['date'] for roster in rosters.values() for p in roster.values() for g in p['games'])


if __name__ == '__main__':
    today = date.today()
    current = today.year + int(today.month >= 11)
    seasons = [current,current-1]
    through = {}
    for season in seasons:
        through[season] = build(season)
    write(OUT/'index.json', {'seasons':seasons,'through':through})
