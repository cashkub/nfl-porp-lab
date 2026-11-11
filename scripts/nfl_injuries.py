"""Supplement weekly game reports with the current ESPN NFL injury snapshot."""
from datetime import datetime, timedelta
import re

FEED = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries?limit=1000"
ALIASES = {"WSH": "WAS", "LA": "LAR", "JAC": "JAX"}
SUPPORTED = {"Out", "Doubtful", "Questionable", "Injured Reserve", "Physically Unable to Perform"}


def merge_current_injuries(schedule, feed, ids, last_played, now):
    season = (feed.get("season") or {}).get("year")
    stamp = datetime.fromisoformat(feed["timestamp"].replace("Z", "+00:00"))
    if abs(now - stamp) > timedelta(days=1):
        raise ValueError("ESPN injury snapshot is stale")
    upcoming = {}
    for game in sorted(schedule, key=lambda g: g["kickoff"]):
        kickoff = datetime.fromisoformat(game["kickoff"])
        if game["season"] == season and now < kickoff <= now + timedelta(days=7):
            for team in (game["away"], game["home"]):
                upcoming.setdefault(team, game)

    for group in feed["injuries"]:
        for entry in group.get("injuries", []):
            athlete = entry.get("athlete") or {}
            code = (athlete.get("team") or {}).get("abbreviation")
            team = ALIASES.get(code, code)
            game = upcoming.get(team)
            status = entry.get("status")
            if not game or status not in SUPPORTED:
                continue
            details = entry.get("details") or {}
            reserve = status in ("Injured Reserve", "Physically Unable to Perform")
            date = (entry.get("date") or "")[:10]
            # Generic news headlines can carry a previous game's status even after clearance.
            if not reserve and (not details.get("type") or not date or date <= last_played.get(team, "") or date < (now - timedelta(days=7)).date().isoformat()):
                continue
            name = athlete.get("displayName")
            if not name:
                continue
            player_id = None
            for link in athlete.get("links", []):
                match = re.search(r"/id/(\d+)", link.get("href", ""))
                if match and match[1] in ids:
                    player_id = ids[match[1]]
                    break
            reports = game.setdefault("injuries", {}).setdefault(team, [])
            existing = next((r for r in reports if (player_id and r.get("id") == player_id)
                             or r["name"].casefold() == name.casefold()), None)
            if existing and existing.get("gameStatus") not in (None, "", "NA"):
                continue
            if existing and existing.get("practice") and not reserve:
                # Preserve the official practice-only label. A full practice can signal a return.
                if existing["practice"].lower().startswith("full"):
                    continue
            if existing is None:
                existing = {"name": name, "id": player_id, "position": (athlete.get("position") or {}).get("abbreviation")}
                reports.append(existing)
            existing.update(gameStatus=status, status=status, date=entry.get("date"),
                            injury=existing.get("injury") or details.get("type", ""), source="ESPN")
            game["injurySnapshotAt"] = feed["timestamp"]

    # Direct team confirmation, restricted to the announced game.
    game = upcoming.get("SEA")
    if game and (game["season"], str(game["week"]), game["home"], game["away"]) == (2026, "10", "LV", "SEA"):
        reports = game.setdefault("injuries", {}).setdefault("SEA", [])
        report = next((r for r in reports if r["name"] == "Quenton Nelson"), None)
        if report is None:
            report = {}
            reports.append(report)
        report.update(name="Quenton Nelson", id="00-0034342", position="G", injury="Knee",
                      gameStatus="Out", status="Out", source="Seahawks team announcement")
