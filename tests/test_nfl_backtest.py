import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from train_nfl import prediction_metrics, ridge_regression


class BacktestMetricsTests(unittest.TestCase):
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
        rows = [(2025, {}, 0, 17, 17), (2025, {}, 0, 24, 24)]
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


if __name__ == "__main__":
    unittest.main()
