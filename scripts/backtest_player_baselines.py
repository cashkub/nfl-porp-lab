"""Leak-safe player-prop baseline benchmark using prior game usage and results.

This is research only. It never writes to production player projections.
"""
import csv
import json
import math
import sys
from bisect import bisect_right
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


def probability_over_from_errors(errors, projection, line, minimum_samples=100):
    """Empirical residual probability using only errors available before kickoff."""
    if len(errors)<minimum_samples or not math.isfinite(projection) or not math.isfinite(line):
        return None
    return probability_over_from_sorted_errors(sorted(errors),projection,line,minimum_samples)


def probability_over_from_sorted_errors(errors, projection, line, minimum_samples=100):
    """Binary-search a pre-sorted residual distribution without rescanning it."""
    if len(errors)<minimum_samples or not math.isfinite(projection) or not math.isfinite(line):
        return None
    over=len(errors)-bisect_right(errors,line-projection)
    # Laplace smoothing keeps sparse tails away from exact 0% and 100%.
    return (over+1)/(len(errors)+2)


def score_probability_predictions(predictions):
    if not predictions:return {'games':0,'brier':None,'logLoss':None,'averageProbability':None,'observedOver':None}
    probabilities=[min(1-1e-9,max(1e-9,p['probability'])) for p in predictions]
    outcomes=[float(p['outcome']) for p in predictions]
    benchmark=[min(1-1e-9,max(1e-9,p['priorRateProbability'])) for p in predictions]
    brier=sum((p-y)**2 for p,y in zip(probabilities,outcomes))/len(predictions)
    logloss=-sum(y*math.log(p)+(1-y)*math.log(1-p) for p,y in zip(probabilities,outcomes))/len(predictions)
    prior_brier=sum((p-y)**2 for p,y in zip(benchmark,outcomes))/len(predictions)
    prior_logloss=-sum(y*math.log(p)+(1-y)*math.log(1-p) for p,y in zip(benchmark,outcomes))/len(predictions)
    observed=sum(outcomes)/len(outcomes)
    return {'games':len(predictions),'brier':round(brier,4),'logLoss':round(logloss,4),
            'averageProbability':round(mean(probabilities),4),'observedOver':round(observed,4),
            'calibrationGap':round(mean(probabilities)-observed,4),'coinFlipBrier':0.25,
            'coinFlipLogLoss':round(math.log(2),4),'priorRateBrier':round(prior_brier,4),
            'priorRateLogLoss':round(prior_logloss,4)}


def backtest(directory):
    completed=load_completed_ids(directory)
    rows=load_player_games(directory,completed)
    history=defaultdict(list)
    prior_sum=defaultdict(float)
    prior_usage=defaultdict(float)
    predictions=defaultdict(lambda:defaultdict(list))
    residual_history=defaultdict(list)
    over_rate_history=defaultdict(lambda:[0,0])
    probability_predictions=defaultdict(lambda:defaultdict(list))
    weeks=defaultdict(list)
    for row in rows:weeks[row['season'],row['week']].append(row)
    for season,week in sorted(weeks):
        batch=weeks[season,week]
        # Every forecast in a week uses data from completed prior weeks only.
        batch_errors=[]
        batch_over_outcomes=[]
        sorted_residuals={}
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
                        distribution_key=(position,market,model)
                        book_like_line=math.floor(value)+0.5
                        if distribution_key not in sorted_residuals:
                            sorted_residuals[distribution_key]=sorted(residual_history[distribution_key])
                        probability=probability_over_from_sorted_errors(
                            sorted_residuals[distribution_key],value,book_like_line)
                        if probability is not None and actual!=book_like_line:
                            prior_successes,prior_count=over_rate_history[distribution_key]
                            prior_rate=(prior_successes+1)/(prior_count+2)
                            outcome=float(actual>book_like_line)
                            probability_predictions[season][position+' · '+market+' · '+model].append({
                                'probability':probability,'priorRateProbability':prior_rate,'outcome':outcome})
                            batch_over_outcomes.append((distribution_key,outcome))
                        # Add after the entire week is forecast so teammates from
                        # the same game slate cannot contribute their outcomes.
                        batch_errors.append((distribution_key,actual-value))
        for row in batch:
            history[row['player']].append(row)
            for position,markets in MARKETS.items():
                if row['position']!=position:continue
                for market,usage_key in markets:
                    key=(position,market)
                    prior_sum[key]+=float(row['stats'].get(market,0) or 0)
                    prior_usage[key]+=float(row['usage'].get(usage_key,0) or 0)
        for key,error in batch_errors:
            residual_history[key].append(error)
        for key,outcome in batch_over_outcomes:
            over_rate_history[key][0]+=int(outcome)
            over_rate_history[key][1]+=1
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
    probability_aggregate=defaultdict(list)
    probability_by_season={}
    for year,market_rows in probability_predictions.items():
        probability_by_season[str(year)]={key:score_probability_predictions(items)
                                          for key,items in sorted(market_rows.items())}
        for key,items in market_rows.items():probability_aggregate[key].extend(items)
    report['probabilityMethod']={
        'distribution':'Empirical position/market/model forecast residuals, collected only after each prior week has completed.',
        'line':'Standard half-point threshold immediately above the model forecast floor.',
        'minimumPriorForecasts':100,
        'smoothing':'Laplace +1/+2; probabilities require at least 100 prior out-of-sample forecast errors.',
        'baseline':'Prior-rate benchmark is the smoothed Over frequency at the same model-centered half-point threshold, learned only from earlier forecast outcomes.',
        'limitation':'Historical sportsbook player-prop lines and prices are unavailable; these scores test calibration at the model-centered half-point threshold, not betting ROI or market-line performance.'}
    report['probabilityBySeason']=probability_by_season
    report['probabilityAggregate']={key:score_probability_predictions(items)
                                    for key,items in sorted(probability_aggregate.items())}
    probability_consistency={}
    for year,market_rows in probability_by_season.items():
        for key,metrics in market_rows.items():
            if metrics['games']<50:continue
            row=probability_consistency.setdefault(key,{'eligibleSeasons':0,'beatsCoinFlipBrier':0,
                                                        'beatsCoinFlipLogLoss':0,'beatsPriorRateBrier':0,
                                                        'beatsPriorRateLogLoss':0})
            row['eligibleSeasons']+=1
            row['beatsCoinFlipBrier']+=int(metrics['brier']<metrics['coinFlipBrier'])
            row['beatsCoinFlipLogLoss']+=int(metrics['logLoss']<metrics['coinFlipLogLoss'])
            row['beatsPriorRateBrier']+=int(metrics['brier']<metrics['priorRateBrier'])
            row['beatsPriorRateLogLoss']+=int(metrics['logLoss']<metrics['priorRateLogLoss'])
    report['probabilitySeasonConsistency']=probability_consistency
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
