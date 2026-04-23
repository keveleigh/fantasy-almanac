import os
import json
from espn_api.baseball import League

os.makedirs("data/live", exist_ok=True)

# --- CONFIGURATION ---
LEAGUE_ID = int(os.environ.get("ESPN_LEAGUE_ID", 114502))
YEAR = int(os.environ.get("ESPN_YEAR", 2026))
SWID = os.environ.get("ESPN_SWID")
ESPN_S2 = os.environ.get("ESPN_S2")


def compile_live_stats():
    print(
        f"Fetching live season data for ESPN MLB League {LEAGUE_ID} ({YEAR})...")

    league = League(league_id=LEAGUE_ID, year=YEAR, swid=SWID, espn_s2=ESPN_S2)

    # ESPN API quirk: current_week often returns the scoring period (day) instead of the matchup week.
    # We calculate the exact completed weeks by checking the maximum games played in the standings!
    completed_weeks = max(
        [team.wins + team.losses + getattr(team, 'ties', 0) for team in league.teams])
    current_week = completed_weeks + 1

    print(
        f" - Completed Weeks: {completed_weeks} | Active Week: {current_week}")

    # Fetch official standings directly from the API to handle tiebreakers natively
    actual_standings = league.standings()
    actual_rank_map = {team.team_id: rank for rank, team in enumerate(actual_standings, start=1)}

    # Initialize tracking dictionaries
    teams_data = {
        team.team_id: {
            "name": team.team_name,
            "logo_url": getattr(team, 'logo_url', ''),
            "actual_wins": team.wins,
            "actual_losses": team.losses,
            "actual_ties": getattr(team, 'ties', 0),
            "actual_rank": actual_rank_map.get(team.team_id, 0),
            "true_wins": 0,
            "true_losses": 0,
            "true_ties": 0,
            "pf": 0.0,
            "pa": 0.0
        }
        for team in league.teams
    }

    # 1. Process all completed weeks for True Standings and Luck
    for week in range(1, completed_weeks + 1):
        box_scores = league.box_scores(week)

        # Gather all scores for the week to calculate "All-Play" record
        week_scores = []
        for matchup in box_scores:
            if matchup.home_team:
                week_scores.append(
                    (matchup.home_team.team_id, matchup.home_score))
            if matchup.away_team:
                week_scores.append(
                    (matchup.away_team.team_id, matchup.away_score))

        for matchup in box_scores:
            for is_home in [True, False]:
                team = matchup.home_team if is_home else matchup.away_team
                opponent = matchup.away_team if is_home else matchup.home_team

                if not team or not opponent:
                    continue

                score = matchup.home_score if is_home else matchup.away_score
                opp_score = matchup.away_score if is_home else matchup.home_score

                teams_data[team.team_id]["pf"] += score
                teams_data[team.team_id]["pa"] += opp_score

                # Compare against the rest of the league for True Standings
                for other_team_id, other_score in week_scores:
                    if other_team_id == team.team_id:
                        continue
                    if score > other_score:
                        teams_data[team.team_id]["true_wins"] += 1
                    elif score < other_score:
                        teams_data[team.team_id]["true_losses"] += 1
                    else:
                        teams_data[team.team_id]["true_ties"] += 1

    # 2. Format True Standings
    true_standings = []
    for team_id, data in teams_data.items():
        total_true_games = data["true_wins"] + \
            data["true_losses"] + data["true_ties"]
        win_pct = data["true_wins"] / \
            total_true_games if total_true_games > 0 else 0

        true_standings.append({
            "team": data["name"],
            "logo_url": data["logo_url"],
            "actual_rank": data["actual_rank"],
            "actual_record": f"{data['actual_wins']}-{data['actual_losses']}-{data['actual_ties']}",
            "true_record": f"{data['true_wins']}-{data['true_losses']}-{data['true_ties']}",
            "true_win_pct": round(win_pct, 3),
            "expected_wins": round(win_pct * (data["actual_wins"] + data["actual_losses"] + data["actual_ties"]), 1)
        })

    true_standings.sort(key=lambda x: x["true_win_pct"], reverse=True)

    # 3. Format Luck Quadrant
    luck_quadrant = [{"team": data["name"], "pf": round(
        data["pf"], 2), "pa": round(data["pa"], 2)} for data in teams_data.values()]

    # 4. Matchup Center (Last Week & This Week)
    previous_matchups = []
    if completed_weeks > 0:
        try:
            prev_boxes = league.box_scores(completed_weeks)
            for m in prev_boxes:
                if m.home_team and m.away_team:
                    previous_matchups.append({
                        "home": m.home_team.team_name,
                        "home_score": m.home_score,
                        "away": m.away_team.team_name,
                        "away_score": m.away_score
                    })
        except Exception:
            pass

    current_matchups = []
    try:
        curr_boxes = league.box_scores(current_week)
        for m in curr_boxes:
            if m.home_team and m.away_team:
                home_data = teams_data.get(m.home_team.team_id, {})
                away_data = teams_data.get(m.away_team.team_id, {})

                home_rec = f"{home_data.get('actual_wins', 0)}-{home_data.get('actual_losses', 0)}" + (
                    f"-{home_data.get('actual_ties')}" if home_data.get('actual_ties', 0) > 0 else "")
                away_rec = f"{away_data.get('actual_wins', 0)}-{away_data.get('actual_losses', 0)}" + (
                    f"-{away_data.get('actual_ties')}" if away_data.get('actual_ties', 0) > 0 else "")

                current_matchups.append({
                    "home": m.home_team.team_name,
                    "home_record": home_rec,
                    "away": m.away_team.team_name,
                    "away_record": away_rec
                })
    except Exception:
        pass

    # 5. Remaining Strength of Schedule (SOS)
    remaining_sos = []

    # ESPN API MLB Quirk: reg_season_count is often 0 or missing entirely in the settings object.
    reg_season_count = getattr(league.settings, 'reg_season_count', 0)
    if reg_season_count == 0:
        reg_season_count = 22  # Standard fallback for MLB regular seasons

    team_remaining_opps = {team.team_id: [] for team in league.teams}

    # First attempt: Try dynamically fetching upcoming box scores to safely ignore playoffs
    for wk in range(current_week, reg_season_count + 1):
        try:
            boxes = league.box_scores(wk)
            if not boxes:
                continue
            for m in boxes:
                m_type = getattr(m, 'matchup_type', 'REGULAR')
                if m_type and m_type.upper() in ['PLAYOFF', 'CONSOLATION']:
                    continue

                home_id = getattr(m.home_team, 'team_id',
                                  m.home_team) if m.home_team else 0
                away_id = getattr(m.away_team, 'team_id',
                                  m.away_team) if m.away_team else 0

                if home_id and away_id:
                    if home_id in team_remaining_opps:
                        team_remaining_opps[home_id].append(away_id)
                    if away_id in team_remaining_opps:
                        team_remaining_opps[away_id].append(home_id)
        except Exception:
            pass  # End of schedule or API error

    # Fallback attempt: Try using the built-in schedule array if box_scores failed
    for team in league.teams:
        if not team_remaining_opps[team.team_id] and hasattr(team, 'schedule'):
            for wk_idx in range(current_week - 1, min(reg_season_count, len(team.schedule))):
                opp = team.schedule[wk_idx]
                opp_id = getattr(opp, 'team_id', opp)
                if isinstance(opp_id, int) and opp_id != 0:
                    team_remaining_opps[team.team_id].append(opp_id)

    for team in league.teams:
        opp_ids = team_remaining_opps.get(team.team_id, [])
        if not opp_ids:
            continue

        opp_ppg_sum = 0
        valid_opps = 0
        for opp_id in opp_ids:
            if opp_id in teams_data:
                opp_data = teams_data[opp_id]
                opp_ppg = opp_data["pf"] / \
                    completed_weeks if completed_weeks > 0 else 0
                opp_ppg_sum += opp_ppg
                valid_opps += 1

        avg_opp_ppg = opp_ppg_sum / valid_opps if valid_opps > 0 else 0

        remaining_sos.append({
            "team": team.team_name,
            "logo_url": getattr(team, 'logo_url', ''),
            "remaining_opponents": valid_opps,
            "sos_ppg": round(avg_opp_ppg, 1)
        })

    remaining_sos.sort(key=lambda x: x["sos_ppg"], reverse=True)

    # Compile JSON payload
    live_data = {
        "week": current_week,
        "playoff_team_count": getattr(league.settings, 'playoff_team_count', -1),
        "true_standings": true_standings,
        "luck_quadrant": luck_quadrant,
        "previous_matchups": previous_matchups,
        "current_matchups": current_matchups,
        "remaining_sos": remaining_sos
    }

    with open("data/live/baseball_current_season.json", "w") as f:
        json.dump(live_data, f, indent=4)

    print("✅ Successfully generated live season data!")


if __name__ == "__main__":
    compile_live_stats()
