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
import math
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "stats.json"
URL_TEMPLATE = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
STAT_COLUMNS = {
    "passingYards": "passing_yards", "rushingYards": "rushing_yards",
    "receivingYards": "receiving_yards", "receptions": "receptions",
    "passingTDs": "passing_tds", "rushingTDs": "rushing_tds", "receivingTDs": "receiving_tds",
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


def team_ratings(results):
    """Fit scoring and points-allowed effects against each opponent, with four league-average prior games."""
    games = defaultdict(list)
    for home, away, hp, ap, neutral in results:
        advantage = 0 if neutral else 0.75
        games[home].append((away, hp, ap, advantage))
        games[away].append((home, ap, hp, -advantage))
    if not games:
        return {}
    baseline = sum(hp + ap for _, _, hp, ap, _ in results) / (2 * len(results))
    attack = dict.fromkeys(games, 0)
    allowed = attack.copy()
    for _ in range(30):
        new_attack, new_allowed = {}, {}
        for team, rows in games.items():
            new_attack[team] = sum(pf - baseline - venue - allowed[opp] for opp,pf,pa,venue in rows) / (len(rows)+4)
            new_allowed[team] = sum(pa - baseline + venue - attack[opp] for opp,pf,pa,venue in rows) / (len(rows)+4)
        attack, allowed = new_attack, new_allowed
    return {team: {'offense':round(baseline+attack[team],2), 'defense':round(baseline+allowed[team],2),
                   'baseline':round(baseline,2), 'games':len(rows),
                   'wins':[opp for opp,pf,pa,_ in rows if pf>pa],
                   'scheduleStrength':round(sum(attack[o]-allowed[o] for o,*_ in rows)/len(rows),1)}
            for team,rows in games.items()}


def market_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def schedule_rows(text: str, seasons: list[int]) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    required = {"season", "game_type", "gameday", "gametime", "week", "away_team", "home_team", "result", "location"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Unexpected nflverse schedule columns")
    games = []
    games_per_date = Counter()
    eastern = ZoneInfo("America/New_York")
    results = defaultdict(list)
    ratings = {}
    for row in sorted(reader, key=lambda r: (r["gameday"], r["gametime"])):
        season = to_number(row["season"])
        if season not in seasons or row["game_type"] == "PRE":
            continue
        if not row["gameday"] or not row["away_team"] or not row["home_team"]:
            continue
        games_per_date[row["gameday"]] += 1
        home, away = normalize_team(row["home_team"]), normalize_team(row["away_team"])
        neutral = row["location"] == "Neutral"
        if row["result"] not in ("", "NA"):
            hp, ap = market_number(row.get("home_score")), market_number(row.get("away_score"))
            if hp is not None and ap is not None:
                results[season].append((home, away, hp, ap, neutral))
                ratings.pop(season, None)
            continue
        if season not in ratings:
            ratings[season] = team_ratings(results[season])
        spread = market_number(row.get("spread_line"))
        time_known = row["gametime"] not in ("", "NA", "TBD")
        local = datetime.fromisoformat(row["gameday"] + "T" + (row["gametime"] if time_known else "23:59")).replace(tzinfo=eastern)
        games.append({"season": season, "week": row["week"], "stage": row["game_type"],
                      "date": row["gameday"], "kickoff": local.isoformat(), "timeKnown": time_known,
                      "away": normalize_team(row["away_team"]), "home": normalize_team(row["home_team"]),
                      "neutral": neutral, "homeRating": ratings[season].get(home), "awayRating": ratings[season].get(away),
                      "totalLine": market_number(row.get("total_line")),
                      "overPrice": market_number(row.get("over_odds")), "underPrice": market_number(row.get("under_odds")),
                      "homeSpread": -spread if spread is not None else None,
                      "homePrice": market_number(row.get("home_moneyline")), "awayPrice": market_number(row.get("away_moneyline"))})
    for game in games:
        game["slateGames"] = games_per_date[game["date"]]
    return sorted(games, key=lambda g: g["kickoff"])


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
        stats["scoredTDs"] = stats["rushingTDs"] + stats["receivingTDs"]
        if "carries" in raw:
            stats["rushingAttempts"] = to_number(raw["carries"])
        if position not in OFFENSE_POSITIONS and not any(stats.values()):
            continue
        name = (raw.get("player_display_name") or raw.get("player_name") or "").strip()
        player_id = (raw.get("player_id") or "").strip()
        team = (raw.get("team") or raw.get("recent_team") or "").strip().upper()
        game_id = (raw.get("game_id") or "").strip()
        week = to_number(raw.get("week"))
        if not player_id or not name or not game_id or not week:
            continue
        usage = {key: to_number(raw[key]) for key in ("attempts", "carries", "targets")
                 if raw.get(key) not in (None, "", "NA", "NaN")}
        if "carries" in raw and "targets" in raw:
            usage["opportunities"] = usage.get("carries", 0) + usage.get("targets", 0)
        records.append({
            "id": player_id, "name": name, "position": position, "team": team,
            "photo": raw.get("headshot_url"),
            "game": {
                "season": expected_season, "week": week, "seasonType": "REG", "gameId": game_id,
                "team": team, "opponent": (raw.get("opponent_team") or "").strip().upper(),
                "venue": venue_from_game_id(game_id, team), "stats": stats,
                "usage": usage,
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
            if (record.get("photo") or "").startswith("https://"):
                player["photo"]=record["photo"]
            player["name"] = record["name"]
            player["position"] = record["position"]
            player["team"] = record["team"]

    players = []
    for player in grouped.values():
        games = sorted(player["games"].values(), key=lambda g: (g["season"], g["week"], g["gameId"]))
        players.append({
            "id": player["id"], "name": player["name"], "position": player["position"],
            "team": player["team"], "seasons": sorted(player["seasons"]), "games": games,
            **({"photo":player["photo"]} if player.get("photo") else {}),
        })
    all_seasons = sorted({season for p in players for season in p["seasons"]})
    newest = max(all_seasons) if all_seasons else 0
    # Favor recognizable offensive positions in the initial dropdown; search covers all.
    position_order = {"WR": 0, "QB": 1, "RB": 2, "TE": 3, "FB": 4}
    players.sort(key=lambda p: (
        -int(newest in p["seasons"]), position_order.get(p["position"], 9), p["name"].lower(), p["id"]
    ))
    return {"schemaVersion": 1, "status": "ready", "source": "nflverse stats_player week CSV", "seasons": all_seasons, "players": players}


def attach_model_validation(payload: dict, weights_path: Path | None = None) -> dict:
    """Keep the production score-model audit attached during each data refresh."""
    path = weights_path or ROOT / "scripts" / "nfl_weights.json"
    try:
        weights = json.loads(path.read_text())
        results = weights.get("validation")
        games = weights.get("games")
        if not isinstance(results, dict) or not isinstance(games, int) or games <= 0:
            raise ValueError("production model validation is incomplete")
        payload["modelValidation"] = {"games": games, "results": results}
    except (OSError, ValueError, TypeError) as exc:
        print(f"Model validation summary unavailable: {exc}", file=sys.stderr)
    return payload


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


def recent_usage_shares(players, season, week):
    """Calculate workload shares using each team's last four completed regular-season games."""
    totals, individuals = defaultdict(lambda: defaultdict(Counter)), defaultdict(lambda: defaultdict(Counter))
    for player in players:
        for g in player["games"]:
            if g["season"] != season or g["week"] >= week:
                continue
            team, number = normalize_team(g["team"]), g["week"]
            usage = {k:g.get("usage", {}).get(k, 0) for k in ("attempts", "carries", "targets")}
            totals[team][number].update(usage)
            individuals[(team, player["id"])][number].update(usage)
    shares = {}
    for (team, player), by_week in individuals.items():
        weeks = sorted(totals[team])[-4:]
        team_sum = sum((totals[team][w] for w in weeks), Counter())
        used = sum((by_week[w] for w in weeks), Counter())
        shares[(team,player)] = {k:used[k]/n for k,n in team_sum.items() if n}
    return shares


def add_offensive_snaps(payload, previous):
    base = "https://github.com/nflverse/nflverse-data/releases/download"
    def rows(path):
        with urllib.request.urlopen(f"{base}/{path}", timeout=45) as response:
            return list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig")))

    def key(player_id, game):
        return player_id, game["gameId"], normalize_team(game["team"])

    snaps = {key(p["id"], g): g["usage"]["offenseSnapRate"]
             for p in previous.get("players", []) for g in p["games"]
             if "offenseSnapRate" in g.get("usage", {})}
    try:
        ids = {r["pfr_id"]: r["gsis_id"] for r in rows("players/players.csv")
               if r["pfr_id"] and r["gsis_id"]}
        for season in payload["seasons"]:
            try:
                for r in rows(f"snap_counts/snap_counts_{season}.csv"):
                    rate = market_number(r["offense_pct"])
                    if r["pfr_player_id"] in ids and rate is not None and 0 <= rate <= 1:
                        snaps[ids[r["pfr_player_id"]], r["game_id"], normalize_team(r["team"])] = rate
            except (OSError, ValueError, KeyError) as exc:
                print(f"{season} snap counts unavailable: {exc}")
    except (OSError, ValueError, KeyError) as exc:
        print(f"Snap count player IDs unavailable: {exc}")
    for player in payload["players"]:
        for game in player["games"]:
            rate = snaps.get(key(player["id"], game))
            if rate is not None:
                game["usage"]["offenseSnapRate"] = rate


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
    attach_model_validation(payload)
    if not payload["players"]:
        print("ERROR: No searchable players in downloaded data; keeping old data.", file=sys.stderr)
        return 1
    schedule_text = None
    try:
        with urllib.request.urlopen("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", timeout=45) as response:
            schedule_text = response.read().decode("utf-8-sig")
            payload["schedule"] = schedule_rows(schedule_text, payload["seasons"])
            ids = {g["gameId"] for p in payload["players"] for g in p["games"]}
            payload["gameDates"] = {r["game_id"]: r["gameday"]
                                    for r in csv.DictReader(io.StringIO(schedule_text))
                                    if r.get("game_id") in ids and r.get("gameday")}
    except (OSError, ValueError) as exc:
        print(f"Schedule refresh unavailable: {exc}", file=sys.stderr)
        if OUTPUT.exists():
            previous = json.loads(OUTPUT.read_text())
            if isinstance(previous.get("schedule"), list):
                payload["schedule"] = previous["schedule"]
            if isinstance(previous.get("gameDates"), dict):
                payload["gameDates"] = previous["gameDates"]
    season = max(payload["seasons"])
    try:
        url = f"https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv"
        with urllib.request.urlopen(url, timeout=40) as response:
            reports = defaultdict(dict)
            for row in csv.DictReader(io.StringIO(response.read().decode("utf-8-sig"))):
                name = row.get("full_name") or row.get("athlete_display_name")
                status = row.get("report_status")
                if not status or status in ("NA", "None"):
                    status = row.get("practice_status")
                if not name or not status or status in ("NA", "None"):
                    continue
                key = (normalize_team(row.get("team")), str(row.get("week")))
                item = {"name":name, "status":status, "date":row.get("date_modified") or "",
                        "id":row.get("gsis_id"), "position":row.get("position"),
                        "gameStatus":row.get("report_status"), "practice":row.get("practice_status"),
                        "injury":row.get("report_primary_injury") or row.get("practice_primary_injury")}
                if item["date"] >= reports[key].get(name, {}).get("date", ""):
                    reports[key][name] = item
        usage_by_week = {}
        for game in payload.get("schedule", []):
            if game["season"] == season:
                game["injuries"] = {team:list(reports[(team, game["week"])].values())
                                    for team in (game["home"],game["away"])}
                for team, players in game["injuries"].items():
                    for item in players:
                        if (item["gameStatus"] or "").lower() != "out":
                            continue
                        week = int(game["week"])
                        if week not in usage_by_week:
                            usage_by_week[week] = recent_usage_shares(payload["players"], season, week)
                        shares = usage_by_week[week].get((team,item["id"]), {})
                        item["deduction"] = round(3*shares.get("attempts",0) + shares.get("carries",0)
                                                  + shares.get("targets",0), 2)
    except (OSError, ValueError) as exc:
        print(f"Injury reports unavailable: {exc}", file=sys.stderr)
    if schedule_text:
        from nfl_context import enrich
        finals = enrich(payload,schedule_text)
        record_path = OUTPUT.with_name("model-record.json")
        if record_path.exists():
            records=json.loads(record_path.read_text())
            for item in records:
                if item["id"] in finals: item["final"]=finals[item["id"]]
            record_path.write_text(json.dumps(records,separators=(",",":"))+"\n")
    add_offensive_snaps(payload, json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {})
    save_if_changed(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
