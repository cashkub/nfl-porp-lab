from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from nfl_injuries import merge_current_injuries


class WeeklyInjuriesTest(unittest.TestCase):
    def test_only_next_fixture_and_verified_statuses(self):
        now = datetime(2026, 11, 11, 17, tzinfo=timezone.utc)
        games = [dict(season=2026,week=str(w),kickoff=f"2026-11-{d}T18:00:00+00:00",
                      home="WAS",away="GB",injuries={"WAS":[dict(name="Starter",gameStatus="Out")]})
                 for w,d in [(10,15),(11,22)]]
        def entry(name,status,date,details):
            return dict(status=status,date=date,details=details,athlete=dict(displayName=name,team=dict(abbreviation="WSH")))
        records=[entry("Starter","Questionable","2026-11-11",{"type":"Knee"}),
                 entry("Reserve","Injured Reserve","2026-10-01",{}),
                 entry("Old", "Out","2026-11-07",{"type":"Toe"}),
                 entry("News only","Out","2026-11-11",{}),
                 entry("Guard","Doubtful","2026-11-11",{"type":"Ankle"})]
        feed=dict(timestamp=now.isoformat(),season=dict(year=2026),injuries=[dict(injuries=records)])
        merge_current_injuries(games,feed,{},{"WAS":"2026-11-08"},now)
        self.assertEqual({r["name"]:r["gameStatus"] for r in games[0]["injuries"]["WAS"]},
                         {"Starter":"Out","Reserve":"Injured Reserve","Guard":"Doubtful"})
        self.assertEqual(len(games[1]["injuries"]["WAS"]),1)

class WednesdayBaselineTest(unittest.TestCase):
    def test_repeated_import_retains_first_observed_baseline(self):
        from update_data import keep_wednesday_injuries
        now = datetime(2026, 11, 11, 17, tzinfo=timezone.utc)
        game = dict(id='g', kickoff='2026-11-15T18:00:00+00:00', injuries={'CLE':[dict(name='Starter',status='Questionable')]})
        keep_wednesday_injuries([game], [], now)
        latest = dict(game, injuries={'CLE':[dict(name='Starter',status='Out')]})
        keep_wednesday_injuries([latest], [game], now)
        self.assertEqual(latest['wednesdayInjuries']['teams']['CLE'][0]['status'], 'Questionable')
