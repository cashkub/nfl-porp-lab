import sys
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from cbb_bracket import project


class BracketTests(unittest.TestCase):
    def test_expanded_field_and_opening_round(self):
        conf = {str(i):str(i%32) for i in range(160)}
        teams = SimpleNamespace(state={t:[float(t)/10,0,0] for t in conf}, court=3)
        result = project([], conf, teams, date(2026,11,12), '2026-11-12')
        field = {row['id']:row for row in result['teams'] if row['seed']}
        self.assertEqual(len(field),76)
        self.assertEqual(len({conf[t] for t,r in field.items() if r['auto']}),32)
        entries = []
        for slots in result['regions'].values():
            self.assertEqual(set(slots),set(range(1,17)))
            for slot in slots.values():
                entries.extend(slot)
                self.assertEqual(len({field[t]['auto'] for t in slot}),1)
        self.assertCountEqual(entries,field.keys())
        self.assertEqual(sum(r['opening'] for r in field.values()),24)
        self.assertEqual(sum(r['bidPct'] for r in result['teams']),7600)
