"""Fit NFL score residuals using local nflverse games.csv and season CSV.GZ files.
Usage: python scripts/train_nfl.py DATA_DIRECTORY
"""
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from nfl_features import Form, plays, evaluation, number
from update_data import team_ratings


def solve_linear(matrix, vector):
    """Solve a small dense linear system with partial pivoting."""
    size=len(vector)
    augmented=[list(map(float,row))+[float(vector[i])] for i,row in enumerate(matrix)]
    for col in range(size):
        pivot=max(range(col,size),key=lambda row:abs(augmented[row][col]))
        if abs(augmented[pivot][col])<1e-12:
            raise ValueError('The ridge system is singular; check model features and training rows.')
        augmented[col],augmented[pivot]=augmented[pivot],augmented[col]
        divisor=augmented[col][col]
        augmented[col]=[value/divisor for value in augmented[col]]
        for row in range(size):
            if row==col:continue
            factor=augmented[row][col]
            if factor:
                augmented[row]=[value-factor*pivot_value for value,pivot_value in zip(augmented[row],augmented[col])]
    return [augmented[i][-1] for i in range(size)]


def ridge_regression(features, outcomes, ridge=200):
    """Fit standardized ridge regression using only Python's standard library."""
    if not features or len(features)!=len(outcomes):
        raise ValueError('Ridge regression requires matching non-empty feature and outcome rows.')
    columns=len(features[0])
    if any(len(row)!=columns for row in features):
        raise ValueError('Ridge regression features must have a consistent width.')
    count=len(features)
    centers=[sum(row[col] for row in features)/count for col in range(columns)]
    scales=[]
    for col in range(columns):
        variance=sum((row[col]-centers[col])**2 for row in features)/count
        scales.append(math.sqrt(variance) or 1.0)
    target_mean=sum(outcomes)/count
    gram=[[0.0]*columns for _ in range(columns)]
    rhs=[0.0]*columns
    for row,target in zip(features,outcomes):
        z=[(row[col]-centers[col])/scales[col] for col in range(columns)]
        centered_target=target-target_mean
        for i in range(columns):
            rhs[i]+=z[i]*centered_target
            for j in range(columns):
                gram[i][j]+=z[i]*z[j]
    for i in range(columns):
        gram[i][i]+=ridge
    standardized=solve_linear(gram,rhs)
    coefficients=[standardized[i]/scales[i] for i in range(columns)]
    return centers,coefficients,target_mean


def prediction_metrics(pred, rows):
    """Score paired [away, home] forecasts without hiding ties or sample size."""
    actual_scores=[float(r[3]) for r in rows]
    predicted=[float(x) for x in pred]
    if len(predicted)!=len(actual_scores) or len(predicted)%2:
        raise ValueError('Predictions must contain paired away/home scores for every game.')
    if not predicted:
        raise ValueError('Cannot score an empty forecast sample.')
    point_errors=[abs(p-a) for p,a in zip(predicted,actual_scores)]
    actual_margins=[actual_scores[i+1]-actual_scores[i] for i in range(0,len(actual_scores),2)]
    predicted_margins=[predicted[i+1]-predicted[i] for i in range(0,len(predicted),2)]
    actual_totals=[actual_scores[i+1]+actual_scores[i] for i in range(0,len(actual_scores),2)]
    predicted_totals=[predicted[i+1]+predicted[i] for i in range(0,len(predicted),2)]
    margin_errors=[abs(p-a) for p,a in zip(predicted_margins,actual_margins)]
    total_errors=[abs(p-a) for p,a in zip(predicted_totals,actual_totals)]
    decided=[i for i,margin in enumerate(actual_margins) if margin!=0]
    winner_accuracy=(sum(predicted_margins[i]!=0 and (predicted_margins[i]>0)==(actual_margins[i]>0) for i in decided)/len(decided)) if decided else None
    return {'games':len(actual_margins),
            'scoreMAE':round(sum(point_errors)/len(point_errors),2),
            'marginMAE':round(sum(margin_errors)/len(margin_errors),2),
            'totalMAE':round(sum(total_errors)/len(total_errors),2),
            'winnerAccuracy':round(winner_accuracy,3) if winner_accuracy is not None else None}


def fit(directory):
    schedule=defaultdict(list)
    for r in csv.DictReader((directory/'games.csv').open()):
        if r['game_type']=='REG':
            schedule[int(r['season']),int(r['week'])].append(r)
    records=[]
    for season in range(2019,2026):
        gameplays=plays((directory/f'{season}.gz').read_bytes())
        results=[]; form=Form()
        for week in range(1,19):
            ratings=team_ratings(results)
            batch=schedule[season,week]
            for r in batch:
                h,a=r['home_team'],r['away_team']
                if min(ratings.get(h,{}).get('games',0),ratings.get(a,{}).get('games',0))<3:continue
                weather={'wind':number(r['wind']),'temp':number(r['temp'])} if r['roof'] in ('outdoors','open') else {}
                pair=[]
                for side,team,opp,sign in [('away',a,h,-1),('home',h,a,1)]:
                    profile=form.matchup(r,side,weather)
                    if not profile:break
                    base=evaluation(ratings[team],ratings[opp],sign*.75 if r['location']!='Neutral' else 0)
                    total=number(r['total_line']);spread=number(r['spread_line'])
                    if total is None or spread is None:break
                    pair.append((season,profile['inputs'],base,float(r[side+'_score']),(total+sign*spread)/2))
                if len(pair)==2:records.extend(pair)
            for r in batch:
                results.append((r['home_team'],r['away_team'],int(r['home_score']),int(r['away_score']),r['location']=='Neutral'))
                form.add(gameplays.get(r['game_id'],{}))
    if not records:
        raise ValueError('No eligible pregame team records were built from the supplied data.')
    keys=list(records[0][1])
    train=[r for r in records if r[0]<=2023]
    if not train:
        raise ValueError('No training records through 2023 were found.')
    x=[[r[1][k] for k in keys] for r in train]
    y=[r[3]-r[2] for r in train]
    center,coef,intercept=ridge_regression(x,y)
    for k in ('Wind','Cold','Rest'):
        i=keys.index(k);intercept-=center[i]*coef[i];center[i]=0
    def scores(rows):
        base=[r[2] for r in rows]; actual=[r[3] for r in rows]; market=[r[4] for r in rows]
        stats=[base[i]+intercept+sum((r[1][k]-center[j])*coef[j] for j,k in enumerate(keys)) for i,r in enumerate(rows)]
        return base,actual,market,stats
    calibration=[r for r in records if r[0]==2024]
    holdout=[r for r in records if r[0]==2025]
    if not calibration or not holdout:
        raise ValueError('Walk-forward evaluation requires eligible games in both calibration season 2024 and holdout season 2025.')
    _,actual,market,stats=scores(calibration)
    denominator=sum((m-s)**2 for m,s in zip(market,stats))
    weight=max(0.0,min(1.0,sum((m-s)*(a-s) for m,s,a in zip(market,stats,actual))/denominator)) if denominator else 0.0

    def evaluate(rows):
        base,actual,market,stats=scores(rows)
        blend=[s*(1-weight)+m*weight for s,m in zip(stats,market)]
        return {'Base':prediction_metrics(base,rows),'Stats':prediction_metrics(stats,rows),
                'Closing Market Benchmark':prediction_metrics(market,rows),
                'Market Blend':prediction_metrics(blend,rows)}

    # Keep this shape for the existing data consumer; these are the untouched 2025 holdout scores.
    holdout_scores=evaluate(holdout)
    validation={k:{'scoreMAE':v['scoreMAE'],'marginMAE':v['marginMAE']} for k,v in holdout_scores.items()}
    validation['Market']=validation.pop('Closing Market Benchmark')
    validation['Blend']=validation.pop('Market Blend')
    return dict(weights=dict(zip(keys,coef)),centers=dict(zip(keys,center)),intercept=intercept,marketWeight=weight,
                validation=validation,
                backtest={'protocol':'Train feature weights through 2023; tune market blend on 2024; report 2025 as the untouched holdout.',
                          'marketNote':'The historical spread and total columns are closing-line benchmarks, not timestamped odds available at the forecast time.',
                          'calibration2024':evaluate(calibration),'holdout2025':holdout_scores},
                games=len(holdout)//2)


if __name__=='__main__':
    config=fit(Path(sys.argv[1]))
    Path(__file__).with_name('nfl_weights.json').write_text(json.dumps(config,indent=2)+'\n')
