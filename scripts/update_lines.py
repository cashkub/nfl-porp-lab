"""Cache one DraftKings pregame prop snapshot per NFL event."""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'public/data/lines.json'
API = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events'
MARKETS = {'player_pass_yds': 'passingYards', 'player_rush_yds': 'rushingYards',
           'player_reception_yds': 'receivingYards', 'player_receptions': 'receptions'}
TEAMS = dict(zip(
    'Cardinals Falcons Ravens Bills Panthers Bears Bengals Browns Cowboys Broncos Lions Packers Texans Colts Jaguars Chiefs Chargers Rams Raiders Dolphins Vikings Patriots Saints Giants Jets Eagles Steelers Seahawks 49ers Buccaneers Titans Commanders'.split(),
    'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(), strict=True))


def request(path, **params):
    params['apiKey'] = os.environ['ODDS_API_KEY']
    try:
        with urlopen(API + path + '?' + urlencode(params), timeout=25) as response:
            return json.load(response), int(response.headers['x-requests-remaining'])
    except HTTPError as error:
        raise RuntimeError(f'Odds provider returned HTTP {error.code}') from None


def extract_lines(event, checked):
    lines = []
    for book in event.get('bookmakers', []):
        if book['key'] != 'draftkings':
            continue
        for market in book.get('markets', []):
            for outcome in market.get('outcomes', []):
                point = outcome.get('point')
                if (market['key'] in MARKETS and outcome['name'] == 'Over'
                        and outcome.get('description') and isinstance(point, (float, int))):
                    lines.append({'player': outcome['description'], 'metric': MARKETS[market['key']],
                                  'point': point, 'updated': market.get('last_update') or checked})
    return lines


def main():
    if not os.environ.get('ODDS_API_KEY'):
        print('Add ODDS_API_KEY to enable sportsbook imports.')
        return
    now = datetime.now(timezone.utc)
    games = {g['id']: g for g in json.loads(CACHE.read_text())['games']
             if datetime.fromisoformat(g['kickoff']) > now}
    events, remaining = request('')
    for event in sorted(events, key=lambda e: e['commence_time']):
        kickoff = datetime.fromisoformat(event['commence_time'])
        if event['id'] in games or not now < kickoff <= now + timedelta(hours=24):
            continue
        home = TEAMS.get(event['home_team'].split()[-1])
        away = TEAMS.get(event['away_team'].split()[-1])
        if not home or not away:
            continue
        if remaining < len(MARKETS):
            break
        details, remaining = request('/' + event['id'] + '/odds', bookmakers='draftkings',
                                     markets=','.join(MARKETS), oddsFormat='american')
        lines = extract_lines(details, now.isoformat())
        if lines:
            games[event['id']] = {'id':event['id'], 'home':home, 'away':away,
                                  'kickoff':event['commence_time'], 'lines':lines}
    CACHE.write_text(json.dumps({'games':list(games.values())}, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
