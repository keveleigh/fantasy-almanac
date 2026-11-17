import os
import json
import argparse
import requests
import statistics

BASE_DIR = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
LIVE_DIR = os.path.join(BASE_DIR, "public", "data", "live")
os.makedirs(LIVE_DIR, exist_ok=True)

# --- CONFIGURATION ---
parser = argparse.ArgumentParser(
    description="Fetch live Sleeper Fantasy Football data.")
parser.add_argument('--year', type=int, required=True,
                    help="The season year (e.g., 2024)")
parser.add_argument('--league_id', type=str, required=True,
                    help="The Sleeper League ID")
args = parser.parse_args()

YEAR = args.year
LEAGUE_ID = args.league_id
SPORT = "NFL"


def get_sleeper_data(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    return None


def compile_live_stats():
    print(
        f"Fetching live season data for Sleeper {SPORT} League {LEAGUE_ID} ({YEAR})...")

    # 1. League Settings
    league = get_sleeper_data(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}")
    if not league:
        print("❌ Error: Failed to fetch league data from Sleeper.")
        return

    settings = league.get("settings", {})
    playoff_week_start = settings.get("playoff_week_start", 15)
    playoff_team_count = settings.get("playoff_teams", 6)

    # 2. Users (Managers)
    users = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/users")
    user_map = {}
    for u in users:
        uid = u.get("user_id")
        metadata = u.get("metadata", {})
        team_name = metadata.get(
            "team_name", u.get("display_name", f"Team {uid}"))
        avatar = u.get("avatar")
        logo_url = f"https://sleepercdn.com/avatars/thumbs/{avatar}" if avatar else ""
        user_map[uid] = {"team_name": team_name, "logo_url": logo_url}

    # 3. Rosters (Current Standings & Records)
    rosters = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/rosters")
    teams_data = {}
    completed_weeks = 0

    for r in rosters:
        rid = r.get("roster_id")
        owner_id = r.get("owner_id")
        u_info = user_map.get(
            owner_id, {"team_name": f"Team {rid}", "logo_url": ""})

        r_settings = r.get("settings", {})
        wins = r_settings.get("wins", 0)
        losses = r_settings.get("losses", 0)
        ties = r_settings.get("ties", 0)

        # Calculate exact completed weeks dynamically
        completed_weeks = max(completed_weeks, wins + losses + ties)

        teams_data[rid] = {
            "name": u_info["team_name"],
            "logo_url": u_info["logo_url"],
            "actual_wins": wins,
            "actual_losses": losses,
            "actual_ties": ties,
            "pf": 0.0,
            "pa": 0.0,
            "true_wins": 0,
            "true_losses": 0,
            "true_ties": 0,
            "actual_rank": 0
        }

    current_week = completed_weeks + 1
    print(
        f" - Completed Weeks: {completed_weeks} | Active Week: {current_week}")

    # Rank the teams based on Sleeper tiebreakers (Wins -> Ties -> Points For)
    sorted_rosters = sorted(rosters, key=lambda x: (
        x.get("settings", {}).get("wins", 0),
        x.get("settings", {}).get("ties", 0),
        x.get("settings", {}).get("fpts", 0) +
        (x.get("settings", {}).get("fpts_decimal", 0) / 100)
    ), reverse=True)

    for rank, r in enumerate(sorted_rosters, start=1):
        teams_data[r["roster_id"]]["actual_rank"] = rank

    # 4. Weekly Data (True Standings, Luck, Matchups)
    for wk in range(1, completed_weeks + 1):
        matchups = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{wk}")
        if not matchups:
            continue

        games = {}
        week_scores = []
        for m in matchups:
            mid = m.get("matchup_id")
            if not mid:
                continue
            if mid not in games:
                games[mid] = []
            games[mid].append(m)
            if m.get("roster_id"):
                week_scores.append((m.get("roster_id"), m.get("points", 0.0)))

        for mid, m_list in games.items():
            if len(m_list) == 2:
                r1, p1 = m_list[0].get(
                    "roster_id"), m_list[0].get("points", 0.0)
                r2, p2 = m_list[1].get(
                    "roster_id"), m_list[1].get("points", 0.0)

                if r1 in teams_data:
                    teams_data[r1]["pf"] += p1
                    teams_data[r1]["pa"] += p2
                if r2 in teams_data:
                    teams_data[r2]["pf"] += p2
                    teams_data[r2]["pa"] += p1

        # Calculate True Standings (All-Play)
        for r_id, pts in week_scores:
            for o_id, o_pts in week_scores:
                if r_id == o_id:
                    continue
                if pts > o_pts:
                    teams_data[r_id]["true_wins"] += 1
                elif pts < o_pts:
                    teams_data[r_id]["true_losses"] += 1
                else:
                    teams_data[r_id]["true_ties"] += 1

    # 5. Format True Standings
    true_standings = []
    for r_id, data in teams_data.items():
        total_true = data["true_wins"] + \
            data["true_losses"] + data["true_ties"]
        win_pct = data["true_wins"] / total_true if total_true > 0 else 0
        act_total = data["actual_wins"] + \
            data["actual_losses"] + data["actual_ties"]
        exp_wins = win_pct * act_total

        true_standings.append({
            "team": data["name"],
            "logo_url": data["logo_url"],
            "actual_rank": data["actual_rank"],
            "actual_record": f"{data['actual_wins']}-{data['actual_losses']}-{data['actual_ties']}",
            "true_record": f"{data['true_wins']}-{data['true_losses']}-{data['true_ties']}",
            "true_win_pct": round(win_pct, 3),
            "expected_wins": round(exp_wins, 2),
            "pf": round(data["pf"], 2)
        })
    true_standings.sort(key=lambda x: (
        x["true_win_pct"], x["pf"]), reverse=True)

    # 6. Format Luck Quadrant
    luck_quadrant = [{"team": data["name"],
                      "pf": round(data["pf"] / completed_weeks, 2) if completed_weeks > 0 else 0.0,
                      "pa": round(data["pa"] / completed_weeks, 2) if completed_weeks > 0 else 0.0}
                     for data in teams_data.values()]

    # 7. Previous Matchups Center
    previous_matchups = []
    previous_week_median = 0.0
    heartbreak_threshold = 0.0

    if completed_weeks > 0:
        prev_matchups_data = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{completed_weeks}")
        games = {}
        scores = []
        for m in prev_matchups_data:
            mid = m.get("matchup_id")
            if not mid:
                continue
            if mid not in games:
                games[mid] = []
            games[mid].append(m)
            scores.append(m.get("points", 0.0))

        if scores:
            previous_week_median = round(statistics.median(scores), 2)
            scores.sort(reverse=True)
            heartbreak_rank = len(scores) // 4
            if len(scores) > heartbreak_rank:
                heartbreak_threshold = scores[heartbreak_rank - 1]

        for mid, m_list in games.items():
            if len(m_list) == 2:
                r1, r2 = m_list[0].get("roster_id"), m_list[1].get("roster_id")
                previous_matchups.append({
                    "home": teams_data[r1]["name"],
                    "home_score": m_list[0].get("points", 0.0),
                    "home_rank": teams_data[r1]["actual_rank"],
                    "away": teams_data[r2]["name"],
                    "away_score": m_list[1].get("points", 0.0),
                    "away_rank": teams_data[r2]["actual_rank"]
                })

    # 8. Current Matchups Slate
    current_matchups = []
    if current_week < playoff_week_start:
        curr_matchups_data = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{current_week}")
        games = {}
        for m in curr_matchups_data:
            mid = m.get("matchup_id")
            if not mid:
                continue
            if mid not in games:
                games[mid] = []
            games[mid].append(m)

        def fmt_rec(d):
            return f"{d['actual_wins']}-{d['actual_losses']}" + (f"-{d['actual_ties']}" if d['actual_ties'] > 0 else "")

        for mid, m_list in games.items():
            if len(m_list) == 2:
                r1, r2 = m_list[0].get("roster_id"), m_list[1].get("roster_id")
                current_matchups.append({
                    "home": teams_data[r1]["name"],
                    "home_record": fmt_rec(teams_data[r1]),
                    "away": teams_data[r2]["name"],
                    "away_record": fmt_rec(teams_data[r2])
                })

    # 9. Remaining Strength of Schedule
    remaining_sos = []
    # (Sleeper doesn't natively expose the entire forward schedule easily without iterating through matchups,
    #  so we safely default to empty to let the UI hide it dynamically if it's too complex).

    # Compile JSON payload
    live_data = {
        "week": current_week,
        "playoff_team_count": playoff_team_count,
        "true_standings": true_standings,
        "luck_quadrant": luck_quadrant,
        "previous_matchups": previous_matchups,
        "previous_week_median": previous_week_median,
        "heartbreak_threshold": heartbreak_threshold,
        "current_matchups": current_matchups,
        "remaining_sos": remaining_sos
    }

    filename = f"{SPORT.lower()}_current_season.json"
    with open(os.path.join(LIVE_DIR, filename), "w") as f:
        json.dump(live_data, f, indent=4)

    print("✅ Successfully generated live season data!")


if __name__ == "__main__":
    compile_live_stats()
