import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from nfl_features import Form


def team(qb_id, name, epa):
    return {
        "n": Counter({"pass": 10, "passEpa": epa, "rush": 8, "rushEpa": 0, "success": 7, "drives": 10}),
        "qbs": {qb_id: [10, epa, name]},
    }


class PregameFeatureTests(unittest.TestCase):
    def test_historical_mode_ignores_retrospective_starting_quarterback(self):
        form = Form()
        form.add({"A": team("prior-qb", "Prior Quarterback", 4), "B": team("opp-qb", "Opponent", 2)})
        row = {"home_team": "A", "away_team": "B", "home_qb_id": "later-listed-qb", "home_qb_name": "Later Listed"}

        historical = form.matchup(row, "home", use_listed_qb=False)
        current = form.matchup(row, "home")

        self.assertEqual(historical["qbId"], "prior-qb")
        self.assertFalse(historical["listed"])
        self.assertEqual(current["qbId"], "later-listed-qb")
        self.assertTrue(current["listed"])


if __name__ == "__main__":
    unittest.main()
