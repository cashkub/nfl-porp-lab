import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from cbb_model import Teams, allocate_minutes, outcomes
from update_cbb_v2 import choose


class BasketballModelTests(unittest.TestCase):
    def test_minutes_redistributed_without_exceeding_regulation(self):
        minutes = allocate_minutes(dict(enumerate([90, 35, 30, 25, 20, 10, 5])))
        self.assertAlmostEqual(sum(minutes.values()), 200)
        self.assertEqual(max(minutes.values()), 40)
        self.assertEqual(allocate_minutes({'one': 30}), {})

    def test_home_advantage_removed_at_neutral_site(self):
        team = Teams()
        game = dict(home='1', away='2', time='2026-11-12', neutral=True)
        home, away, _, court = team.forecast(game)
        self.assertEqual((home-away, court), (0, 0))
        game['neutral'] = False
        self.assertGreater(team.forecast(game)[0], team.forecast(game)[1])

    def test_spread_sign_and_push(self):
        quotes = {'away': {'line': 4, 'price': -110}, 'home': {'line': -4, 'price': -110}}
        selected = choose('Spread', quotes, [1, 4, 5, 2], {})
        self.assertEqual(selected['side'], 'away')
        self.assertEqual(selected['prob'], .5)

    def test_prop_observations_include_pushes(self):
        p = outcomes([5, 6, 7], 6)
        self.assertAlmostEqual(sum(p.values()), 1)
        self.assertGreater(p['push'], 0)
        self.assertLess(outcomes([5, 5], 4)['over'], 1)
