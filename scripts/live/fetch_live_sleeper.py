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
                    help="The season year (e.g., 2026)")
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


def format_record(team_data):
    ties = team_data.get("actual_ties", 0)
    rec = f"{team_data.get('actual_wins', 0)}-{team_data.get('actual_losses', 0)}"
    return f"{rec}-{ties}" if ties > 0 else rec


def get_playoff_matchup_type(r1, r2, round_num, playoff_rounds, winners_bracket, losers_bracket, playoff_roster_ids):
    pair = frozenset({r1, r2})
    for m in winners_bracket:
        if m.get("r") != round_num:
            continue
        t1, t2 = m.get("t1"), m.get("t2")
        if t1 and t2 and frozenset({t1, t2}) == pair:
            if m.get("p") == 1:
                return "CHAMPIONSHIP"
            t1_from = m.get("t1_from")
            t2_from = m.get("t2_from")
            is_consolation_placement = (
                m.get("p") in (3, 5)
                or (isinstance(t1_from, dict) and "l" in t1_from)
                or (isinstance(t2_from, dict) and "l" in t2_from)
            )
            if is_consolation_placement:
                return "PLAYOFF_CONSOLATION"
            if m.get("p") is None and round_num == playoff_rounds:
                return "CHAMPIONSHIP"
            return "PLAYOFF"

    for m in losers_bracket:
        if m.get("r") != round_num:
            continue
        t1, t2 = m.get("t1"), m.get("t2")
        if t1 and t2 and frozenset({t1, t2}) == pair:
            return "CONSOLATION"

    if r1 in playoff_roster_ids and r2 in playoff_roster_ids:
        return "CHAMPIONSHIP" if round_num == playoff_rounds else "PLAYOFF"
    return "CONSOLATION"


def is_playoff_bye(rid, round_num, winners_bracket, playoff_roster_ids):
    if any(b.get("r", 0) > round_num and rid in (b.get("t1"), b.get("t2")) for b in winners_bracket):
        return True
    return round_num == 1 and rid in playoff_roster_ids


def build_prev_rank_map(completed_weeks, reg_season_count, prev_matchups_raw, teams_data):
    if completed_weeks > reg_season_count:
        return {t["name"]: t["actual_rank"] for t in teams_data.values()}

    games = {}
    for m in prev_matchups_raw:
        mid = m.get("matchup_id")
        if mid is None:
            continue
        games.setdefault(mid, []).append(m)

    last_week_results = {}
    for m_list in games.values():
        if len(m_list) != 2:
            continue
        r1, p1 = m_list[0].get("roster_id"), m_list[0].get("points", 0.0)
        r2, p2 = m_list[1].get("roster_id"), m_list[1].get("points", 0.0)
        last_week_results[r1] = (p1, p2)
        last_week_results[r2] = (p2, p1)

    prev_standings_calc = []
    for t_id, t_data in teams_data.items():
        pts_for, pts_against = last_week_results.get(t_id, (0.0, 0.0))
        has_game = t_id in last_week_results
        won_last = has_game and pts_for > pts_against
        lost_last = has_game and pts_for < pts_against
        tied_last = has_game and pts_for == pts_against

        prev_w = max(0, t_data["actual_wins"] - (1 if won_last else 0))
        prev_l = max(0, t_data["actual_losses"] - (1 if lost_last else 0))
        prev_t = max(0, t_data["actual_ties"] - (1 if tied_last else 0))
        prev_pf = t_data["pf"] - pts_for

        total_prev_games = prev_w + prev_l + prev_t
        prev_win_pct = (prev_w + (prev_t * 0.5)) / total_prev_games if total_prev_games > 0 else 0.0

        prev_standings_calc.append({
            "name": t_data["name"],
            "prev_win_pct": prev_win_pct,
            "prev_pf": prev_pf
        })

    prev_standings_calc.sort(key=lambda x: (x["prev_win_pct"], x["prev_pf"]), reverse=True)
    return {t["name"]: rank for rank, t in enumerate(prev_standings_calc, start=1)}


def compile_live_stats():
    print(f"Fetching live season data for Sleeper {SPORT} League {LEAGUE_ID} ({YEAR})...")

    # 1. League Settings & Brackets
    league = get_sleeper_data(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}")
    if not league:
        print("❌ Error: Failed to fetch league data from Sleeper.")
        return

    settings = league.get("settings", {})
    playoff_week_start = settings.get("playoff_week_start", 15)
    reg_season_count = max(1, playoff_week_start - 1)
    playoff_team_count = settings.get("playoff_teams", 6)

    winners_bracket = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/winners_bracket") or []
    losers_bracket = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/losers_bracket") or []

    playoff_rounds = max((m.get("r", 1) for m in winners_bracket), default=3)
    total_weeks = reg_season_count + playoff_rounds

    # 2. Users (Managers)
    users = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/users") or []
    user_map = {}
    for u in users:
        uid = u.get("user_id")
        metadata = u.get("metadata") or {}
        team_name = metadata.get(
            "team_name", u.get("display_name", f"Team {uid}"))
        avatar = u.get("avatar")
        logo_url = f"https://sleepercdn.com/avatars/thumbs/{avatar}" if avatar else ""
        user_map[uid] = {"team_name": team_name, "logo_url": logo_url}

    # 3. Rosters (Current Standings & Records)
    rosters = get_sleeper_data(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/rosters") or []
    teams_data = {}
    raw_completed_weeks = 0

    for r in rosters:
        rid = r.get("roster_id")
        owner_id = r.get("owner_id")
        u_info = user_map.get(
            owner_id, {"team_name": f"Team {rid}", "logo_url": ""})

        r_settings = r.get("settings", {})
        wins = r_settings.get("wins", 0)
        losses = r_settings.get("losses", 0)
        ties = r_settings.get("ties", 0)

        raw_completed_weeks = max(raw_completed_weeks, wins + losses + ties)

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
            "actual_rank": 0,
            "recent_points": [],
            "streak": 0
        }

    # Rank the teams based on Sleeper tiebreakers (Wins -> Ties -> Points For)
    sorted_rosters = sorted(rosters, key=lambda x: (
        x.get("settings", {}).get("wins", 0),
        x.get("settings", {}).get("ties", 0),
        x.get("settings", {}).get("fpts", 0) +
        (x.get("settings", {}).get("fpts_decimal", 0) / 100)
    ), reverse=True)

    for rank, r in enumerate(sorted_rosters, start=1):
        teams_data[r["roster_id"]]["actual_rank"] = rank

    # Identify playoff roster IDs from winners_bracket, falling back to top seeds
    playoff_roster_ids = set()
    for m in winners_bracket:
        if isinstance(m.get("t1"), int):
            playoff_roster_ids.add(m["t1"])
        if isinstance(m.get("t2"), int):
            playoff_roster_ids.add(m["t2"])
    if not playoff_roster_ids:
        playoff_roster_ids = {
            rid for rid, t_data in teams_data.items()
            if t_data["actual_rank"] <= playoff_team_count
        }

    # Determine completed weeks, active week, and season-over status
    reg_completed_weeks = min(raw_completed_weeks, reg_season_count)

    completed_playoff_rounds = 0
    if reg_completed_weeks >= reg_season_count and winners_bracket:
        for rnd in range(1, playoff_rounds + 1):
            rnd_games = [m for m in winners_bracket if m.get("r") == rnd]
            if rnd_games and all(m.get("w") is not None for m in rnd_games):
                completed_playoff_rounds = rnd
            else:
                break

    champ_bracket_game = next(
        (m for m in winners_bracket if m.get("p") == 1), None)
    is_season_over = (
        league.get("status") == "complete"
        or (champ_bracket_game is not None and champ_bracket_game.get("w") is not None)
    )

    if is_season_over:
        completed_weeks = reg_season_count + (
            completed_playoff_rounds if completed_playoff_rounds > 0 else playoff_rounds
        )
        current_week = completed_weeks
    elif reg_completed_weeks >= reg_season_count:
        completed_weeks = reg_season_count + completed_playoff_rounds
        current_week = min(total_weeks, completed_weeks + 1)
    else:
        completed_weeks = reg_completed_weeks
        current_week = completed_weeks + 1

    print(
        f" - Completed Weeks: {completed_weeks} | Active Week: {current_week} | Reg Season Count: {reg_season_count} | Season Over: {is_season_over}")

    # 4. Regular Season Weekly Data (True Standings, Luck, Power Rankings)
    # Capped at reg_season_count so playoff byes and consolation weeks don't distort all-play records
    for wk in range(1, reg_completed_weeks + 1):
        matchups = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{wk}")
        if not matchups:
            continue

        games = {}
        week_scores = []
        for m in matchups:
            mid = m.get("matchup_id")
            if mid is None:
                continue
            games.setdefault(mid, []).append(m)
            if m.get("roster_id"):
                week_scores.append((m.get("roster_id"), m.get("points", 0.0)))

        for m_list in games.values():
            if len(m_list) == 2:
                r1, p1 = m_list[0].get("roster_id"), m_list[0].get("points", 0.0)
                r2, p2 = m_list[1].get("roster_id"), m_list[1].get("points", 0.0)

                if r1 in teams_data:
                    teams_data[r1]["pf"] += p1
                    teams_data[r1]["pa"] += p2
                    teams_data[r1]["recent_points"].append(p1)
                    if p1 > p2:
                        teams_data[r1]["streak"] = teams_data[r1]["streak"] + 1 if teams_data[r1]["streak"] > 0 else 1
                    elif p1 < p2:
                        teams_data[r1]["streak"] = teams_data[r1]["streak"] - 1 if teams_data[r1]["streak"] < 0 else -1
                    else:
                        teams_data[r1]["streak"] = 0

                if r2 in teams_data:
                    teams_data[r2]["pf"] += p2
                    teams_data[r2]["pa"] += p1
                    teams_data[r2]["recent_points"].append(p2)
                    if p2 > p1:
                        teams_data[r2]["streak"] = teams_data[r2]["streak"] + 1 if teams_data[r2]["streak"] > 0 else 1
                    elif p2 < p1:
                        teams_data[r2]["streak"] = teams_data[r2]["streak"] - 1 if teams_data[r2]["streak"] < 0 else -1
                    else:
                        teams_data[r2]["streak"] = 0

        # Calculate True Standings (All-Play)
        for r_id, pts in week_scores:
            if r_id not in teams_data:
                continue
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
    for data in teams_data.values():
        total_true = data["true_wins"] + data["true_losses"] + data["true_ties"]
        win_pct = data["true_wins"] / total_true if total_true > 0 else 0
        act_total = data["actual_wins"] + data["actual_losses"] + data["actual_ties"]
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

    # 5.5 Format Power Rankings
    power_rankings = []
    for data in teams_data.values():
        recent_games = data["recent_points"][-3:]
        recent_avg = sum(recent_games) / len(recent_games) if recent_games else 0
        season_avg = data["pf"] / reg_completed_weeks if reg_completed_weeks > 0 else 0

        # 60% Recent Form, 40% Season Form, +/- 2.5% per streak game
        base_power = (recent_avg * 0.6) + (season_avg * 0.4)
        streak_multiplier = 1.0 + (data["streak"] * 0.025)
        power_score = base_power * streak_multiplier

        power_rankings.append({
            "team": data["name"],
            "logo_url": data["logo_url"],
            "power_score": round(power_score, 2),
            "streak": data["streak"]
        })
    power_rankings.sort(key=lambda x: x["power_score"], reverse=True)

    # 6. Format Luck Quadrant
    luck_quadrant = [
        {
            "team": data["name"],
            "pf": round(data["pf"] / reg_completed_weeks, 2) if reg_completed_weeks > 0 else 0.0,
            "pa": round(data["pa"] / reg_completed_weeks, 2) if reg_completed_weeks > 0 else 0.0
        }
        for data in teams_data.values()
    ]

    # 7. Previous Matchups Center
    is_prev_final = (completed_weeks >= total_weeks and total_weeks > 0)
    is_final_week = (current_week >= total_weeks and total_weeks > 0)

    previous_matchups = []
    previous_week_median = 0.0
    heartbreak_threshold = 0.0

    if completed_weeks > 0:
        prev_matchups_data = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{completed_weeks}") or []

        prev_rank_map = build_prev_rank_map(
            completed_weeks, reg_season_count, prev_matchups_data, teams_data)

        games = {}
        paired_rosters = set()
        scores = []
        for m in prev_matchups_data:
            mid = m.get("matchup_id")
            if mid is None:
                continue
            games.setdefault(mid, []).append(m)

        for m_list in games.values():
            if len(m_list) == 2:
                r1, r2 = m_list[0].get("roster_id"), m_list[1].get("roster_id")
                if r1 not in teams_data or r2 not in teams_data:
                    continue
                paired_rosters.add(r1)
                paired_rosters.add(r2)
                p1, p2 = m_list[0].get("points", 0.0), m_list[1].get("points", 0.0)
                if p1 > 0:
                    scores.append(p1)
                if p2 > 0:
                    scores.append(p2)

                if completed_weeks <= reg_season_count:
                    prev_m_type = "REGULAR"
                else:
                    round_num = completed_weeks - reg_season_count
                    prev_m_type = get_playoff_matchup_type(
                        r1, r2, round_num, playoff_rounds, winners_bracket, losers_bracket, playoff_roster_ids)

                home_name = teams_data[r1]["name"]
                away_name = teams_data[r2]["name"]
                previous_matchups.append({
                    "home": home_name,
                    "home_score": p1,
                    "home_rank": prev_rank_map.get(home_name, 99),
                    "away": away_name,
                    "away_score": p2,
                    "away_rank": prev_rank_map.get(away_name, 99),
                    "matchup_type": prev_m_type
                })

        # Detect playoff byes (e.g. top seeds in round 1)
        if completed_weeks > reg_season_count:
            round_num = completed_weeks - reg_season_count
            for m in prev_matchups_data:
                rid = m.get("roster_id")
                if rid in teams_data and rid not in paired_rosters and is_playoff_bye(rid, round_num, winners_bracket, playoff_roster_ids):
                    t_name = teams_data[rid]["name"]
                    previous_matchups.append({
                        "home": t_name,
                        "home_score": m.get("points", 0.0),
                        "home_rank": prev_rank_map.get(t_name, 99),
                        "away": "BYE",
                        "away_score": 0.0,
                        "away_rank": 99,
                        "matchup_type": "PLAYOFF_BYE"
                    })

        if scores:
            previous_week_median = round(statistics.median(scores), 2)
            scores.sort(reverse=True)
            heartbreak_rank = len(teams_data) // 4
            if heartbreak_rank > 0 and len(scores) >= heartbreak_rank:
                heartbreak_threshold = scores[heartbreak_rank - 1]

    # 8. Current Matchups Slate
    current_matchups = []
    if not is_season_over:
        curr_matchups_data = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{current_week}") or []

        games = {}
        paired_rosters = set()
        for m in curr_matchups_data:
            mid = m.get("matchup_id")
            if mid is None:
                continue
            games.setdefault(mid, []).append(m)

        for m_list in games.values():
            if len(m_list) == 2:
                r1, r2 = m_list[0].get("roster_id"), m_list[1].get("roster_id")
                if r1 not in teams_data or r2 not in teams_data:
                    continue
                paired_rosters.add(r1)
                paired_rosters.add(r2)

                if current_week <= reg_season_count:
                    matchup_type = "REGULAR"
                else:
                    round_num = current_week - reg_season_count
                    matchup_type = get_playoff_matchup_type(
                        r1, r2, round_num, playoff_rounds, winners_bracket, losers_bracket, playoff_roster_ids)

                current_matchups.append({
                    "home": teams_data[r1]["name"],
                    "home_record": format_record(teams_data[r1]),
                    "away": teams_data[r2]["name"],
                    "away_record": format_record(teams_data[r2]),
                    "matchup_type": matchup_type
                })

        if current_week > reg_season_count:
            round_num = current_week - reg_season_count
            for m in curr_matchups_data:
                rid = m.get("roster_id")
                if rid in teams_data and rid not in paired_rosters and is_playoff_bye(rid, round_num, winners_bracket, playoff_roster_ids):
                    current_matchups.append({
                        "home": teams_data[rid]["name"],
                        "home_record": format_record(teams_data[rid]),
                        "away": "BYE",
                        "away_record": "-",
                        "matchup_type": "PLAYOFF_BYE"
                    })

    # 9. Remaining Strength of Schedule (SOS)
    remaining_sos = []
    team_remaining_opps = {rid: [] for rid in teams_data}

    for wk in range(current_week, reg_season_count + 1):
        wk_matchups = get_sleeper_data(
            f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{wk}")
        if not wk_matchups:
            continue

        wk_games = {}
        for m in wk_matchups:
            mid = m.get("matchup_id")
            if mid is None:
                continue
            wk_games.setdefault(mid, []).append(m)

        for m_list in wk_games.values():
            if len(m_list) == 2:
                r1, r2 = m_list[0].get("roster_id"), m_list[1].get("roster_id")
                if r1 in team_remaining_opps and r2 in team_remaining_opps:
                    team_remaining_opps[r1].append(r2)
                    team_remaining_opps[r2].append(r1)

    for rid, data in teams_data.items():
        opp_ids = team_remaining_opps.get(rid, [])
        if not opp_ids:
            continue

        opp_ppg_sum = 0.0
        valid_opps = 0
        for opp_id in opp_ids:
            if opp_id in teams_data:
                opp_data = teams_data[opp_id]
                opp_ppg = opp_data["pf"] / reg_completed_weeks if reg_completed_weeks > 0 else 0.0
                opp_ppg_sum += opp_ppg
                valid_opps += 1

        avg_opp_ppg = opp_ppg_sum / valid_opps if valid_opps > 0 else 0.0
        remaining_sos.append({
            "team": data["name"],
            "logo_url": data["logo_url"],
            "remaining_opponents": valid_opps,
            "sos_ppg": round(avg_opp_ppg, 2)
        })

    remaining_sos.sort(key=lambda x: x["sos_ppg"], reverse=True)

    # 10. Determine Champion if season is complete or championship game has concluded
    champion = None
    if is_season_over or is_prev_final:
        for m in previous_matchups:
            if m.get("matchup_type") == "CHAMPIONSHIP":
                h_score = m.get("home_score", 0)
                a_score = m.get("away_score", 0)
                if h_score > a_score:
                    champ_name, runner_up = m["home"], m["away"]
                    champ_score, runner_score = h_score, a_score
                elif a_score > h_score:
                    champ_name, runner_up = m["away"], m["home"]
                    champ_score, runner_score = a_score, h_score
                else:
                    champ_name = None

                if champ_name:
                    champ_logo = next(
                        (t["logo_url"] for t in true_standings if t["team"] == champ_name), "")
                    champ_rec = next(
                        (t["actual_record"] for t in true_standings if t["team"] == champ_name), "")
                    champion = {
                        "team": champ_name,
                        "logo_url": champ_logo,
                        "score": champ_score,
                        "opponent": runner_up,
                        "opponent_score": runner_score,
                        "record": champ_rec
                    }
                break

        if not champion and champ_bracket_game and champ_bracket_game.get("w") in teams_data:
            w_data = teams_data[champ_bracket_game["w"]]
            l_id = champ_bracket_game.get("l")
            l_name = teams_data[l_id]["name"] if l_id in teams_data else None
            champion = {
                "team": w_data["name"],
                "logo_url": w_data["logo_url"],
                "score": None,
                "opponent": l_name,
                "opponent_score": None,
                "record": format_record(w_data)
            }

        if not champion and is_season_over:
            for t in true_standings:
                if t.get("actual_rank") == 1:
                    champion = {
                        "team": t["team"],
                        "logo_url": t.get("logo_url", ""),
                        "score": None,
                        "opponent": None,
                        "opponent_score": None,
                        "record": t.get("actual_record", "")
                    }
                    break

    # Compile JSON payload
    live_data = {
        "year": YEAR,
        "week": current_week,
        "season_complete": is_season_over,
        "playoff_team_count": playoff_team_count,
        "champion": champion,
        "true_standings": true_standings,
        "power_rankings": power_rankings,
        "luck_quadrant": luck_quadrant,
        "previous_matchups": previous_matchups,
        "previous_week_median": previous_week_median,
        "heartbreak_threshold": heartbreak_threshold,
        "current_matchups": current_matchups,
        "remaining_sos": remaining_sos
    }

    filename = f"{SPORT.lower()}_current_season.json"
    with open(os.path.join(LIVE_DIR, filename), "w", encoding="utf-8") as f:
        json.dump(live_data, f, indent=4)

    print("Successfully generated live season data!")


if __name__ == "__main__":
    compile_live_stats()
