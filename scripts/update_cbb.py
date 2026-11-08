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

COMBINATIONS = {
    'pointsRebounds': ('points', 'rebounds'),
    'pointsAssists': ('points', 'assists'),
    'pointsReboundsAssists': ('points', 'rebounds', 'assists'),
}
MARKETS = (*STATS, *COMBINATIONS)


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


def write_player_files(output, season, rosters, teams, allowed, markets):
    if not teams:
        raise ValueError(f'No usable player games for {season}')
    ranks = {}
    for key in markets:
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
            roles={}
            if 'usage' in recent[0]:
                roles={'passing':sum(g['usage']['attempts']>0 for g in recent),
                       'rushing':sum(g['stats']['rushingAttempts']>0 for g in recent),
                       'receiving':sum(g['stats']['receptions']>0 for g in recent),
                       'scoring':sum(g['usage']['opportunities']>0 for g in recent)}
            board.append({**({'roleGames':roles} if roles else {}),'id':p['id'],'name':p['name'],'team':team,
                          **({'minutes':round(sum(g['minutes'] for g in recent)/len(recent),1)} if 'minutes' in recent[0] else {}),
                          'recent':{key:[g['stats'][key] for g in recent] for key in markets}})
        write(output/str(season)/(team+'.json'), sorted(players.values(),key=lambda p:p['name'] or ''))
    write(output/str(season)/'board.json', board)
    return ranks


def build(season, load=read_source, output=OUT):
    fixtures = load('schedules','mbb_schedule',season,['game_id','neutral_site','home_id','away_id',
        'home_conference_id','away_conference_id','groups_id','groups_name','groups_is_conference','date','home_color','away_color','home_display_name','away_display_name','home_score','away_score','status_type_completed'])
    neutral = {str(g['game_id']) for g in fixtures if g['neutral_site']}
    columns = ['game_id','game_date','athlete_id','athlete_display_name','team_id','team_display_name',
               'opponent_team_id','opponent_team_abbreviation','home_away','minutes','field_goals_attempted','three_point_field_goals_attempted','did_not_play',*STATS.values()]
    rows = load('player_box','player_box',season,columns)
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
        stats.update({key: sum(stats[field] for field in fields) for key, fields in COMBINATIONS.items()})
        totals = allowed[opp].setdefault(game, dict.fromkeys(MARKETS, 0))
        for k in MARKETS:
            totals[k] += stats[k]
        venue = 'Neutral' if game in neutral else {'home':'Home','away':'Away'}.get(row['home_away'],'Unknown')
        p = rosters[team].setdefault(player, {'id':player,'name':row['athlete_display_name'],'games':[]})
        p['games'].append({'id':game,'date':str(row['game_date'])[:10], 'opponent':opp,
                           'abbr':row['opponent_team_abbreviation'] or opp,'venue':venue,
                           'minutes':row['minutes'],'shots':row['field_goals_attempted'],'threeAttempts':row['three_point_field_goals_attempted'],'stats':stats})
    ranks = write_player_files(output, season, rosters, teams, allowed, MARKETS)
    schedule = []
    colors = {}
    for g in fixtures:
        if not g['date'] or not g['home_id'] or not g['away_id']:
            continue
        game = {'id':str(g['game_id']), 'kickoff':str(g['date']), 'final':bool(g['status_type_completed']),
                'neutral':bool(g['neutral_site'])}
        for side in ('home','away'):
            tid = str(g[side+'_id'])
            game[side] = tid
            game[side+'Name'] = g[side+'_display_name'] or teams.get(tid, tid)
            game[side+'Score'] = g[side+'_score'] if game['final'] else None
            if g[side+'_color']:
                colors[tid] = g[side+'_color']
        schedule.append(game)
    write(output/str(season)/'schedule.json', sorted(schedule,key=lambda g:g['kickoff']))
    affiliations = conference_membership(fixtures)
    conferences = {tid:affiliations.get(tid, 'Unclassified') for tid in teams}
    write(output/str(season)/'teams.json', {'teams':teams,'colors':colors,'ranks':ranks,'conferences':conferences})
    return max(g['date'] for roster in rosters.values() for p in roster.values() for g in p['games'])


if __name__ == '__main__':
    today = date.today()
    current = today.year + int(today.month >= 11)
    seasons = [current,current-1]
    through = {}
    for season in seasons:
        through[season] = build(season)
    write(OUT/'index.json', {'seasons':seasons,'through':through})
