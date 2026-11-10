import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from backtest_player_baselines import backtest,make_projection


class PlayerBaselineTests(unittest.TestCase):
    def test_efficiency_projection_combines_role_and_smoothed_production_rate(self):
        history=[
            {"season":2026,"position":"WR","stats":{"receptions":2},"usage":{"targets":5}},
            {"season":2026,"position":"WR","stats":{"receptions":5},"usage":{"targets":10}},
            {"season":2026,"position":"WR","stats":{"receptions":6},"usage":{"targets":15}},
        ]
        projection=make_projection(history,"receptions","WR",2026,prior_efficiency=.5)
        self.assertEqual(projection["season"],13/3)
        self.assertEqual(projection["recent"],13/3)
        self.assertEqual(projection["projectedUsage"],10)
        self.assertAlmostEqual(projection["opportunity"],4.6)

    def test_backtest_excludes_same_week_and_future_game_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"player-stats").mkdir()
            with (root/"games.csv").open("w",newline="") as out:
                writer=csv.DictWriter(out,fieldnames=["game_id","season","game_type","result"])
                writer.writeheader()
                for week in (1,2):writer.writerow({"game_id":f"2026_{week:02}_B_A","season":2026,"game_type":"REG","result":7})
            fields=["player_id","player_display_name","position","season","week","season_type","game_id","team","opponent_team","attempts","carries","targets","passing_yards","passing_tds","rushing_yards","receiving_yards","receptions","rushing_tds","receiving_tds"]
            with (root/"player-stats"/"2026.csv").open("w",newline="") as out:
                writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader()
                for week,receptions,targets in ((1,2,5),(2,4,8)):
                    writer.writerow({"player_id":"p1","player_display_name":"Receiver","position":"WR","season":2026,"week":week,"season_type":"REG","game_id":f"2026_{week:02}_B_A","team":"A","opponent_team":"B","attempts":0,"carries":0,"targets":targets,"passing_yards":0,"passing_tds":0,"rushing_yards":0,"receiving_yards":30,"receptions":receptions,"rushing_tds":0,"receiving_tds":0})
            report=backtest(root)
            metrics=report["aggregate"]["WR · receptions · season"]
            self.assertEqual(metrics["games"],1)
            self.assertEqual(metrics["mae"],2.0)
            self.assertIn("earlier completed game logs",report["protocol"])


if __name__=="__main__":unittest.main()
