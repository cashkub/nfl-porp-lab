"""Daily, independent 2027 men's field projections."""
from collections import Counter, defaultdict
from itertools import permutations
from math import exp
from random import Random

REGIONS = ['East', 'South', 'Midwest', 'West']
# ESPN IDs: reclassifying programs and 2026–27 postseason APR sanctions.
INELIGIBLE = {'2698', '2385', '2174', '2010', '2441', '2697'}


def probability(margin):
    return 1 / (1 + exp(-margin / 9))


def field(order, conferences):
    automatic = {}
    for team in order:
        automatic.setdefault(conferences[team], team)
    aq = set(automatic.values())
    at_large = [t for t in order if t not in aq][:44]
    return aq, at_large


def place(order, aq, at_large, conf):
    slots = []
    for group in ([t for t in order if t in aq], at_large):
        slots.extend([[t] for t in group[:-12]])
        pool = group[-12:].copy()
        while pool:
            first = pool.pop(0)
            index = next((i for i,t in enumerate(pool) if conf[t] != conf[first]), 0)
            slots.append([first, pool.pop(index)])
    rank = {t:i for i,t in enumerate(order)}
    slots.sort(key=lambda s: min(rank[t] for t in s))
    regions = {r:{} for r in REGIONS}
    for line in range(1, 17):
        group = slots[(line-1)*4:line*4]
        def penalty(placement):
            cost = 0
            for i,slot in enumerate(placement):
                assigned = regions[REGIONS[i]]
                opponent = assigned.get(17-line, [])
                for team in slot:
                    cost += 1000*sum(conf[team]==conf[t] for t in opponent)
                    if line<=4:
                        cost += 100*sum(conf[team]==conf[t] for prior in assigned.values() for t in prior)
                cost += abs(group.index(slot)-(i if line%2 else 3-i))
            return cost
        for region,slot in zip(REGIONS,min(permutations(group),key=penalty)):
            regions[region][line] = slot
    return regions


def project(schedule, conferences, teams, day, now):
    strength = {t:teams.state[t][0]-teams.state[t][1] for t in conferences}
    bubble = sorted(strength.values(),reverse=True)[50]
    wins, losses, expected, opponents = Counter(), Counter(), Counter(), defaultdict(list)
    remaining = []
    for g in schedule:
        h,a = str(g['home_id']),str(g['away_id'])
        court = 0 if g['neutral_site'] else teams.court
        if g['status_type_completed'] and None not in (g['home_score'],g['away_score']):
            winner,loser = (h,a) if g['home_score']>g['away_score'] else (a,h)
            wins[winner]+=1
            losses[loser]+=1
            for t,o,venue in [(h,a,court),(a,h,-court)]:
                opponents[t].append(strength[o])
                expected[t]+=probability((bubble-strength[o])*.7+venue)
        elif g['date'] and g['date'] > now and g['date'][:10] <= '2027-03-14':
            remaining.append((h,a,probability((strength[h]-strength[a])*.7+court),
                              probability((bubble-strength[a])*.7+court),probability((bubble-strength[h])*.7-court)))
    eligible = sorted(set(conferences)-INELIGIBLE)
    def score(t):
        return wins[t]-expected[t]+strength[t]*.12
    scores = {t:score(t) for t in conferences}
    order = sorted(eligible,key=lambda t:(-scores[t],t))
    aq,al = field(order,conferences)
    if len(aq)!=32 or len(al)!=44:
        raise ValueError('Incomplete 2027 bracket field')
    regions = place(order,aq,al,conferences)
    places = {t:(r,s,len(slot)>1) for r,lines in regions.items() for s,slot in lines.items() for t in slot}
    rng = Random(2027)
    bids = Counter()
    leagues = defaultdict(list)
    for t in eligible: leagues[conferences[t]].append(t)
    for _ in range(200):
        projected = scores.copy()
        for h,a,p,eh,ea in remaining:
            home_win = rng.random()<p
            projected[h]+=home_win-eh
            projected[a]+=(1-home_win)-ea
        # Neutral-court knockout proxy until actual conference tournament fields are known.
        champions = set()
        for members in leagues.values():
            contenders = sorted(members,key=projected.get,reverse=True)
            while len(contenders)>1:
                byes = (1 << (len(contenders)-1).bit_length())-len(contenders)
                playing = contenders[byes:]
                winners = contenders[:byes]
                for x,y in zip(playing[:len(playing)//2],reversed(playing)):
                    winners.append(x if rng.random()<probability((strength[x]-strength[y])*.7) else y)
                contenders = winners
            champions.add(contenders[0])
        bids.update(champions)
        bids.update(sorted((t for t in eligible if t not in champions),key=projected.get,reverse=True)[:44])
    included = [t for t in order if t in places]
    outside = [t for t in order if t not in places]
    rows = []
    for t in included+outside:
        region,seed,opening = places.get(t,(None,None,False))
        rows.append(dict(id=t,region=region,seed=seed,opening=opening,auto=t in aq,
                         wins=wins[t],losses=losses[t],wab=round(wins[t]-expected[t],2),
                         efficiency=round(strength[t],1),sos=round(sum(opponents[t])/len(opponents[t]),1) if opponents[t] else None,
                         bidPct=bids[t]/2))
    return dict(date=str(day),teams=rows,regions=regions)
