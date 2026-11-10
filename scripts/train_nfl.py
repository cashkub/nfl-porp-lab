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


def prediction_metrics(pred, rows):
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
    return {'games':len(actual_margins),
            'scoreMAE':round(sum(point_errors)/len(point_errors),2),
            'marginMAE':round(sum(margin_errors)/len(margin_errors),2),
            'totalMAE':round(sum(total_errors)/len(total_errors),2),
            'winnerAccuracy':round(winner_accuracy,3) if winner_accuracy is not None else None}


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
    holdout_season=record_seasons[-1]
    calibration_season=record_seasons[-2]
    train_through=calibration_season-1
    train=[r for r in records if r[0]<=train_through]
    if not train:
        raise ValueError(f'No training records through {train_through} were found.')
    x=[[r[1][k] for k in keys] for r in train]
    y=[r[4]-r[2] for r in train]
    center,coef,intercept=ridge_regression(x,y)
    for k in ('Wind','Cold','Rest'):
        i=keys.index(k);intercept-=center[i]*coef[i];center[i]=0
    def scores(rows):
        base=[r[2] for r in rows]; recent=[r[3] for r in rows]; actual=[r[4] for r in rows]; market=[r[5] for r in rows]
        stats=[base[i]+intercept+sum((r[1][k]-center[j])*coef[j] for j,k in enumerate(keys)) for i,r in enumerate(rows)]
        return base,recent,actual,market,stats
    calibration=[r for r in records if r[0]==calibration_season]
    holdout=[r for r in records if r[0]==holdout_season]
    if not calibration or not holdout:
        raise ValueError(f'Walk-forward evaluation requires eligible games in calibration season {calibration_season} and holdout season {holdout_season}.')
    _,_,actual,market,stats=scores(calibration)
    denominator=sum((m-s)**2 for m,s in zip(market,stats))
    weight=max(0.0,min(1.0,sum((m-s)*(a-s) for m,s,a in zip(market,stats,actual))/denominator)) if denominator else 0.0

    def evaluate(rows):
        base,recent,actual,market,stats=scores(rows)
        blend=[s*(1-weight)+m*weight for s,m in zip(stats,market)]
        return {'Base':prediction_metrics(base,rows),'Recency Weighted':prediction_metrics(recent,rows),
                'Stats':prediction_metrics(stats,rows),
                'Closing Market Benchmark':prediction_metrics(market,rows),
                'Market Blend':prediction_metrics(blend,rows)}

    # Keep this compact shape for the existing data consumer; detailed diagnostics stay below.
    holdout_scores=evaluate(holdout)
    validation={k:{'scoreMAE':v['scoreMAE'],'marginMAE':v['marginMAE']} for k,v in holdout_scores.items()}
    validation['Market']=validation.pop('Closing Market Benchmark')
    validation['Blend']=validation.pop('Market Blend')
    return dict(modelVersion=f'candidate-train-{train_through}-cal-{calibration_season}-holdout-{holdout_season}',
                trainedThrough=train_through,weights=dict(zip(keys,coef)),centers=dict(zip(keys,center)),intercept=intercept,marketWeight=weight,
                validation=validation,
                backtest={'protocol':f'Train feature weights through {train_through}; tune market blend on {calibration_season}; report {holdout_season} as the untouched holdout.',
                          'marketNote':'The historical spread and total columns are closing-line benchmarks, not timestamped odds available at the forecast time.',
                          'weatherNote':'Historical observed weather is excluded because archived pregame forecasts are not available.',
                          'quarterbackNote':'Quarterback strength uses only player workload recorded before each game; the retrospectively listed starter is excluded.',
                          'calibrationSeason':calibration_season,'holdoutSeason':holdout_season,
                          'calibration':evaluate(calibration),'holdout':holdout_scores},
                games=len(holdout)//2)


if __name__=='__main__':
    if len(sys.argv)<2:
        raise SystemExit('Usage: python scripts/train_nfl.py DATA_DIRECTORY [OUTPUT_JSON]')
    config=fit(Path(sys.argv[1]))
    output=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).with_name('nfl_weights.candidate.json')
    output.write_text(json.dumps(config,indent=2)+'\n')
    print(json.dumps(config['backtest'],indent=2))
    print(f'Candidate weights saved to {output}; production nfl_weights.json was left unchanged.')
