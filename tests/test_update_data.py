"""Offline validation for the nflverse CSV importer."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_data import parse_player_stats_csv, build_payload, save_if_changed, venue_from_game_id, current_nfl_season

CSV_TEXT = '''player_id,player_display_name,position,season,week,season_type,game_id,team,opponent_team,passing_yards,rushing_yards,receiving_yards,receptions,passing_tds,rushing_tds,receiving_tds
p1,Test Player,WR,2026,1,REG,2026_01_BAL_CIN,CIN,BAL,0,0,89,7,0,0,1
p1,Test Player,WR,2026,2,REG,2026_02_CIN_CLE,CIN,CLE,0,0,42,3,0,0,0
p2,Test Passer,QB,2026,1,REG,2026_01_BUF_NYJ,NYJ,BUF,246,12,0,0,3,1,0
p1,Test Player,WR,2026,20,POST,2026_20_CIN_BAL,CIN,BAL,0,0,50,4,0,0,1
'''

class DataImportTests(unittest.TestCase):
    def test_venue(self):
        self.assertEqual(venue_from_game_id('2026_01_BAL_CIN','CIN'),'H')
        self.assertEqual(venue_from_game_id('2026_02_CIN_CLE','CIN'),'A')
        self.assertEqual(venue_from_game_id('invalid','CIN'),'?')

    def test_parse_games_and_stats(self):
        parsed = parse_player_stats_csv(CSV_TEXT, 2026)
        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]['game']['stats']['receptions'], 7)
        self.assertEqual(parsed[0]['game']['stats']['scoredTDs'], 1)
        self.assertEqual(parsed[2]['game']['stats']['passingTDs'], 3)
        self.assertEqual(parsed[2]['game']['stats']['scoredTDs'], 1)
        self.assertEqual(parsed[1]['game']['venue'], 'A')
        self.assertEqual(parsed[2]['game']['stats']['passingYards'], 246)

    def test_payload_search_all_players_and_seasons(self):
        parsed = parse_player_stats_csv(CSV_TEXT, 2026)
        payload = build_payload(parsed)
        self.assertEqual(payload['seasons'], [2026])
        self.assertEqual(len(payload['players']), 2)
        self.assertEqual(len(next(p for p in payload['players'] if p['id']=='p1')['games']), 2)

    def test_idempotent_data_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'stats.json'
            self.assertTrue(save_if_changed(build_payload(parse_player_stats_csv(CSV_TEXT, 2026)), path))
            before = path.read_bytes()
            self.assertFalse(save_if_changed(build_payload(parse_player_stats_csv(CSV_TEXT, 2026)), path))
            self.assertEqual(before, path.read_bytes())

    def test_nfl_calendar(self):
        self.assertEqual(current_nfl_season(datetime(2026, 1, 7, tzinfo=timezone.utc)),2025)
        self.assertEqual(current_nfl_season(datetime(2026, 11, 7, tzinfo=timezone.utc)),2026)

if __name__ == '__main__':
    unittest.main()
