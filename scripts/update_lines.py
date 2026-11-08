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
MARKETS = {'player_rush_attempts': 'rushingAttempts', 'player_pass_yds': 'passingYards', 'player_rush_yds': 'rushingYards',
           'player_reception_yds': 'receivingYards', 'player_receptions': 'receptions'}
TD_MARKETS = {'player_pass_tds': 'passingTDs', 'player_rush_reception_tds': 'scoredTDs'}
MARKETS.update(TD_MARKETS)
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
            metric = MARKETS.get(market['key'])
            if not metric:
                continue
            paired = {}
            for outcome in market.get('outcomes', []):
                point, name = outcome.get('point'), outcome.get('description')
                side = outcome.get('name')
                if not name or not isinstance(point, (float, int)) or side not in ('Over', 'Under'):
                    continue
                line = paired.setdefault((name, point), {
                    'player': name, 'metric': metric, 'point': point,
                    'updated': market.get('last_update') or checked})
                line[side.lower()] = outcome.get('price')
            lines.extend(paired.values())
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
        previous = games.get(event['id'], {})
        if previous.get('version') == 3 or not now < kickoff <= now + timedelta(hours=24):
            continue
        home = TEAMS.get(event['home_team'].split()[-1])
        away = TEAMS.get(event['away_team'].split()[-1])
        if not home or not away:
            continue
        markets = TD_MARKETS if previous.get('version') == 2 else MARKETS
        if remaining < len(markets):
            break
        details, remaining = request('/' + event['id'] + '/odds', bookmakers='draftkings',
                                     markets=','.join(markets), oddsFormat='american')
        lines = extract_lines(details, now.isoformat())
        if previous.get('version') == 2:
            previous['lines'] = [line for line in previous['lines'] if line['metric'] not in TD_MARKETS.values()] + lines
            previous['version'] = 3
        elif lines:
            games[event['id']] = {'version':3, 'id':event['id'], 'home':home, 'away':away,
                                  'kickoff':event['commence_time'], 'lines':lines}
    CACHE.write_text(json.dumps({'games':list(games.values())}, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
