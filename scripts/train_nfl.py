"""Fit NFL score residuals using local nflverse games.csv and season CSV.GZ files. Requires NumPy.
Usage: python scripts/train_nfl.py DATA_DIRECTORY
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
import numpy as np
from nfl_features import Form, plays, evaluation, number
from update_data import team_ratings


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
    keys=list(records[0][1])
    train=[r for r in records if r[0]<=2023]
    x=np.array([[r[1][k] for k in keys] for r in train]); y=np.array([r[3]-r[2] for r in train])
    center=x.mean(axis=0); scale=x.std(axis=0); z=(x-center)/scale
    coef=np.linalg.solve(z.T@z+200*np.eye(len(keys)),z.T@(y-y.mean()))/scale
    intercept=y.mean()
    for k in ('Wind','Cold','Rest'):
        i=keys.index(k);intercept-=center[i]*coef[i];center[i]=0
    def scores(rows):
        base=np.array([r[2] for r in rows]); actual=np.array([r[3] for r in rows]); market=np.array([r[4] for r in rows])
        stats=base+intercept+(np.array([[r[1][k] for k in keys] for r in rows])-center)@coef
        return base,actual,market,stats
    _,actual,market,stats=scores([r for r in records if r[0]==2024])
    weight=float(np.clip(np.sum((market-stats)*(actual-stats))/np.sum((market-stats)**2),0,1))
    base,actual,market,stats=scores([r for r in records if r[0]==2025])
    def measures(pred):
        margin=lambda a:a[1::2]-a[::2]
        return {'scoreMAE':round(float(np.abs(pred-actual).mean()),2),'marginMAE':round(float(np.abs(margin(pred)-margin(actual)).mean()),2)}
    return dict(weights=dict(zip(keys,coef)),centers=dict(zip(keys,center)),intercept=intercept,marketWeight=weight,
                validation={k:measures(v) for k,v in [('Base',base),('Stats',stats),('Market',market),('Blend',stats*(1-weight)+market*weight)]},
                games=len(actual)//2)


if __name__=='__main__':
    config=fit(Path(sys.argv[1]))
    Path(__file__).with_name('nfl_weights.json').write_text(json.dumps(config,indent=2)+'\n')
