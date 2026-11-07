#!/usr/bin/env python3
"""Download nflverse week-level player stats and publish compact site-ready JSON.

No extra Python packages required. Run automatically with GitHub Actions or locally:
    python3 scripts/update_data.py

Source: https://github.com/nflverse/nflverse-data/releases/tag/stats_player
The nightly nflverse release can lag completed games and be corrected later.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "stats.json"
URL_TEMPLATE = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
STAT_COLUMNS = {
    "passingYards": "passing_yards", "rushingYards": "rushing_yards",
    "receivingYards": "receiving_yards", "receptions": "receptions",
}
OFFENSE_POSITIONS = {"QB", "RB", "FB", "WR", "TE"}
TEAM_ALIASES = {"JAC": "JAX", "STL": "LAR", "LA": "LAR", "WSH": "WAS", "OAK": "LV", "SD": "LAC"}


def current_nfl_season(when: datetime | None = None) -> int:
    now = when or datetime.now(timezone.utc)
    return now.year if now.month >= 7 else now.year - 1


def env_seasons() -> list[int]:
    specified = os.getenv("NFL_SEASONS", "").strip()
    if specified:
        return sorted({int(x.strip()) for x in specified.split(",") if x.strip()})
    latest = current_nfl_season()
    return list(range(latest - 2, latest + 1))


def fetch_csv(season: int, retries: int = 3) -> str | None:
    url = URL_TEMPLATE.format(season=season)
    request = urllib.request.Request(url, headers={
        "User-Agent": "gridiron-lab/1.0 (https://github.com/nflverse/nflverse-data)",
        "Accept": "text/csv,*/*",
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=65) as response:
                data = response.read()
            if len(data) < 100:
                raise ValueError(f"Unexpectedly small nflverse response ({len(data)} bytes): {url}")
            text = data.decode("utf-8-sig")
            if not text.startswith("player_id,") and "player_id" not in text.splitlines()[0].split(","):
                raise ValueError(f"Unexpected CSV header from {url}. Check upstream release.")
            return text
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                print(f"No release for season {season} (404); skipping.", file=sys.stderr)
                return None
            if attempt == retries - 1:
                raise RuntimeError(f"HTTP {exc.code} while downloading {url}") from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            if attempt == retries - 1:
                raise RuntimeError(f"Failed to load {url}: {exc}") from exc
        time.sleep(2 ** attempt)
    return None


def to_number(value: str | None) -> int:
    try:
        return int(round(float(value))) if value not in (None, "", "NA", "NaN") else 0
    except (ValueError, TypeError):
        return 0


def normalize_team(team: str) -> str:
    team = (team or "").upper().strip()
    return TEAM_ALIASES.get(team, team)


def venue_from_game_id(game_id: str, team: str) -> str:
    """nflverse game_id is SEASON_WEEK_AWAY_HOME."""
    chunks = str(game_id).split("_")
    if len(chunks) != 4:
        return "?"
    actual = normalize_team(team)
    away, home = normalize_team(chunks[-2]), normalize_team(chunks[-1])
    if actual == home:
        return "H"
    if actual == away:
        return "A"
    return "?"


def parse_player_stats_csv(text: str, expected_season: int) -> list[dict]:
    source = csv.DictReader(io.StringIO(text))
    required = {"player_id", "season", "week", "game_id", "opponent_team", *STAT_COLUMNS.values()}
    headers = set(source.fieldnames or [])
    if not required.issubset(headers):
        raise ValueError(f"nflverse player stats schema changed; missing: {sorted(required - headers)}")
    if not ({"team", "recent_team"} & headers):
        raise ValueError("Missing 'team' or 'recent_team' column in player stats")
    if not ({"player_display_name", "player_name"} & headers):
        raise ValueError("Missing player name column in player stats")

    records = []
    for raw in source:
        if raw.get("season_type", "REG").strip().upper() != "REG":
            continue
        if to_number(raw.get("season")) != expected_season:
            continue
        position = (raw.get("position") or "").strip().upper()
        stats = {key: to_number(raw.get(column)) for key, column in STAT_COLUMNS.items()}
        if position not in OFFENSE_POSITIONS and not any(stats.values()):
            continue
        name = (raw.get("player_display_name") or raw.get("player_name") or "").strip()
        player_id = (raw.get("player_id") or "").strip()
        team = (raw.get("team") or raw.get("recent_team") or "").strip().upper()
        game_id = (raw.get("game_id") or "").strip()
        week = to_number(raw.get("week"))
        if not player_id or not name or not game_id or not week:
            continue
        records.append({
            "id": player_id, "name": name, "position": position, "team": team,
            "game": {
                "season": expected_season, "week": week, "seasonType": "REG", "gameId": game_id,
                "team": team, "opponent": (raw.get("opponent_team") or "").strip().upper(),
                "venue": venue_from_game_id(game_id, team), "stats": stats,
            },
        })
    return records


def build_payload(records: list[dict]) -> dict:
    grouped: dict[str, dict] = {}
    for record in records:
        player_id = record["id"]
        player = grouped.setdefault(player_id, {
            "id": player_id, "name": record["name"], "position": record["position"],
            "team": record["team"], "seasons": set(), "games": {},
        })
        game = record["game"]
        player["seasons"].add(game["season"])
        key = (game["season"], game["gameId"])
        # If nflverse publishes a corrected/duplicated row, keep the newer row.
        player["games"][key] = game
        if game["season"] >= max(player["seasons"]):
            player["name"] = record["name"]
            player["position"] = record["position"]
            player["team"] = record["team"]

    players = []
    for player in grouped.values():
        games = sorted(player["games"].values(), key=lambda g: (g["season"], g["week"], g["gameId"]))
        players.append({
            "id": player["id"], "name": player["name"], "position": player["position"],
            "team": player["team"], "seasons": sorted(player["seasons"]), "games": games,
        })
    all_seasons = sorted({season for p in players for season in p["seasons"]})
    newest = max(all_seasons) if all_seasons else 0
    # Favor recognizable offensive positions in the initial dropdown; search covers all.
    position_order = {"WR": 0, "QB": 1, "RB": 2, "TE": 3, "FB": 4}
    players.sort(key=lambda p: (
        -int(newest in p["seasons"]), position_order.get(p["position"], 9), p["name"].lower(), p["id"]
    ))
    return {"schemaVersion": 1, "status": "ready", "source": "nflverse stats_player week CSV", "seasons": all_seasons, "players": players}


def save_if_changed(payload: dict, dest: Path = OUTPUT) -> bool:
    canonical = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if dest.exists():
        try:
            previous = json.loads(dest.read_text(encoding="utf-8"))
            if previous.get("dataHash") == digest and previous.get("status") == "ready":
                print("No stats changes since previous import; no commit needed.")
                return False
        except (json.JSONDecodeError, OSError):
            pass
    payload = {**payload, "dataHash": digest, "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    dest.parent.mkdir(parents=True, exist_ok=True)
    scratch = dest.with_suffix(".json.tmp")
    scratch.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    scratch.replace(dest)
    print(f"Updated {dest}: {len(payload['players']):,} players across seasons {payload['seasons']}")
    return True


def main() -> int:
    records = []
    failed = []
    for season in env_seasons():
        try:
            text = fetch_csv(season)
            if text is None:
                continue
            rows = parse_player_stats_csv(text, season)
            if not rows:
                raise ValueError(f"No valid player stats for {season}; upstream may be incomplete")
            print(f"Season {season}: imported {len(rows):,} player/game records")
            records.extend(rows)
        except Exception as exc:
            failed.append((season, str(exc)))
            print(f"ERROR season {season}: {exc}", file=sys.stderr)
    if failed:
        print("Import aborted rather than silently publishing partial or stale data.", file=sys.stderr)
        return 1
    if not records:
        print("ERROR: No usable nflverse data was retrieved; keeping existing site data.", file=sys.stderr)
        return 1
    payload = build_payload(records)
    if not payload["players"]:
        print("ERROR: No searchable players in downloaded data; keeping old data.", file=sys.stderr)
        return 1
    save_if_changed(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
