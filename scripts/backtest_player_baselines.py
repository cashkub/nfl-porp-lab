"""Leak-safe player-prop baseline benchmark using prior game usage and results.

This is research only. It never writes to production player projections.
"""
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

from update_data import parse_player_stats_csv

MARKETS={
    'QB': [('passingYards','attempts'),('passingTDs','attempts'),('rushingYards','carries')],
    'RB': [('rushingAttempts','carries'),('rushingYards','carries'),('receivingYards','targets'),('scoredTDs','opportunities')],
    'FB': [('rushingAttempts','carries'),('rushingYards','carries'),('receivingYards','targets'),('scoredTDs','opportunities')],
    'WR': [('receptions','targets'),('receivingYards','targets'),('scoredTDs','opportunities')],
    'TE': [('receptions','targets'),('receivingYards','targets'),('scoredTDs','opportunities')],
}


def mean(values):
    return sum(values)/len(values) if values else None


def make_projection(history, target, position, season, prior_efficiency=None, prior_opportunities=20):
    """Return descriptive baselines and an opportunity × efficiency experiment."""
    eligible=[g for g in history if g['position']==position]
    if not eligible:
        return None
    current=[g for g in eligible if g['season']==season]
    sample=current or eligible
    values=[float(g['stats'].get(target,0) or 0) for g in sample]
    recent=[float(g['stats'].get(target,0) or 0) for g in eligible[-5:]]
    usage_key=next((key for market,key in MARKETS[position] if market==target),None)
    usage=[float(g['usage'].get(usage_key,0) or 0) for g in sample] if usage_key else []
    recent_usage=[float(g['usage'].get(usage_key,0) or 0) for g in eligible[-5:]] if usage_key else []
    season_average=mean(values)
    recent_average=mean(recent)
    result={'season':season_average,'recent':recent_average,'sample':len(eligible),'usageKey':usage_key}
    if usage_key and usage:
        projected_usage=.6*(mean(recent_usage) or 0)+.4*(mean(usage) or 0)
        total_usage=sum(usage)
        efficiency=(sum(values)+(prior_efficiency or 0)*prior_opportunities)/(total_usage+prior_opportunities) if total_usage+prior_opportunities else None
        if target=='rushingAttempts':
            result['opportunity']=projected_usage
        elif efficiency is not None:
            result['opportunity']=projected_usage*efficiency
        else:
            result['opportunity']=None
        result['projectedUsage']=projected_usage
        result['efficiency']=efficiency
    else:
        result['opportunity']=None
    return result


def load_completed_ids(directory):
    with (directory/'games.csv').open(encoding='utf-8-sig',newline='') as source:
        return {r['game_id'] for r in csv.DictReader(source)
                if r.get('game_type')=='REG' and r.get('result') not in ('',None,'NA')}


def load_player_games(directory,completed):
    rows=[]
    for path in sorted((directory/'player-stats').glob('*.csv')):
        try:year=int(path.stem)
        except ValueError:continue
        with path.open(encoding='utf-8-sig',newline='') as source:text=source.read()
        for record in parse_player_stats_csv(text,year):
            game=record['game']
            if game['gameId'] not in completed or record['position'] not in MARKETS:continue
            rows.append({'player':record['id'],'name':record['name'],'position':record['position'],
                         'season':year,'week':int(game['week']),'gameId':game['gameId'],
                         'team':game['team'],'opponent':game['opponent'],'stats':game['stats'],
                         'usage':game['usage']})
    return sorted(rows,key=lambda r:(r['season'],r['week'],r['gameId'],r['player']))


def score_predictions(predictions):
    if not predictions:return {'games':0,'mae':None,'rmse':None}
    errors=[p['actual']-p['predicted'] for p in predictions]
    return {'games':len(errors),'mae':round(sum(abs(e) for e in errors)/len(errors),3),
            'rmse':round(math.sqrt(sum(e*e for e in errors)/len(errors)),3)}


def backtest(directory):
    completed=load_completed_ids(directory)
    rows=load_player_games(directory,completed)
    history=defaultdict(list)
    prior_sum=defaultdict(float)
    prior_usage=defaultdict(float)
    predictions=defaultdict(lambda:defaultdict(list))
    weeks=defaultdict(list)
    for row in rows:weeks[row['season'],row['week']].append(row)
    for season,week in sorted(weeks):
        batch=weeks[season,week]
        # Every forecast in a week uses data from completed prior weeks only.
        for row in batch:
            pid,position=row['player'],row['position']
            for market,usage_key in MARKETS[position]:
                prior=history[pid]
                if not prior:continue
                key=(position,market)
                opportunities=sum(float(g['usage'].get(usage_key,0) or 0) for g in prior)
                efficiency=(prior_sum[key]/prior_usage[key] if prior_usage[key]>0 else None)
                forecast=make_projection(prior,market,position,season,efficiency)
                if not forecast:continue
                actual=float(row['stats'].get(market,0) or 0)
                for model in ('season','recent','opportunity'):
                    value=forecast.get(model)
                    if value is not None:
                        predictions[season][position+' · '+market+' · '+model].append({'actual':actual,'predicted':value})
        for row in batch:
            history[row['player']].append(row)
            for position,markets in MARKETS.items():
                if row['position']!=position:continue
                for market,usage_key in markets:
                    key=(position,market)
                    prior_sum[key]+=float(row['stats'].get(market,0) or 0)
                    prior_usage[key]+=float(row['usage'].get(usage_key,0) or 0)
    report={'protocol':'For each completed regular-season week, each player forecast uses only that player’s earlier completed game logs. All forecasts for the same week are generated before any game from that week is added.','source':'nflverse weekly player stats and games.csv; public data, no odds or injury snapshots used.','completedGames':len(completed),'eligiblePlayerGames':len(rows),'seasons':{}}
    seasons=sorted(predictions)
    for season in seasons:
        markets=defaultdict(dict)
        for key,items in predictions[season].items():
            model=key.rsplit(' · ',1)[1]
            market=' · '.join(key.split(' · ')[:2])
            markets[market][model]=score_predictions(items)
        report['seasons'][str(season)]={'markets':dict(markets)}
    aggregate=defaultdict(list)
    for season in seasons:
        for key,items in predictions[season].items():aggregate[key].extend(items)
    report['aggregate']={key:score_predictions(items) for key,items in sorted(aggregate.items())}
    consistency={}
    for season in seasons:
        for market,models in report['seasons'][str(season)]['markets'].items():
            candidate=models.get('opportunity'); average=models.get('season'); recent=models.get('recent')
            if not candidate or not average or candidate['games']<50:continue
            row=consistency.setdefault(market,{'eligibleSeasons':0,'beatsSeasonAverage':0,'beatsRecentAverage':0})
            row['eligibleSeasons']+=1
            row['beatsSeasonAverage']+=int(candidate['mae']<average['mae'])
            row['beatsRecentAverage']+=int(candidate['mae']<recent['mae']) if recent else 0
    report['seasonConsistency']=consistency
    return report


if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python scripts/backtest_player_baselines.py DATA_DIRECTORY')
    print(json.dumps(backtest(Path(sys.argv[1])),indent=2))
