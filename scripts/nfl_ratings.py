"""Experimental opponent-adjusted team ratings for walk-forward research only."""
from collections import defaultdict


def team_ratings_recency(results, half_life=6, prior_games=4, home_edge=0.75):
    """Fit offense/defense ratings with exponential decay over each team's game history.

    `results` must contain completed games in chronological order as
    (home, away, home_points, away_points, neutral). This function is an
    experiment and is intentionally separate from production ratings.
    """
    if half_life <= 0 or prior_games < 0:
        raise ValueError('half_life must be positive and prior_games cannot be negative.')
    games=defaultdict(list)
    totals=0.0
    for home,away,home_points,away_points,neutral in results:
        edge=0.0 if neutral else home_edge
        games[home].append((away,float(home_points),float(away_points),edge))
        games[away].append((home,float(away_points),float(home_points),-edge))
        totals+=float(home_points)+float(away_points)
    if not games:
        return {}
    baseline=totals/(2*len(results))
    attack=dict.fromkeys(games,0.0)
    allowed=attack.copy()
    weighted_rows={}
    for team,rows in games.items():
        weighted_rows[team]=[(row,0.5**((len(rows)-index-1)/half_life)) for index,row in enumerate(rows)]
    for _ in range(60):
        new_attack,new_allowed={},{}
        for team,rows in weighted_rows.items():
            weight_sum=sum(weight for _,weight in rows)
            new_attack[team]=sum(weight*(points-baseline-venue-allowed[opponent])
                                 for (opponent,points,_,venue),weight in rows)/(weight_sum+prior_games)
            new_allowed[team]=sum(weight*(points_allowed-baseline+venue-attack[opponent])
                                  for (opponent,_,points_allowed,venue),weight in rows)/(weight_sum+prior_games)
        attack,allowed=new_attack,new_allowed
    output={}
    for team,rows in games.items():
        weighted=weighted_rows[team]
        total_weight=sum(weight for _,weight in weighted)
        schedule_strength=sum(weight*(attack[opponent]-allowed[opponent])
                              for (opponent,_,_,_),weight in weighted)/total_weight
        output[team]={'offense':round(baseline+attack[team],2),
                      'defense':round(baseline+allowed[team],2),
                      'baseline':round(baseline,2),'games':len(rows),
                      'wins':[opponent for opponent,pf,pa,_ in rows if pf>pa],
                      'scheduleStrength':round(schedule_strength,1),
                      'effectiveGames':round(total_weight,2)}
    return output
