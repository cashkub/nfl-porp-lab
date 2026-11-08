"""Build manual-line NBA and FBS datasets independently of the NFL and CBB jobs."""
import argparse
from collections import defaultdict
from datetime import date, datetime
from io import BytesIO
from urllib.error import HTTPError
from urllib.request import urlopen
from zoneinfo import ZoneInfo

import pyarrow.parquet as pq
from update_cbb import OUT, build, write, write_player_files

BASE = 'https://raw.githubusercontent.com/sportsdataverse'
CFB_FIELDS = {'passing': {'passingYards':'passingYards','passingTDs':'passingTouchdowns'},
              'rushing': {'rushingYards':'rushingYards','rushingAttempts':'rushingAttempts','rushTD':'rushingTouchdowns'},
              'receiving': {'receivingYards':'receivingYards','receptions':'receptions','recTD':'receivingTouchdowns'}}
CFB_MARKETS = ('passingYards','passingTDs','rushingAttempts','rushingYards','receivingYards','receptions','scoredTDs')


def download(repo,folder,name,year,columns=None):
    url=f'{BASE}/{repo}/main/{folder}/parquet/{name}_{year}.parquet'
    with urlopen(url,timeout=90) as response:
        return pq.read_table(BytesIO(response.read()),columns=columns).to_pylist()


def nba_rows(folder,name,year,columns):
    chosen=[c for c in columns if c not in ('groups_is_conference','groups_id','groups_name','home_conference_id','away_conference_id')]
    rows=download('hoopR-nba-data','nba/'+folder,'nba_schedule' if folder=='schedules' else name,year,[*chosen,'season_type'])
    selected=[]
    for row in rows:
        if row['season_type'] not in (2,3):
            continue
        ids=(row['home_id'],row['away_id']) if folder=='schedules' else (row['team_id'],row['opponent_team_id'])
        if any(t is None or not 1<=int(t)<=30 for t in ids):
            continue  # Exclude All-Star and exhibition rosters.
        if folder=='schedules':
            row.update(groups_is_conference=False,home_conference_id=None,away_conference_id=None)
        selected.append(row)
    return selected


def build_cfb(year,output):
    rows=download('cfbfastR-cfb-data','cfb/cfb_schedules','cfb_schedules',year)
    games,teams,conf,abbr={}, {}, {}, {}
    for r in rows:
        if not r['fbs_participant'] or not r['start_date'] or r['status'] in ('STATUS_CANCELED','STATUS_POSTPONED'):
            continue
        gid=str(r['game_id'])
        g={'id':gid,'season':year,'week':r['week'],'postseason':r['season_type']=='postseason','kickoff':r['start_date'],'neutral':bool(r['neutral_site']),
           'final':bool(r['completed']),'timeKnown':not r['start_time_tbd']}
        for side in ('away','home'):
            tid=str(r[side+'_id'])
            g[side]=tid
            g[side+'Name']=r[side+'_team']
            g[side+'Score']=r[side+'_points'] if g['final'] else None
            abbr[tid]=r[side+'_abbreviation']
            if r[side+'_division']=='fbs':
                teams[tid]=r[side+'_team']
                conf[tid]=r[side+'_conference'] or 'Independent'
        games[gid]=g
    boxes=download('cfbfastR-cfb-data','cfb/player_box','player_box',year)
    combined={}
    for row in boxes:
        category=row['category']
        gid,team,athlete=(str(row[k]) for k in ('game_id','team_id','athlete_id'))
        if category not in CFB_FIELDS or gid not in games or not games[gid]['final'] or not row['athlete_id']:
            continue
        name,stats=combined.setdefault((gid,team,athlete),(row['athlete_name'],dict.fromkeys(CFB_MARKETS,0)))
        for key,field in CFB_FIELDS[category].items():
            stats[key]=int(row[field] or 0)
    rosters,allowed=defaultdict(dict),defaultdict(dict)
    for (gid,team,athlete),(name,stats) in combined.items():
        g=games[gid]
        if team not in (g['away'],g['home']):
            continue
        home=team==g['home']
        opp=g['away' if home else 'home']
        stats['scoredTDs']=stats.pop('rushTD',0)+stats.pop('recTD',0)
        if opp in teams:
            totals=allowed[opp].setdefault(gid,dict.fromkeys(CFB_MARKETS,0))
            for k in CFB_MARKETS:
                totals[k]+=stats[k]
        if team not in teams:
            continue
        day=datetime.fromisoformat(g['kickoff'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date().isoformat()
        player=rosters[team].setdefault(athlete,{'id':athlete,'name':name,'games':[]})
        player['games'].append({'id':gid,'week':g['week'],'season':year,'date':day,'opponent':opp,'abbr':abbr.get(opp,opp),
                                'venue':'Neutral' if g['neutral'] else 'Home' if home else 'Away','stats':stats})
    if not rosters:
        raise ValueError(f'No FBS offensive player logs for {year}')
    ranks=write_player_files(output,year,rosters,teams,allowed,CFB_MARKETS)
    write(output/str(year)/'schedule.json',sorted(games.values(),key=lambda g:g['kickoff']))
    write(output/str(year)/'teams.json',{'teams':teams,'conferences':conf,'colors':{},'ranks':ranks})
    return max(g['date'] for players in rosters.values() for p in players.values() for g in p['games'])


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('sport',choices=['nba','cfb'])
    sport=parser.parse_args().sport
    output=OUT.parent/sport
    today=date.today()
    year=(today.year+int(today.month>=10)) if sport=='nba' else today.year-int(today.month<8)
    through={}
    for season in (year,year-1):
        try:
            through[season]=build(season,nba_rows,output) if sport=='nba' else build_cfb(season,output)
        except HTTPError as exc:
            if exc.code!=404 or season!=year or (output/str(season)/'teams.json').exists():
                raise
    write(output/'index.json',{'seasons':list(through),'through':through})
