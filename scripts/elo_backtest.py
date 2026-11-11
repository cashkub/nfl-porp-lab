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


def scaled_elo_probability(home_rating, away_rating, scale=1.0, neutral=False, home_edge=55):
    """Apply a calibration scale fitted on an earlier season to an Elo forecast."""
    probability=elo_probability(home_rating,away_rating,neutral,home_edge)
    probability=_actual_probability(probability)
    logit=math.log(probability/(1-probability))*float(scale)
    return 1/(1+math.exp(-max(-30,min(30,logit))))


def _update_ratings(ratings, game, k_factor, home_edge, carryover=None):
    """Update both team ratings after a completed game."""
    home,away=game['home'],game['away']
    home_rating,away_rating=ratings.get(home,1500),ratings.get(away,1500)
    expected=elo_probability(home_rating,away_rating,game['neutral'],home_edge)
    margin=game['margin']
    actual=1.0 if margin>0 else 0.5 if margin==0 else 0.0
    gap=home_rating-away_rating+(0 if game['neutral'] else home_edge)
    movement=math.log(abs(margin)+1)*2.2/(2.2+0.001*abs(gap)) if margin else 0.0
    change=k_factor*movement*(actual-expected)
    ratings[home]=home_rating+change
    ratings[away]=away_rating-change


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
            _update_ratings(ratings,game,k_factor,home_edge)
    return predictions


def upcoming_forecasts(schedule_rows, current_season=None, k_factor=20, home_edge=55, carryover=0.75):
    """Forecast upcoming regular-season games from prior completed games only.

    Elo ratings are updated after each completed week. Every matchup in a week
    is forecast from the same pre-week ratings, preventing a result elsewhere in
    that week from changing another matchup's forecast. Probability calibration
    uses the most recent earlier season with completed results.
    """
    regular=[r for r in schedule_rows if r.get('game_type')=='REG']
    completed=lambda row:number(row.get('home_score')) is not None and number(row.get('away_score')) is not None
    future=[r for r in regular if not completed(r)]
    if current_season is None:
        if not future:return {}
        current_season=max(int(r['season']) for r in future)
    current_season=int(current_season)
    calibration_seasons=sorted({int(r['season']) for r in regular
                                 if int(r['season'])<current_season and completed(r)})
    if not calibration_seasons:
        return {}
    calibration_season=calibration_seasons[-1]
    prior_predictions=build_predictions([r for r in regular if int(r['season'])<=calibration_season],
                                        k_factor,home_edge,carryover)
    calibration=[r for r in prior_predictions if r['season']==calibration_season]
    if not calibration:
        return {}
    scale=calibrate_scale(calibration)
    by_season_week=defaultdict(list)
    for row in regular:
        season=int(row['season'])
        if season<=current_season:
            by_season_week[season,int(row['week'])].append(row)
    ratings={}
    previous_season=None
    output={}
    for (season,week),games in sorted(by_season_week.items()):
        if season!=previous_season:
            if previous_season is not None:
                ratings={team:1500+(rating-1500)*carryover for team,rating in ratings.items()}
            previous_season=season
        completed_week=[]
        for row in games:
            home,away=row['home_team'],row['away_team']
            neutral=row.get('location')=='Neutral'
            home_rating,away_rating=ratings.get(home,1500),ratings.get(away,1500)
            if season==current_season and not completed(row):
                game_id=row.get('game_id')
                if game_id:
                    p_home=scaled_elo_probability(home_rating,away_rating,scale,neutral,home_edge)
                    output[game_id]={'homeProbability':p_home,'awayProbability':1-p_home,
                                     'homeRating':round(home_rating,1),'awayRating':round(away_rating,1),
                                     'calibrationSeason':calibration_season,'scale':round(scale,4),
                                     'asOfWeek':max(0,week-1)}
            elif completed(row):
                home_score,away_score=float(row['home_score']),float(row['away_score'])
                completed_week.append({'home':home,'away':away,'neutral':neutral,
                                       'margin':home_score-away_score})
        for game in completed_week:
            _update_ratings(ratings,game,k_factor,home_edge)
    return output


def evaluate_csv(path):
    with open(path,encoding='utf-8-sig',newline='') as source:
        rows=list(csv.DictReader(source))
    return evaluate_rows(rows)


def evaluate_rows(rows):
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
