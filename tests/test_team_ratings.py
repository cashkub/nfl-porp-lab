import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_data import team_ratings, schedule_rows


class ModelTests(unittest.TestCase):
    def test_matching_scores_against_better_defenses(self):
        games = [('A','B',24,14,True), ('C','D',24,14,True),
                 ('E','B',10,20,True), ('E','D',40,20,True)]
        ratings = team_ratings(games)
        self.assertGreater(ratings['A']['offense'], ratings['C']['offense'])
        self.assertLess(ratings['B']['defense'], ratings['D']['defense'])
        self.assertEqual(ratings['A']['wins'], ['B'])

    def test_market_sign_and_as_of_date(self):
        text = ('season,game_type,gameday,gametime,week,away_team,home_team,result,location,home_score,away_score,spread_line\n'
                '2026,REG,2026-11-10,12:00,10,A,B,3,Home,17,14,\n'
                '2026,REG,2026-11-01,12:00,9,A,B,,Home,,,-3\n')
        game = schedule_rows(text,[2026])[0]
        self.assertEqual(game['homeSpread'],3)
        self.assertIsNone(game['homeRating'])
