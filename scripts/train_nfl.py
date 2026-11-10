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
from nfl_ratings import team_ratings_recency
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


def _sigmoid(value):
    value=max(-30.0,min(30.0,float(value)))
    return 1/(1+math.exp(-value))


def calibrate_win_scale(pred, rows):
    """Calibrate a one-parameter logistic win model from prior-season margins."""
    actual=[float(r[4]) for r in rows]
    if len(pred)!=len(actual) or len(pred)%2:
        raise ValueError('Predictions must contain paired away/home scores for every game.')
    samples=[]
    for i in range(0,len(actual),2):
        margin=actual[i+1]-actual[i]
        if margin==0:
            continue
        predicted_margin=float(pred[i+1])-float(pred[i])
        samples.append((predicted_margin,1.0 if margin>0 else 0.0))
    if not samples:
        return 0.0
    best_scale=0.0
    best_loss=float('inf')
    for step in range(301):
        scale=step/1000
        loss=0.0
        for margin,outcome in samples:
            probability=max(1e-9,min(1-1e-9,_sigmoid(scale*margin)))
            loss-=outcome*math.log(probability)+(1-outcome)*math.log(1-probability)
        if loss<best_loss:
            best_scale,best_loss=scale,loss
    return best_scale


def prediction_metrics(pred, rows, win_scale=None):
    """Score paired [away, home] forecasts without hiding ties or sample size."""
    actual_scores=[float(r[4]) for r in rows]
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
    result={'games':len(actual_margins),
            'scoreMAE':round(sum(point_errors)/len(point_errors),2),
            'marginMAE':round(sum(margin_errors)/len(margin_errors),2),
            'totalMAE':round(sum(total_errors)/len(total_errors),2),
            'winnerAccuracy':round(winner_accuracy,3) if winner_accuracy is not None else None}
    if win_scale is not None and decided:
        probabilities=[_sigmoid(win_scale*predicted_margins[i]) for i in decided]
        outcomes=[1.0 if actual_margins[i]>0 else 0.0 for i in decided]
        result['winProbabilityGames']=len(decided)
        result['winBrier']=round(sum((p-y)**2 for p,y in zip(probabilities,outcomes))/len(decided),4)
        result['winLogLoss']=round(-sum(y*math.log(max(1e-9,min(1-1e-9,p)))+
                                         (1-y)*math.log(max(1e-9,min(1-1e-9,1-p)))
                                         for p,y in zip(probabilities,outcomes))/len(decided),4)
    return result


def fit_feature_model(rows, keys):
    features=[[r[1][key] for key in keys] for r in rows]
    residuals=[r[4]-r[2] for r in rows]
    centers,coefficients,intercept=ridge_regression(features,residuals)
    for key in ('Wind','Cold','Rest'):
        index=keys.index(key)
        intercept-=centers[index]*coefficients[index]
        centers[index]=0
    return {'centers':centers,'weights':coefficients,'intercept':intercept}


def project_records(rows, keys, model):
    base=[r[2] for r in rows]
    recent=[r[3] for r in rows]
    actual=[r[4] for r in rows]
    market=[r[5] for r in rows]
    stats=[base[i]+model['intercept']+
           sum((r[1][key]-model['centers'][j])*model['weights'][j] for j,key in enumerate(keys))
           for i,r in enumerate(rows)]
    return base,recent,actual,market,stats


def evaluate_fold(records, keys, train_through, calibration_season, holdout_season):
    train=[r for r in records if r[0]<=train_through]
    calibration=[r for r in records if r[0]==calibration_season]
    holdout=[r for r in records if r[0]==holdout_season]
    if not train or not calibration or not holdout:
        raise ValueError(f'Walk-forward fold needs training through {train_through}, calibration {calibration_season}, and holdout {holdout_season}.')
    model=fit_feature_model(train,keys)
    calibration_base,calibration_recent,actual,market,calibration_stats=project_records(calibration,keys,model)
    denominator=sum((m-s)**2 for m,s in zip(market,calibration_stats))
    market_weight=max(0.0,min(1.0,
        sum((m-s)*(a-s) for m,s,a in zip(market,calibration_stats,actual))/denominator)) if denominator else 0.0
    calibration_blend=[s*(1-market_weight)+m*market_weight for s,m in zip(calibration_stats,market)]
    scales={'Base':calibrate_win_scale(calibration_base,calibration),
            'Recency Weighted':calibrate_win_scale(calibration_recent,calibration),
            'Stats':calibrate_win_scale(calibration_stats,calibration),
            'Closing Market Benchmark':calibrate_win_scale(market,calibration),
            'Market Blend':calibrate_win_scale(calibration_blend,calibration)}

    def evaluate(rows):
        base,recent,actual,market,stats=project_records(rows,keys,model)
        blend=[s*(1-market_weight)+m*market_weight for s,m in zip(stats,market)]
        return {'Base':prediction_metrics(base,rows,scales['Base']),
                'Recency Weighted':prediction_metrics(recent,rows,scales['Recency Weighted']),
                'Stats':prediction_metrics(stats,rows,scales['Stats']),
                'Closing Market Benchmark':prediction_metrics(market,rows,scales['Closing Market Benchmark']),
                'Market Blend':prediction_metrics(blend,rows,scales['Market Blend'])}
    return {'trainThrough':train_through,'calibrationSeason':calibration_season,
            'holdoutSeason':holdout_season,'marketWeight':market_weight,
            'model':model,'winProbabilityScales':scales,
            'calibration':evaluate(calibration),'holdout':evaluate(holdout)}


def fit(directory):
    schedule=defaultdict(list)
    with (directory/'games.csv').open() as source:
        for r in csv.DictReader(source):
            if r['game_type']=='REG':
                schedule[int(r['season']),int(r['week'])].append(r)
    records=[]
    schedule_seasons=sorted({year for year,_ in schedule if year>=2019})
    completed_seasons={year for (year,_),games in schedule.items() if year>=2019 and any(number(game.get('result')) is not None for game in games)}
    missing=[year for year in sorted(completed_seasons) if not (directory/f'{year}.gz').exists()]
    if missing:
        raise FileNotFoundError(f'Missing play-by-play data for completed seasons: {missing}')
    seasons=[year for year in schedule_seasons if (directory/f'{year}.gz').exists()]
    for season in seasons:
        pbp_path=directory/f'{season}.gz'
        if not pbp_path.exists():
            raise FileNotFoundError(f'Missing play-by-play data for {season}: {pbp_path}')
        gameplays=plays(pbp_path.read_bytes())
        results=[]; form=Form()
        for week in range(1,19):
            ratings=team_ratings(results)
            recency_ratings=team_ratings_recency(results)
            batch=schedule[season,week]
            for r in batch:
                # Current-season schedule files also contain upcoming games. Never grade them as outcomes.
                if number(r.get('result')) is None:
                    continue
                h,a=r['home_team'],r['away_team']
                if min(ratings.get(h,{}).get('games',0),ratings.get(a,{}).get('games',0))<3:continue
                pair=[]
                for side,team,opp,sign in [('away',a,h,-1),('home',h,a,1)]:
                    # Historical schedule weather is observed at kickoff, not a timestamped pregame forecast.
                    # Keep it out until forecast snapshots can be reconstructed without leakage.
                    # Likewise infer the QB from prior workload instead of the retrospectively listed starter.
                    profile=form.matchup(r,side,use_listed_qb=False)
                    if not profile:break
                    base=evaluation(ratings[team],ratings[opp],sign*.75 if r['location']!='Neutral' else 0)
                    recent=evaluation(recency_ratings[team],recency_ratings[opp],sign*.75 if r['location']!='Neutral' else 0)
                    total=number(r['total_line']);spread=number(r['spread_line'])
                    if total is None or spread is None:break
                    pair.append((season,profile['inputs'],base,recent,float(r[side+'_score']),(total+sign*spread)/2))
                if len(pair)==2:records.extend(pair)
            for r in batch:
                if number(r.get('result')) is None:
                    continue
                results.append((r['home_team'],r['away_team'],int(r['home_score']),int(r['away_score']),r['location']=='Neutral'))
                form.add(gameplays.get(r['game_id'],{}))
    if not records:
        raise ValueError('No eligible pregame team records were built from the supplied data.')
    keys=list(records[0][1])
    record_seasons=sorted({r[0] for r in records})
    if len(record_seasons)<3:
        raise ValueError('Walk-forward validation requires at least three eligible seasons: train, calibration, and holdout.')
    folds=[]
    for index in range(2,len(record_seasons)):
        holdout_season=record_seasons[index]
        calibration_season=record_seasons[index-1]
        fold=evaluate_fold(records,keys,calibration_season-1,calibration_season,holdout_season)
        folds.append(fold)
    if not folds:
        raise ValueError('No complete rolling walk-forward folds were produced.')
    latest=folds[-1]
    holdout_season=latest['holdoutSeason']
    calibration_season=latest['calibrationSeason']
    train_through=latest['trainThrough']
    model=latest['model']
    weight=latest['marketWeight']
    probability_scales=latest['winProbabilityScales']
    holdout_scores=latest['holdout']
    rolling=[{key:fold[key] for key in ('trainThrough','calibrationSeason','holdoutSeason','marketWeight','calibration','holdout')}
             for fold in folds]
    # Keep this compact shape for the existing data consumer; detailed diagnostics stay below.
    validation={k:{'scoreMAE':v['scoreMAE'],'marginMAE':v['marginMAE']} for k,v in holdout_scores.items()}
    validation['Market']=validation.pop('Closing Market Benchmark')
    validation['Blend']=validation.pop('Market Blend')
    return dict(modelVersion=f'candidate-train-{train_through}-cal-{calibration_season}-holdout-{holdout_season}',
                trainedThrough=train_through,weights=dict(zip(keys,model['weights'])),centers=dict(zip(keys,model['centers'])),intercept=model['intercept'],marketWeight=weight,
                winProbabilityScales=probability_scales,
                validation=validation,
                backtest={'protocol':'Expanding chronological folds: fit features on earlier seasons, calibrate market blending and win probability on the next season, then score a later untouched season.',
                          'marketNote':'The historical spread and total columns are closing-line benchmarks, not timestamped odds available at the forecast time.',
                          'weatherNote':'Historical observed weather is excluded because archived pregame forecasts are not available.',
                          'quarterbackNote':'Quarterback strength uses only player workload recorded before each game; the retrospectively listed starter is excluded.',
                          'calibrationSeason':calibration_season,'holdoutSeason':holdout_season,
                          'calibration':latest['calibration'],'holdout':holdout_scores,'rollingHoldouts':rolling},
                games=holdout_scores['Base']['games'])


if __name__=='__main__':
    if len(sys.argv)<2:
        raise SystemExit('Usage: python scripts/train_nfl.py DATA_DIRECTORY [OUTPUT_JSON]')
    config=fit(Path(sys.argv[1]))
    output=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).with_name('nfl_weights.candidate.json')
    output.write_text(json.dumps(config,indent=2)+'\n')
    print(json.dumps(config['backtest'],indent=2))
    print(f'Candidate weights saved to {output}; production nfl_weights.json was left unchanged.')
