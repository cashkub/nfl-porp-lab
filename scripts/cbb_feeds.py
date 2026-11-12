"""Public ESPN inputs for college basketball."""
import json
from datetime import datetime
from urllib.request import urlopen

ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/'
def get(url):
    with urlopen(url,timeout=30) as r:return json.load(r),r.headers


def instant(value):
    return datetime.fromisoformat(value.replace('Z','+00:00'))


def injuries():
    try:data,_=get(ESPN+'injuries?limit=1000')
    except (OSError,ValueError):return {},False
    results={}
    for team in data.get('injuries',[]):
        for r in team.get('injuries',[]):
            a=r.get('athlete') or {}
            if a.get('id'):
                results[str(a['id'])]={'name':a.get('displayName'),'status':r.get('status'),'date':r.get('date')}
    return results,True


def team_directory(season, previous):
    data = dict(previous) if previous.get('season') == season else {'season': season}
    try:
        polls, _ = get(ESPN + 'rankings')
        poll = next((p for p in polls.get('rankings', []) if p.get('name') == 'AP Top 25'
                     and p.get('season', {}).get('year') == season), {})
        ranks = {str(r['team']['id']): r['current'] for r in poll.get('ranks', [])
                 if 1 <= r.get('current', 0) <= 25}
        if len(ranks) >= 25:
            data.update(ranks=ranks, pollDate=poll.get('lastUpdated'))
    except (OSError, ValueError):
        pass
    try:
        url = ESPN.replace('/apis/site/v2/', '/apis/v2/') + f'standings?season={season}'
        standings, _ = get(url)
        conferences = {str(entry['team']['id']): c['name'] for c in standings.get('children', [])
                       for entry in c.get('standings', {}).get('entries', [])}
        if conferences:
            data['conferences'] = conferences
    except (OSError, ValueError):
        pass
    return data
