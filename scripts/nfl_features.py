"""Build pregame NFL matchup inputs from completed nflverse play-by-play."""
import csv
import gzip
import io
from collections import Counter, defaultdict
from statistics import mean


def number(value):
    try:
        return float(value) if value not in (None, '', 'NA', 'NaN') else None
    except ValueError:
        return None


def plays(data, scoring_chances=None):
    games = defaultdict(dict)
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as f:
        for p in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')):
            team = p['posteam']
            typ = 'pass' if p['qb_dropback'] in ('1','1.0') else 'rush'
            if scoring_chances is not None and team and p['play_type'] in ('pass','run') and p['qb_kneel'] not in ('1','1.0') and p['qb_spike'] not in ('1','1.0') and p.get('two_point_attempt') not in ('1','1.0'):
                game_chances = scoring_chances.setdefault((p['game_id'],team), {})
                distance = number(p.get('yardline_100'))
                if distance is not None and 0 < distance <= 20:
                    rush = number(p.get('rush_attempt')) == 1
                    player = p.get('rusher_player_id') if rush else p.get('receiver_player_id')
                    if player and player != 'NA':
                        counts = game_chances.setdefault(player, [0,0,0])
                        counts[0 if rush else 1] += 1
                        if rush and distance <= 5:
                            counts[2] += 1
            epa = number(p['epa'])
            if not team or epa is None or p['play_type'] not in ('pass','run') or p['qb_kneel'] in ('1','1.0') or p['qb_spike'] in ('1','1.0'):
                continue
            side = games[p['game_id']].setdefault(team, {'n':Counter(),'qbs':{},'drives':set()})
            n = side['n']
            n[typ] += 1
            n[typ+'Epa'] += epa
            n['success'] += epa > 0
            side['drives'].add(p['fixed_drive'])
            qid=p['passer_player_id']
            if typ=='pass' and qid and qid!='NA':
                qb=side['qbs'].setdefault(qid,[0,0,p['passer_player_name']])
                qb[0]+=1
                qb[1]+=epa
    for game in games.values():
        for side in game.values():
            side['n']['drives']=len(side.pop('drives'))
    return games


class Form:
    def __init__(self):
        self.history=defaultdict(list)
        self.qbs=defaultdict(lambda: [0,0,''])

    def add(self, game):
        if len(game)!=2:
            return
        (t,a),(o,b)=game.items()
        for team,attack,defense in [(t,a,b),(o,b,a)]:
            self.history[team].append((attack,defense))
            for qid,(n,epa,name) in attack['qbs'].items():
                q=self.qbs[qid]
                q[0]+=n; q[1]+=epa; q[2]=name

    def profile(self,team):
        recent=self.history.get(team,[])[-8:]
        if not recent:
            return None
        off,defn=Counter(),Counter()
        roster=Counter()
        for a,d in recent:
            off.update(a['n']); defn.update(d['n'])
        for a,_ in recent[-3:]:
            roster.update({k:v[0] for k,v in a['qbs'].items()})
        def rate(c,k):
            return c[k+'Epa']/max(1,c[k])
        return dict(passO=rate(off,'pass'),runO=rate(off,'rush'),passD=rate(defn,'pass'),
                    runD=rate(defn,'rush'),drives=off['drives']/len(recent),
                    success=off['success']/max(1,off['pass']+off['rush']),games=len(recent),
                    roster=[k for k,_ in roster.most_common()])

    def matchup(self,row,side,weather=None,depth=None):
        opp='away' if side=='home' else 'home'
        a=self.profile(row[side+'_team']); d=self.profile(row[opp+'_team'])
        if not a or not d:
            return None
        qid=row.get(side+'_qb_id')
        listed=bool(qid and qid!='NA')
        chart=depth or []
        qid=qid if listed else (chart[0]['id'] if chart else next(iter(a['roster']),None))
        backup=next((q['id'] for q in chart if q['id']!=qid),None)
        names={q['id']:q['name'] for q in chart}
        source='Schedule' if listed else 'Depth Chart' if chart else 'Recent Workload'
        def qb_rate(q):
            n,epa,_=self.qbs.get(q,[0,0,''])
            return epa/(n+100)
        rest=number(row.get(side+'_rest')); other=number(row.get(opp+'_rest'))
        wind=weather.get('wind') if weather else None
        cold=weather.get('temp') if weather else None
        inputs={'Pass Offense':a['passO'],'Run Offense':a['runO'],'Pass Defense Faced':d['passD'],
                'Run Defense Faced':d['runD'],'Possessions':mean([a['drives'],d['drives']]),
                'Quarterback':qb_rate(qid)-a['passO'],'Rest':max(-7,min(7,rest-other)) if rest and other else 0,
                'Wind':max(0,wind-8) if wind is not None else 0,'Cold':max(0,40-cold) if cold is not None else 0}
        return dict(inputs=inputs,qb=row.get(side+'_qb_name') if listed else names.get(qid,self.qbs.get(qid,[0,0,None])[2]),
                    qbId=qid,listed=listed,qbSource=source,backup=names.get(backup),backupPasses=self.qbs.get(backup,[0])[0],
                    qbChange=qb_rate(backup)-qb_rate(qid),backupKnown=bool(backup),
                    success=a['success'],sample=a['games'],rest=rest)


def evaluation(rating,opp,venue):
    return rating['offense']+opp['defense']-rating['baseline']+venue
