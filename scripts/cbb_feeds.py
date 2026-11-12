"""Match sportsbook events to college teams using both names and tip time."""
import json
import os
import re
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from urllib.parse import urlencode
from urllib.request import urlopen

ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/'
ODDS='https://api.the-odds-api.com/v4/sports/basketball_ncaab/events'
ODDS_MARKETS={'player_points':'points','player_rebounds':'rebounds','player_assists':'assists',
              'player_threes':'threes','player_steals':'steals','player_blocks':'blocks',
              'player_turnovers':'turnovers','player_points_rebounds_assists':'PRA',
              'player_points_rebounds':'PR','player_points_assists':'PA','player_rebounds_assists':'RA'}


def get(url):
    with urlopen(url,timeout=30) as r:return json.load(r),r.headers


def key(name):
    text=unicodedata.normalize('NFKD',str(name)).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]','',text)


def instant(value):
    return datetime.fromisoformat(value.replace('Z','+00:00'))


def game_prices(days):
    games={}
    for day in days:
        try:data,_=get(ESPN+'scoreboard?'+urlencode(dict(dates=day.replace('-',''),groups=50,limit=500)))
        except (OSError,ValueError):continue
        for event in data['events']:
            if event['status']['type']['state']!='pre':continue
            rows=event['competitions'][0].get('odds',[])
            q=next((q for q in rows if q.get('provider',{}).get('name')=='DraftKings'),{})
            markets={}
            for market,name,sides in [('moneyline','Moneyline',['home','away']),('pointSpread','Spread',['home','away']),('total','Total',['over','under'])]:
                for side in sides:
                    quote=q.get(market,{}).get(side,{}).get('close',{})
                    try:
                        price=int(quote['odds'])
                        line=0 if market=='moneyline' else float(str(quote['line']).lower().lstrip('ou'))
                    except (KeyError,ValueError,TypeError):continue
                    if abs(price)>=100:markets.setdefault(name,{})[side]={'price':price,'line':line}
            games[event['id']]=markets
    return games


def supplement_game_prices(fixtures,names,book):
    api=os.getenv('ODDS_API_KEY')
    if not api or all(book.get(g['id']) for g in fixtures):return
    try:
        _,headers=get(ODDS+'?'+urlencode({'apiKey':api}))
        if int(headers.get('x-requests-remaining','0'))<int(os.getenv('CBB_ODDS_RESERVE','300'))+3:return
        events,_=get(ODDS.rsplit('/',1)[0]+'/odds?'+urlencode(dict(apiKey=api,bookmakers='draftkings',markets='h2h,spreads,totals',oddsFormat='american')))
    except (ValueError,OSError):
        print('CBB supplementary game feed unavailable.')
        return
    for e in events:
        possible=[g for g in fixtures if abs((instant(g['time'])-instant(e['commence_time'])).total_seconds())<=1800 and
                  all(SequenceMatcher(None,key(e[s+'_team']),key(names[g[s]]['name'])).ratio()>=.75 for s in ('home','away'))]
        if len(possible)!=1:continue
        markets=book.setdefault(possible[0]['id'],{})
        for vendor in e.get('bookmakers',[]):
            if vendor['key']!='draftkings':continue
            for m in vendor['markets']:
                market={'h2h':'Moneyline','spreads':'Spread','totals':'Total'}.get(m['key'])
                if not market or markets.get(market):continue
                for o in m['outcomes']:
                    side={e['home_team']:'home',e['away_team']:'away','Over':'over','Under':'under'}.get(o['name'])
                    if side and abs(o['price'])>=100:markets.setdefault(market,{})[side]=dict(price=o['price'],line=o.get('point',0))


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


def props(fixtures,names,prior,now):
    # Free event discovery, bounded paid requests, and a reserve for NFL pulls.
    api=os.getenv('ODDS_API_KEY')
    budget=int(os.getenv('CBB_PROP_EVENT_LIMIT','2'))
    reserve=int(os.getenv('CBB_ODDS_RESERVE','300'))
    recent={g['id']:prior[g['id']] for g in fixtures if g['id'] in prior and
            (now-instant(prior[g['id']]['checked'])).total_seconds()<86400}
    if not api or not budget:return recent
    def request(path,params):
        try:return get(ODDS+path+'?'+urlencode({**params,'apiKey':api}))
        except (OSError,ValueError):raise RuntimeError('CBB odds provider unavailable') from None
    try:
        events,headers=request('',{})
        remaining=int(headers.get('x-requests-remaining','0'))
        choices=[]
        for e in events:
            candidates=[]
            for g in fixtures:
                if abs((instant(g['time'])-instant(e['commence_time'])).total_seconds())>1800:continue
                sims=[SequenceMatcher(None,key(e[s+'_team']),key(names[g[s]]['name'])).ratio() for s in ('home','away')]
                if min(sims)>=.72:candidates.append((sum(sims),g))
            candidates.sort(key=lambda pair:-pair[0])
            if not candidates or len(candidates)>1 and candidates[0][0]-candidates[1][0]<.15:continue
            g=candidates[0][1]
            choices.append((g,e))
        choices.sort(key=lambda pair:(pair[0]['id'] in recent,pair[0]['time']))
        for g,e in choices[:budget]:
            if remaining-reserve<len(ODDS_MARKETS):break
            details,h=request('/'+e['id']+'/odds',dict(bookmakers='draftkings',markets=','.join(ODDS_MARKETS),oddsFormat='american'))
            remaining=int(h.get('x-requests-remaining','0'))
            quotes={}
            for book in details.get('bookmakers',[]):
                if book['key']!='draftkings':continue
                for market in book['markets']:
                    for o in market['outcomes']:
                        if market['key'] not in ODDS_MARKETS or o.get('name') not in ('Over','Under') or o.get('point') is None:continue
                        name=o.get('description')
                        if not name:continue
                        ident=(name,ODDS_MARKETS[market['key']],o['point'])
                        quotes.setdefault(ident,dict(name=name,metric=ident[1],line=ident[2]))[o['name'].lower()]=o['price']
            recent[g['id']]={'checked':now.isoformat(),'lines':list(quotes.values())}
    except RuntimeError:print('CBB prop provider unavailable; retaining recent snapshots.')
    return recent
