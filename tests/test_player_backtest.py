import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from backtest_player_baselines import (backtest,make_projection,
                                      probability_over_from_errors,
                                      probability_delta_intervals,
                                      score_probability_predictions)


class PlayerBaselineTests(unittest.TestCase):
    def test_empirical_probability_requires_prior_week_residuals_and_uses_half_point(self):
        errors=[1.0]*60+[-1.0]*39
        self.assertIsNone(probability_over_from_errors(errors,10,10.5))
        probability=probability_over_from_errors(errors+[1.0],10,10.5)
        self.assertAlmostEqual(probability,62/102)

    def test_probability_metrics_compare_to_coin_flip_and_report_calibration(self):
        metrics=score_probability_predictions([
            {'probability':.75,'priorRateProbability':.5,'outcome':1},
            {'probability':.25,'priorRateProbability':.5,'outcome':0},
            {'probability':.6,'priorRateProbability':.5,'outcome':1},
            {'probability':.4,'priorRateProbability':.5,'outcome':0},
        ])
        self.assertEqual(metrics['games'],4)
        self.assertLess(metrics['brier'],metrics['coinFlipBrier'])
        self.assertLess(metrics['logLoss'],metrics['coinFlipLogLoss'])
        self.assertEqual(metrics['priorRateBrier'],.25)
        self.assertEqual(metrics['priorRateLogLoss'],metrics['coinFlipLogLoss'])
        self.assertEqual(metrics['calibrationGap'],0)

    def test_probability_gain_uses_paired_game_cluster_intervals(self):
        rows=[{'probability':.75 if i%2==0 else .25,'priorRateProbability':.5,
               'outcome':1 if i%2==0 else 0,'cluster':f'game-{i}'} for i in range(24)]
        intervals=probability_delta_intervals(rows,resamples=100)
        self.assertEqual(intervals['clusterGames'],24)
        self.assertLess(intervals['priorRateBrierDelta95CI'][1],0)
        self.assertLess(intervals['priorRateLogLossDelta95CI'][1],0)

    def test_efficiency_projection_combines_role_and_smoothed_production_rate(self):
        history=[
            {"season":2026,"position":"WR","stats":{"receptions":2},"usage":{"targets":5}},
            {"season":2026,"position":"WR","stats":{"receptions":5},"usage":{"targets":10}},
            {"season":2026,"position":"WR","stats":{"receptions":6},"usage":{"targets":15}},
        ]
        projection=make_projection(history,"receptions","WR",2026,prior_efficiency=.5)
        self.assertEqual(projection["season"],13/3)
        self.assertEqual(projection["recent"],13/3)
        self.assertEqual(projection["projectedUsage"],10)
        self.assertAlmostEqual(projection["opportunity"],4.6)

    def test_backtest_excludes_same_week_and_future_game_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"player-stats").mkdir()
            with (root/"games.csv").open("w",newline="") as out:
                writer=csv.DictWriter(out,fieldnames=["game_id","season","game_type","result"])
                writer.writeheader()
                for week in (1,2):writer.writerow({"game_id":f"2026_{week:02}_B_A","season":2026,"game_type":"REG","result":7})
            fields=["player_id","player_display_name","position","season","week","season_type","game_id","team","opponent_team","attempts","carries","targets","passing_yards","passing_tds","rushing_yards","receiving_yards","receptions","rushing_tds","receiving_tds"]
            with (root/"player-stats"/"2026.csv").open("w",newline="") as out:
                writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader()
                for week,receptions,targets in ((1,2,5),(2,4,8)):
                    writer.writerow({"player_id":"p1","player_display_name":"Receiver","position":"WR","season":2026,"week":week,"season_type":"REG","game_id":f"2026_{week:02}_B_A","team":"A","opponent_team":"B","attempts":0,"carries":0,"targets":targets,"passing_yards":0,"passing_tds":0,"rushing_yards":0,"receiving_yards":30,"receptions":receptions,"rushing_tds":0,"receiving_tds":0})
            report=backtest(root)
            metrics=report["aggregate"]["WR · receptions · season"]
            self.assertEqual(metrics["games"],1)
            self.assertEqual(metrics["mae"],2.0)
            self.assertIn("earlier completed game logs",report["protocol"])

    def test_probability_backtest_waits_for_one_hundred_prior_forecasts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"player-stats").mkdir()
            schedule_fields=["game_id","season","week","game_type","result"]
            player_fields=["player_id","player_display_name","position","season","week","season_type","game_id","team","opponent_team","attempts","carries","targets","passing_yards","passing_tds","rushing_yards","receiving_yards","receptions","rushing_tds","receiving_tds"]
            with (root/"games.csv").open("w",newline="") as schedule_out:
                sw=csv.DictWriter(schedule_out,fieldnames=schedule_fields);sw.writeheader()
                for season in range(2018,2026):
                    with (root/"player-stats"/f"{season}.csv").open("w",newline="") as stats_out:
                        pw=csv.DictWriter(stats_out,fieldnames=player_fields);pw.writeheader()
                        for week in range(1,18):
                            game_id=f"{season}_{week:02}_B_A"
                            sw.writerow({"game_id":game_id,"season":season,"week":week,"game_type":"REG","result":7})
                            value=1+(week%4)
                            pw.writerow({"player_id":"p1","player_display_name":"Receiver","position":"WR","season":season,"week":week,"season_type":"REG","game_id":game_id,"team":"A","opponent_team":"B","attempts":0,"carries":0,"targets":5,"passing_yards":0,"passing_tds":0,"rushing_yards":0,"receiving_yards":value*10,"receptions":value,"rushing_tds":0,"receiving_tds":0})
            report=backtest(root)
            metrics=report["probabilityAggregate"]["WR · receptions · opportunity"]
            self.assertEqual(metrics["games"],35)
            self.assertEqual(report["probabilityMethod"]["minimumPriorForecasts"],100)
            self.assertIn("priorRateBrierDelta95CI",report["probabilityAggregate"]["WR · receptions · opportunity"])


if __name__=="__main__":unittest.main()
