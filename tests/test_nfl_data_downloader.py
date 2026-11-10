import gzip
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from download_nfl_model_data import validate_games, validate_pbp, validate_player_stats


class NflModelDataTests(unittest.TestCase):
    def test_validate_schedule_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "games.csv"
            path.write_text("season,game_type,week,game_id,home_team,away_team,home_score,away_score,result\n")
            validate_games(path)

    def test_reject_schedule_schema_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "games.csv"
            path.write_text("season,game_type\n")
            with self.assertRaisesRegex(ValueError, "schema changed"):
                validate_games(path)

    def test_validate_compressed_pbp_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "2026.gz"
            header = "game_id,posteam,defteam,play_type,qb_dropback,epa,passer_player_id\n"
            with gzip.open(path, "wt", encoding="utf-8") as target:
                target.write(header)
            validate_pbp(path)

    def test_validate_player_stat_headers_with_supported_aliases(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "players.csv"
            fields = "player_id,player_name,position,season,week,season_type,game_id,recent_team,opponent_team,attempts,carries,targets,passing_yards,passing_tds,rushing_yards,receiving_yards,receptions,rushing_tds,receiving_tds"
            path.write_text(fields + "\n")
            validate_player_stats(path)

    def test_reject_player_stat_schema_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "players.csv"
            path.write_text("player_id,season,week\n")
            with self.assertRaisesRegex(ValueError, "player-stat schema changed"):
                validate_player_stats(path)


if __name__ == "__main__":
    unittest.main()
