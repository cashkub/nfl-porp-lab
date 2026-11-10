"""Walk-forward Elo benchmark for NFL winner probabilities."""
import csv
import json
import math
import sys
from collections import defaultdict


def number(value):
    try:
        result=float(value)
        return result if math.isfinite(result) else None
    except (TypeError,ValueError):
        return None


def elo_probability(home_rating, away_rating, neutral=False, home_edge=55):
    gap=float(home_rating)-float(away_rating)+(0 if neutral else home_edge)
    return 1/(1+10**(-gap/400))


def _actual_probability(value):
    return max(1e-6,min(1-1e-6,float(value)))


def calibrate_scale(rows):
    decided=[r for r in rows if r['homeOutcome'] is not None]
    if not decided:
        return 1.0
    best_scale=1.0
    best_loss=float('inf')
    for step in range(25,251):
        scale=step/100
        loss=0.0
        for row in decided:
            p=_actual_probability(row['eloProbability'])
            logit=math.log(p/(1-p))*scale
            calibrated=1/(1+math.exp(-max(-30,min(30,logit))))
            outcome=row['homeOutcome']
            loss-=outcome*math.log(_actual_probability(calibrated))+(1-outcome)*math.log(_actual_probability(1-calibrated))
        if loss<best_loss:
            best_scale,best_loss=scale,loss
    return best_scale


def market_probability(row):
    home,away=number(row.get('home_moneyline')),number(row.get('away_moneyline'))
    if home is None or away is None:
        return None
    def implied(price):
        return 100/(100+price) if price>0 else abs(price)/(100+abs(price))
    hp,ap=implied(home),implied(away)
    return hp/(hp+ap)


def prediction_metrics(rows, scale=1.0, key='eloProbability'):
    decided=[r for r in rows if r['homeOutcome'] is not None and r.get(key) is not None]
    if not decided:
        return {'games':0,'brier':None,'logLoss':None,'winnerAccuracy':None}
    probabilities=[]
    for row in decided:
        raw=_actual_probability(row[key])
        logit=math.log(raw/(1-raw))*scale
        probabilities.append(1/(1+math.exp(-max(-30,min(30,logit)))))
    outcomes=[row['homeOutcome'] for row in decided]
    return {'games':len(decided),
            'brier':round(sum((p-y)**2 for p,y in zip(probabilities,outcomes))/len(decided),4),
            'logLoss':round(-sum(y*math.log(_actual_probability(p))+(1-y)*math.log(_actual_probability(1-p))
                                 for p,y in zip(probabilities,outcomes))/len(decided),4),
            'winnerAccuracy':round(sum((p>0.5)==(y>0.5) for p,y in zip(probabilities,outcomes))/len(decided),3)}


def build_predictions(schedule_rows, k_factor=20, home_edge=55, carryover=0.75):
    by_season_week=defaultdict(list)
    for row in schedule_rows:
        if row.get('game_type')=='REG':
            by_season_week[int(row['season']),int(row['week'])].append(row)
    ratings={}
    predictions=[]
    previous_season=None
    for (season,week),games in sorted(by_season_week.items()):
        if season!=previous_season:
            if previous_season is not None:
                ratings={team:1500+(rating-1500)*carryover for team,rating in ratings.items()}
            previous_season=season
        current=[]
        for row in games:
            home,away=row['home_team'],row['away_team']
            home_rating,away_rating=ratings.get(home,1500),ratings.get(away,1500)
            expected=elo_probability(home_rating,away_rating,row.get('location')=='Neutral',home_edge)
            home_score,away_score=number(row.get('home_score')),number(row.get('away_score'))
            if home_score is None or away_score is None:
                continue
            margin=home_score-away_score
            outcome=1.0 if margin>0 else 0.0 if margin<0 else None
            current.append({'season':season,'week':week,'home':home,'away':away,'homeOutcome':outcome,
                            'eloProbability':expected,'homeMoneylineProbability':market_probability(row),
                            'margin':margin,'neutral':row.get('location')=='Neutral'})
        # Predictions for all games in a week use ratings from before that week's results.
        predictions.extend(current)
        for game in current:
            home,away=game['home'],game['away']
            home_rating,away_rating=ratings.get(home,1500),ratings.get(away,1500)
            expected=game['eloProbability']
            margin=game['margin']
            actual=1.0 if margin>0 else 0.5 if margin==0 else 0.0
            gap=home_rating-away_rating+(0 if game['neutral'] else home_edge)
            movement=math.log(abs(margin)+1)*2.2/(2.2+0.001*abs(gap)) if margin else 0.0
            change=k_factor*movement*(actual-expected)
            ratings[home]=home_rating+change
            ratings[away]=away_rating-change
    return predictions


def evaluate_csv(path):
    with open(path,encoding='utf-8-sig',newline='') as source:
        rows=list(csv.DictReader(source))
    predictions=build_predictions(rows)
    seasons=sorted({r['season'] for r in predictions})
    folds=[]
    for index in range(2,len(seasons)):
        calibration_year,holdout_year=seasons[index-1],seasons[index]
        calibration=[r for r in predictions if r['season']==calibration_year]
        holdout=[r for r in predictions if r['season']==holdout_year]
        scale=calibrate_scale(calibration)
        market=[r for r in holdout if r['homeMoneylineProbability'] is not None]
        folds.append({'calibrationSeason':calibration_year,'holdoutSeason':holdout_year,
                      'eloScale':scale,'elo':prediction_metrics(holdout,scale),
                      'closingMoneyline':prediction_metrics(market,key='homeMoneylineProbability')})
    return {'model':'Elo · 1500 start · 55 home points · 20 K · 75% off-season carryover',
            'marketNote':'Closing moneyline is a comparison only; it is not an Elo input and is not timestamped as an available pregame price.',
            'folds':folds}


if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('Usage: python scripts/elo_backtest.py GAMES_CSV')
    report=evaluate_csv(sys.argv[1])
    print(json.dumps(report,indent=2))
