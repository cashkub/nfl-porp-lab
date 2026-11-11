import csv
import gzip
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from train_nfl import (calibrate_win_scale, fit, fit_line_sigmas,
                       line_probability_metrics, prediction_metrics, ridge_regression)


class BacktestMetricsTests(unittest.TestCase):
    def test_walk_forward_fit_uses_calibration_and_holdout_seasons_and_skips_upcoming_games(self):
        with TemporaryDirectory() as tmp:
            directory = Path(tmp)
            schedule_path = directory / "games.csv"
            fields = ["game_id", "season", "game_type", "week", "home_team", "away_team",
                      "home_score", "away_score", "result", "location", "wind", "temp", "roof",
                      "total_line", "spread_line", "gameday", "gametime"]
            matchups = {1: [("A", "B"), ("C", "D")],
                        2: [("A", "C"), ("B", "D")],
                        3: [("A", "D"), ("B", "C")],
                        4: [("A", "B"), ("C", "D")],
                        5: [("A", "C")]}
            with schedule_path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                for season in (2019, 2020, 2021):
                    for week, games in matchups.items():
                        for index, (home, away) in enumerate(games):
                            complete = week <= 4
                            home_score = 21 + index + week
                            away_score = 17 + index
                            writer.writerow({"game_id": f"{season}_{week:02}_{away}_{home}", "season": season,
                                "game_type": "REG", "week": week, "home_team": home, "away_team": away,
                                "home_score": home_score if complete else "", "away_score": away_score if complete else "",
                                "result": home_score-away_score if complete else "", "location": "Home", "wind": 12,
                                "temp": 38, "roof": "outdoors", "total_line": 40, "spread_line": 1,
                                "gameday": f"{season}-09-{week:02}", "gametime": "13:00"})
            pbp_header = ["game_id", "posteam", "defteam", "qb_dropback", "play_type", "qb_kneel",
                          "qb_spike", "epa", "fixed_drive", "passer_player_id", "passer_player_name"]
            for season in (2019, 2020, 2021):
                with gzip.open(directory / f"{season}.gz", "wt", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=pbp_header)
                    writer.writeheader()
                    for week, games in matchups.items():
                        if week == 5:
                            continue
                        for index, (home, away) in enumerate(games):
                            game_id = f"{season}_{week:02}_{away}_{home}"
                            for team in (home, away):
                                writer.writerow({"game_id": game_id, "posteam": team,
                                    "defteam": away if team == home else home, "qb_dropback": 1,
                                    "play_type": "pass", "qb_kneel": 0, "qb_spike": 0,
                                    "epa": .1 + index/10, "fixed_drive": 1,
                                    "passer_player_id": team+"-qb", "passer_player_name": team+" QB"})

            report = fit(directory)
            self.assertEqual(report["backtest"]["calibrationSeason"], 2020)
            self.assertEqual(report["backtest"]["holdoutSeason"], 2021)
            self.assertEqual(report["games"], 2)
            self.assertIn("totalMAE", report["backtest"]["holdout"]["Stats"])
            self.assertEqual(report["backtest"]["weatherNote"].startswith("Historical observed weather is excluded"), True)

    def test_ridge_regression_recovers_a_simple_linear_signal(self):
        center, coefficients, intercept = ridge_regression(
            [[0.0, 1.0], [1.0, 0.0], [2.0, 1.0], [3.0, 0.0]],
            [1.0, 3.0, 5.0, 7.0],
            ridge=0,
        )
        self.assertAlmostEqual(center[0], 1.5)
        self.assertAlmostEqual(intercept, 4.0)
        self.assertAlmostEqual(coefficients[0], 2.0)
        self.assertAlmostEqual(coefficients[1], 0.0)

    def test_metrics_cover_team_scores_margin_total_and_winner(self):
        rows = [(2025, {}, 0, 0, 17, 17), (2025, {}, 0, 0, 24, 24)]
        metrics = prediction_metrics([14, 20], rows)
        self.assertEqual(metrics, {
            "games": 1,
            "scoreMAE": 3.5,
            "marginMAE": 1.0,
            "totalMAE": 7.0,
            "winnerAccuracy": 1.0,
        })

    def test_metrics_reject_unpaired_forecasts(self):
        with self.assertRaisesRegex(ValueError, "paired away/home"):
            prediction_metrics([20], [(2025, {}, 0, 17, 17)])

    def test_metrics_do_not_score_an_empty_sample(self):
        with self.assertRaisesRegex(ValueError, "empty forecast sample"):
            prediction_metrics([], [])

    def test_win_probabilities_are_calibrated_on_prior_games_and_scored_on_holdout(self):
        calibration = [(2025, {}, 0, 0, 10, 20), (2025, {}, 0, 0, 20, 20),
                       (2025, {}, 0, 0, 20, 10), (2025, {}, 0, 0, 10, 10)]
        predictions = [10, 20, 20, 10]
        scale = calibrate_win_scale(predictions, calibration)
        self.assertGreater(scale, 0)
        scores = prediction_metrics(predictions, calibration, scale)
        self.assertEqual(scores["winProbabilityGames"], 2)
        self.assertLess(scores["winBrier"], 0.1)
        self.assertLess(scores["winLogLoss"], 0.4)

    def test_win_probability_metrics_exclude_tied_final_scores(self):
        rows = [(2025, {}, 0, 0, 10, 30), (2025, {}, 0, 0, 20, 30),
                (2025, {}, 0, 0, 14, 20), (2025, {}, 0, 0, 14, 20)]
        scores = prediction_metrics([10, 20, 14, 14], rows, 0.1)
        self.assertEqual(scores["games"], 2)
        self.assertEqual(scores["winProbabilityGames"], 1)

    def test_line_probability_uncertainty_is_fit_from_calibration_rows(self):
        rows = [(2025, {}, 0, 0, 14, 0), (2025, {}, 0, 0, 24, 0),
                (2025, {}, 0, 0, 21, 0), (2025, {}, 0, 0, 20, 0)]
        forecasts = [18, 26, 22, 20]
        closing_market_scores = [20, 23, 22, 21]
        sigmas = fit_line_sigmas(forecasts, rows, closing_market_scores)
        self.assertGreater(sigmas["spread"], 0)
        self.assertGreater(sigmas["total"], 0)
        metrics = line_probability_metrics(forecasts, rows, closing_market_scores, sigmas)
        self.assertIn("brier", metrics["spread"])
        self.assertIn("logLoss", metrics["total"])
        self.assertEqual(metrics["spread"]["games"], 1)

    def test_line_probabilities_use_forecasts_and_exclude_pushes(self):
        rows = [(2025, {}, 0, 0, 20, 0), (2025, {}, 0, 0, 30, 0),
                (2025, {}, 0, 0, 20, 0), (2025, {}, 0, 0, 24, 0)]
        metrics = line_probability_metrics([20, 28, 20, 24], rows,
                                           [20, 24, 20, 24],
                                           {"spread": 5, "total": 8})
        self.assertEqual(metrics["spread"]["games"], 1)
        self.assertEqual(metrics["total"]["games"], 1)
        self.assertLess(metrics["spread"]["brier"], 0.25)
        self.assertLess(metrics["total"]["brier"], 0.25)


if __name__ == "__main__":
    unittest.main()
