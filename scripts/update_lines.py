"""Cache one DraftKings pregame prop snapshot per NFL event."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'public/data/lines.json'
API = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events'
MARKETS = {'player_rush_attempts': 'rushingAttempts', 'player_pass_yds': 'passingYards', 'player_rush_yds': 'rushingYards',
           'player_reception_yds': 'receivingYards', 'player_receptions': 'receptions'}
TD_MARKETS = {'player_pass_tds': 'passingTDs', 'player_tds': 'scoredTDs'}
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


def anytime_prices(event, checked):
    prices = []
    for book in event.get('bookmakers', []):
        if book['key'] != 'draftkings':
            continue
        for market in book.get('markets', []):
            if market['key'] != 'player_anytime_td':
                continue
            for outcome in market.get('outcomes', []):
                if outcome.get('name') == 'Yes' and outcome.get('description') and isinstance(outcome.get('price'), (int, float)):
                    prices.append({'player': outcome['description'], 'price': outcome['price'],
                                   'updated': market.get('last_update') or checked})
    return prices


EASTERN = ZoneInfo('America/New_York')
# Days ahead to include, counted using local game dates (Wednesday, Saturday, Sunday).
SLATE_OFFSETS = {2: (0, 1, 2), 5: (0, 1), 6: (1,)}


def in_scheduled_slate(now, kickoff):
    today = now.astimezone(EASTERN).date()
    days_ahead = (kickoff.astimezone(EASTERN).date() - today).days
    return kickoff > now and days_ahead in SLATE_OFFSETS.get(today.weekday(), ())


def main():
    if not os.environ.get('ODDS_API_KEY'):
        raise SystemExit('Add ODDS_API_KEY to enable sportsbook imports.')
    now = datetime.now(timezone.utc)
    games = {g['id']: g for g in json.loads(CACHE.read_text())['games']
             if datetime.fromisoformat(g['kickoff']) > now}
    if now.astimezone(EASTERN).weekday() not in SLATE_OFFSETS:
        return
    events, remaining = request('')
    for event in sorted(events, key=lambda e: e['commence_time']):
        kickoff = datetime.fromisoformat(event['commence_time'])
        previous = games.get(event['id'], {})
        if previous.get('version', 0) >= 4 or not in_scheduled_slate(now, kickoff):
            continue
        home = TEAMS.get(event['home_team'].split()[-1])
        away = TEAMS.get(event['away_team'].split()[-1])
        if not home or not away:
            continue
        version = previous.get('version', 0)
        markets = list(MARKETS if version < 2 else TD_MARKETS if version == 2 else ['player_tds'])
        markets.append('player_anytime_td')
        if remaining < len(markets):
            break
        details, remaining = request('/' + event['id'] + '/odds', bookmakers='draftkings',
                                     markets=','.join(markets), oddsFormat='american')
        checked = now.isoformat()
        lines = extract_lines(details, checked)
        prices = anytime_prices(details, checked)
        if previous or lines or prices:
            replaced = {(r['metric'], r['player'], r['point']) for r in lines}
            retained = [r for r in previous.get('lines', []) if (r['metric'], r['player'], r['point']) not in replaced]
            games[event['id']] = {'version': 4, 'id': event['id'], 'home': home, 'away': away,
                                  'kickoff': event['commence_time'], 'lines': retained + lines, 'anytime': prices}
    CACHE.write_text(json.dumps({'games':list(games.values())}, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
