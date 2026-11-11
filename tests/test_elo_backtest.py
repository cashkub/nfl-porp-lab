import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from elo_backtest import (build_predictions, calibrate_scale, elo_probability,
                          market_probability, prediction_metrics, upcoming_forecasts)


class EloBacktestTests(unittest.TestCase):
    def test_home_field_and_neutral_site_probability(self):
        self.assertGreater(elo_probability(1500, 1500), 0.5)
        self.assertEqual(elo_probability(1500, 1500, neutral=True), 0.5)

    def test_builds_predictions_before_updating_week_ratings(self):
        games = [
            {"season": 2024, "week": 1, "game_type": "REG", "home_team": "A", "away_team": "B",
             "home_score": "28", "away_score": "7", "location": "Home"},
            {"season": 2024, "week": 2, "game_type": "REG", "home_team": "B", "away_team": "A",
             "home_score": "10", "away_score": "17", "location": "Home"},
        ]
        predictions = build_predictions(games)
        self.assertEqual(len(predictions), 2)
        self.assertAlmostEqual(predictions[0]["eloProbability"], elo_probability(1500, 1500))
        self.assertNotAlmostEqual(predictions[1]["eloProbability"], 0.5)

    def test_moneyline_removes_vig_by_normalizing_implied_probability(self):
        probability = market_probability({"home_moneyline": "-150", "away_moneyline": "+130"})
        self.assertGreater(probability, 0.5)
        self.assertLess(probability, 1)

    def test_calibration_is_fit_separately_and_metrics_report_count(self):
        rows = [{"homeOutcome": 1.0, "eloProbability": .60},
                {"homeOutcome": 0.0, "eloProbability": .40},
                {"homeOutcome": 1.0, "eloProbability": .55},
                {"homeOutcome": 0.0, "eloProbability": .45}]
        scale = calibrate_scale(rows)
        metrics = prediction_metrics(rows, scale)
        self.assertGreater(scale, 0)
        self.assertEqual(metrics["games"], 4)
        self.assertLess(metrics["brier"], .25)

    def test_upcoming_forecasts_use_prior_season_calibration_and_prior_weeks_only(self):
        rows = [
            {"game_id":"2024_01_B_A", "season":2024, "week":1, "game_type":"REG",
             "home_team":"A", "away_team":"B", "home_score":"24", "away_score":"10", "location":"Home"},
            {"game_id":"2024_02_A_B", "season":2024, "week":2, "game_type":"REG",
             "home_team":"B", "away_team":"A", "home_score":"17", "away_score":"21", "location":"Home"},
            {"game_id":"2025_01_B_A", "season":2025, "week":1, "game_type":"REG",
             "home_team":"A", "away_team":"B", "home_score":"31", "away_score":"7", "location":"Home"},
            {"game_id":"2025_02_B_A", "season":2025, "week":2, "game_type":"REG",
             "home_team":"A", "away_team":"B", "home_score":"0", "away_score":"45", "location":"Home"},
            {"game_id":"2025_02_D_C", "season":2025, "week":2, "game_type":"REG",
             "home_team":"C", "away_team":"D", "home_score":"", "away_score":"", "location":"Home"},
            {"game_id":"2025_03_D_C", "season":2025, "week":3, "game_type":"REG",
             "home_team":"C", "away_team":"D", "home_score":"", "away_score":"", "location":"Home"},
        ]
        forecast = upcoming_forecasts(rows, current_season=2025)
        self.assertEqual(forecast["2025_02_D_C"]["calibrationSeason"], 2024)
        self.assertEqual(forecast["2025_02_D_C"]["asOfWeek"], 1)
        self.assertAlmostEqual(forecast["2025_02_D_C"]["homeRating"], 1500)
        self.assertEqual(forecast["2025_03_D_C"]["asOfWeek"], 2)

        # Changing a completed result in Week 2 cannot leak into another Week 2 forecast.
        rows[3] = {**rows[3], "home_score":"7", "away_score":"42"}
        changed = upcoming_forecasts(rows, current_season=2025)
        self.assertEqual(forecast["2025_02_D_C"]["homeProbability"],
                         changed["2025_02_D_C"]["homeProbability"])


if __name__ == "__main__":
    unittest.main()
