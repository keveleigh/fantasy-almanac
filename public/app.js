let globalH2HData = [];
let echartInstance = null;
let allManagers = [];
let globalStatsData = [];
let radarInstance = null;
let globalLeagueSuperlatives = {};

const sportIcons = { NFL: "🏈", MLB: "⚾", NBA: "🏀", NHL: "🏒" };
const platformIcons = {
  ESPN: `<img src="https://www.google.com/s2/favicons?domain=espn.com&sz=32" alt="ESPN" title="ESPN" class="platform-icon">`,
  Sleeper: `<img src="https://www.google.com/s2/favicons?domain=sleeper.com&sz=32" alt="Sleeper" title="Sleeper" class="platform-icon">`,
  Fleaflicker: `<img src="https://www.google.com/s2/favicons?domain=fleaflicker.com&sz=32" alt="Fleaflicker" title="Fleaflicker" class="platform-icon">`,
  Manual: `<span title="Manual" class="platform-icon" style="font-size: 14px; line-height: 1;">📝</span>`,
};
const getPlatformIcon = (platform) => platformIcons[platform] || platform;
const sportOrder = ["MLB", "NFL", "NBA"];

// --- Theme Toggle ---
document.body.classList.add("preload-theme");

const themeToggle = document.getElementById("theme-toggle");
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function setTheme(isDark) {
  if (isDark) {
    document.body.classList.add("dark-theme");
    themeToggle.innerText = "☀️";
    localStorage.setItem("theme", "dark");
  } else {
    document.body.classList.remove("dark-theme");
    themeToggle.innerText = "🌙";
    localStorage.setItem("theme", "light");
  }

  // Refresh charts if they are initialized
  if (echartInstance)
    updateHeatmap(document.getElementById("sport-filter").value);
  if (radarInstance) updateRadar();
}

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || (!savedTheme && prefersDarkScheme.matches)) {
  setTheme(true);
}

// Remove the preload class after the initial theme is set to re-enable transitions
setTimeout(() => {
  document.body.classList.remove("preload-theme");
}, 100);

themeToggle.addEventListener("click", () =>
  setTheme(!document.body.classList.contains("dark-theme")),
);

async function loadDashboard() {
  try {
    const [recordsRes, h2hRes] = await Promise.all([
      fetch("data/compiled/records.json"),
      fetch("data/compiled/head_to_head.json"),
    ]);
    const recordsData = await recordsRes.json();
    globalH2HData = await h2hRes.json();
    globalStatsData = recordsData.manager_lifetime_stats; // Save it globally!
    globalLeagueSuperlatives = recordsData.superlatives || {};

    initSuperlativesFilter();
    renderSuperlatives(globalLeagueSuperlatives);
    initHallOfFame();
    renderChampionshipHistory();
    // initHeatmap();
    initRadar();
  } catch (error) {
    console.error("Error loading JSON data:", error);
    document.getElementById("superlatives-container").innerHTML =
      `<p style="color:red;">Error loading data. Make sure records.json exists and your local server is running.</p>`;
  }
}

// --- Render Superlatives (The Trophy Cabinet) ---
function renderSuperlatives(superlativesData) {
  const container = document.getElementById("superlatives-container");
  container.innerHTML = ""; // Clear loading message
  if (!superlativesData) return;

  const sortedSports = Object.keys(superlativesData).sort((a, b) => {
    const idxA = sportOrder.indexOf(a);
    const idxB = sportOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  for (const sport of sortedSports) {
    const superlative = superlativesData[sport];
    // Skip if no actual data was parsed for this sport yet
    if (!superlative.highest_score || superlative.highest_score.score === 0)
      continue;

    // Fallback formatting for individual manager superlatives (in case they lack a record of that type)
    const lowestPpgVal =
      superlative.lowest_ppg.ppgf >= 99999
        ? "N/A"
        : `${superlative.lowest_ppg.ppgf.toFixed(1)} PF Avg`;
    const lowestPpgText =
      superlative.lowest_ppg.ppgf >= 99999
        ? "No seasons recorded."
        : `Lowest scoring offense | ${superlative.lowest_ppg.year} | ${getPlatformIcon(superlative.lowest_ppg.platform)}`;
    const lowestPpgaVal =
      superlative.lowest_ppga.ppga >= 99999
        ? "N/A"
        : `${superlative.lowest_ppga.ppga.toFixed(1)} PA Avg`;
    const lowestPpgaText =
      superlative.lowest_ppga.ppga >= 99999
        ? "No seasons recorded."
        : `Easiest schedule | ${superlative.lowest_ppga.year} | ${getPlatformIcon(superlative.lowest_ppga.platform)}`;
    const lowestWinVal =
      superlative.lowest_winning_score.score >= 99999
        ? "N/A"
        : `${superlative.lowest_winning_score.score.toLocaleString()} pts`;
    const lowestWinText =
      superlative.lowest_winning_score.score >= 99999
        ? "No wins recorded."
        : `Defeated ${superlative.lowest_winning_score.opponent} (${superlative.lowest_winning_score.score} to ${superlative.lowest_winning_score.opp_score})<br>Week ${superlative.lowest_winning_score.period}, ${superlative.lowest_winning_score.year} | ${getPlatformIcon(superlative.lowest_winning_score.platform)}`;
    const highestLossVal =
      superlative.highest_losing_score.score === 0
        ? "N/A"
        : `${superlative.highest_losing_score.score.toLocaleString()} pts`;
    const highestLossText =
      superlative.highest_losing_score.score === 0
        ? "No losses recorded."
        : `Lost to ${superlative.highest_losing_score.opponent} (${superlative.highest_losing_score.score} to ${superlative.highest_losing_score.opp_score})<br>Week ${superlative.highest_losing_score.period}, ${superlative.highest_losing_score.year} | ${getPlatformIcon(superlative.highest_losing_score.platform)}`;
    const largestMarginVal =
      superlative.largest_victory_margin.margin === 0
        ? "N/A"
        : `+${superlative.largest_victory_margin.margin.toLocaleString()} pts`;
    const largestMarginText =
      superlative.largest_victory_margin.margin === 0
        ? "No wins recorded."
        : `Destroyed ${superlative.largest_victory_margin.loser} (${superlative.largest_victory_margin.winning_score} to ${superlative.largest_victory_margin.losing_score})<br>Week ${superlative.largest_victory_margin.period}, ${superlative.largest_victory_margin.year} | ${getPlatformIcon(superlative.largest_victory_margin.platform)}`;
    const smallestMarginVal =
      superlative.smallest_victory_margin.margin >= 99999
        ? "N/A"
        : `+${superlative.smallest_victory_margin.margin.toLocaleString()} pts`;
    const smallestMarginText =
      superlative.smallest_victory_margin.margin >= 99999
        ? "No wins recorded."
        : `Survived ${superlative.smallest_victory_margin.loser} (${superlative.smallest_victory_margin.winning_score} to ${superlative.smallest_victory_margin.losing_score})<br>Week ${superlative.smallest_victory_margin.period}, ${superlative.smallest_victory_margin.year} | ${getPlatformIcon(superlative.smallest_victory_margin.platform)}`;
    const lowestPlayoffPpgVal =
      superlative.lowest_playoff_ppg.ppgf >= 99999
        ? "N/A"
        : `${superlative.lowest_playoff_ppg.ppgf.toFixed(1)} PF Avg`;
    const lowestPlayoffPpgText =
      superlative.lowest_playoff_ppg.ppgf >= 99999
        ? "Never made the playoffs."
        : `Lowest scoring offense to make the playoffs | ${superlative.lowest_playoff_ppg.year} | ${getPlatformIcon(superlative.lowest_playoff_ppg.platform)}`;
    const highestMissPlayoffsPpgVal =
      superlative.highest_miss_playoffs_ppg.ppgf === 0
        ? "N/A"
        : `${superlative.highest_miss_playoffs_ppg.ppgf.toFixed(1)} PF Avg`;
    const highestMissPlayoffsPpgText =
      superlative.highest_miss_playoffs_ppg.ppgf === 0
        ? "Never missed the playoffs."
        : `Highest scoring offense to miss the playoffs | ${superlative.highest_miss_playoffs_ppg.year} | ${getPlatformIcon(superlative.highest_miss_playoffs_ppg.platform)}`;

    const mostWinsUnderMedianVal =
      superlative.most_wins_under_median.wins === 0
        ? "N/A"
        : `${superlative.most_wins_under_median.wins} Wins`;
    const mostLossesOverMedianVal =
      superlative.most_losses_over_median.losses === 0
        ? "N/A"
        : `${superlative.most_losses_over_median.losses} Losses`;

    const icon = sportIcons[sport] || "🏆";
    const espnNote =
      sport === "NBA"
        ? "<span style='font-size: 0.85rem; font-weight: normal; color: var(--text-muted);'>(Not including ESPN years)</span>"
        : "";

    const sectionHtml = `
            <div class="sport-section">
                <div class="sport-header">${icon} ${sport} Records (Regular Season) ${espnNote}</div>
                <div class="scores-grid">

                    <div class="score-card highest-score">
                        <h3>🌋 All-Time High</h3>
                        <p class="metric">${superlative.highest_score.score.toLocaleString()} pts</p>
                        <p class="manager">${superlative.highest_score.manager}</p>
                        <p class="meta">Against ${superlative.highest_score.opponent} (${superlative.highest_score.score} to ${superlative.highest_score.opp_score})<br>Week ${superlative.highest_score.period}, ${superlative.highest_score.year} | ${getPlatformIcon(superlative.highest_score.platform)}</p>
                    </div>

                    <div class="score-card lowest-score">
                        <h3>🪫 All-Time Low</h3>
                        <p class="metric">${superlative.lowest_score.score.toLocaleString()} pts</p>
                        <p class="manager">${superlative.lowest_score.manager}</p>
                        <p class="meta">Against ${superlative.lowest_score.opponent} (${superlative.lowest_score.score} to ${superlative.lowest_score.opp_score})<br>Week ${superlative.lowest_score.period}, ${superlative.lowest_score.year} | ${getPlatformIcon(superlative.lowest_score.platform)}</p>
                    </div>

                    <div class="score-card longest-win-streak">
                        <h3 title="Most consecutive regular season wins">🔥 On Fire</h3>
                        <p class="metric">${superlative.longest_win_streak.count} Straight Wins</p>
                        <p class="manager">${superlative.longest_win_streak.manager}</p>
                        <p class="meta">Regular Season<br>Wk ${superlative.longest_win_streak.start_p}, ${superlative.longest_win_streak.start_y} to Wk ${superlative.longest_win_streak.end_p}, ${superlative.longest_win_streak.end_y}</p>
                    </div>

                    <div class="score-card longest-loss-streak">
                        <h3 title="Most consecutive regular season losses">🧊 Ice Cold</h3>
                        <p class="metric">${superlative.longest_loss_streak.count} Straight Losses</p>
                        <p class="manager">${superlative.longest_loss_streak.manager}</p>
                        <p class="meta">Regular Season<br>Wk ${superlative.longest_loss_streak.start_p}, ${superlative.longest_loss_streak.start_y} to Wk ${superlative.longest_loss_streak.end_p}, ${superlative.longest_loss_streak.end_y}</p>
                    </div>

                    <div class="score-card highest-ppg">
                        <h3 title="Highest Points Per Game For in a single season">🚂 The Juggernaut</h3>
                        <p class="metric">${superlative.highest_ppg.ppgf.toFixed(1)} PF Avg</p>
                        <p class="manager">${superlative.highest_ppg.manager}</p>
                        <p class="meta">Highest scoring offense | ${superlative.highest_ppg.year} | ${getPlatformIcon(superlative.highest_ppg.platform)}</p>
                    </div>

                    <div class="score-card lowest-ppg">
                        <h3 title="Lowest Points Per Game For in a single season">📉 Rough Season</h3>
                        <p class="metric">${lowestPpgVal}</p>
                        <p class="manager">${superlative.lowest_ppg.manager}</p>
                        <p class="meta">${lowestPpgText}</p>
                    </div>

                    <div class="score-card highest-ppga">
                        <h3 title="Highest Points Per Game Against in a single season">🌩️ Schedule Victim</h3>
                        <p class="metric">${superlative.highest_ppga.ppga.toFixed(1)} PA Avg</p>
                        <p class="manager">${superlative.highest_ppga.manager}</p>
                        <p class="meta">Hardest schedule | ${superlative.highest_ppga.year} | ${getPlatformIcon(superlative.highest_ppga.platform)}</p>
                    </div>

                    <div class="score-card lowest-ppga">
                        <h3 title="Lowest Points Per Game Against in a single season">🐴 Golden Horseshoe</h3>
                        <p class="metric">${lowestPpgaVal}</p>
                        <p class="manager">${superlative.lowest_ppga.manager}</p>
                        <p class="meta">${lowestPpgaText}</p>
                    </div>

                    <div class="score-card highest-losing-score">
                        <h3 title="Highest score in a loss">💔 The Heartbreak</h3>
                        <p class="metric">${highestLossVal}</p>
                        <p class="manager">${superlative.highest_losing_score.manager}</p>
                        <p class="meta">${highestLossText}</p>
                    </div>

                    <div class="score-card lowest-winning-score">
                        <h3 title="Lowest score in a win">🦝 The Heist</h3>
                        <p class="metric">${lowestWinVal}</p>
                        <p class="manager">${superlative.lowest_winning_score.manager}</p>
                        <p class="meta">${lowestWinText}</p>
                    </div>

                    <div class="score-card largest-victory-margin">
                        <h3 title="Largest margin of victory">🥊 Biggest Blowout</h3>
                        <p class="metric">${largestMarginVal}</p>
                        <p class="manager">${superlative.largest_victory_margin.winner}</p>
                        <p class="meta">${largestMarginText}</p>
                    </div>

                    <div class="score-card smallest-victory-margin">
                        <h3 title="Smallest margin of victory">🤏 Close One!</h3>
                        <p class="metric">${smallestMarginVal}</p>
                        <p class="manager">${superlative.smallest_victory_margin.winner}</p>
                        <p class="meta">${smallestMarginText}</p>
                    </div>

                    <div class="score-card most-wins-under-median">
                        <h3 title="Most wins while scoring in the bottom half of the league">🍀 The Luck Box</h3>
                        <p class="metric">${mostWinsUnderMedianVal}</p>
                        <p class="manager">${superlative.most_wins_under_median.manager}</p>
                        <p class="meta">Career wins despite scoring<br>below the weekly median.</p>
                    </div>

                    <div class="score-card most-losses-over-median">
                        <h3 title="Most career losses despite scoring in the top half of the league">🌧️ The Unlucky Box</h3>
                        <p class="metric">${mostLossesOverMedianVal}</p>
                        <p class="manager">${superlative.most_losses_over_median.manager}</p>
                        <p class="meta">Career losses despite scoring<br>above the weekly median.</p>
                    </div>

                    <div class="score-card lowest-playoff-ppg">
                        <h3 title="Lowest Points Per Game For while still making the playoffs">🤞 Lucky Breaks</h3>
                        <p class="metric">${lowestPlayoffPpgVal}</p>
                        <p class="manager">${superlative.lowest_playoff_ppg.manager}</p>
                        <p class="meta">${lowestPlayoffPpgText}</p>
                    </div>

                    <div class="score-card highest-miss-playoffs-ppg">
                        <h3 title="Highest Points Per Game For without making the playoffs">🏹 Glass Cannon</h3>
                        <p class="metric">${highestMissPlayoffsPpgVal}</p>
                        <p class="manager">${superlative.highest_miss_playoffs_ppg.manager}</p>
                        <p class="meta">${highestMissPlayoffsPpgText}</p>
                    </div>

                </div>
            </div>
        `;
    container.innerHTML += sectionHtml;
  }
}

// --- Render Hall of Fame Table ---
function renderHallOfFame(selectedSport = "All") {
  const tbody = document.querySelector("#standings-table tbody");
  tbody.innerHTML = "";

  // 1. Map out the chronological timeline of seasons to detect streaks and stale trophies
  const sportYears = {};
  globalStatsData.forEach((stat) => {
    for (const [sp, data] of Object.entries(stat.by_sport)) {
      if (data.championships && data.championships.length > 0) {
        if (!sportYears[sp]) sportYears[sp] = new Set();
        data.championships.forEach((y) => sportYears[sp].add(y));
      }
    }
  });

  const latestYears = {};
  const sportChamps = {};
  const champStreaks = {};
  let globalMaxYear = 0;

  for (const sp in sportYears) {
    sportYears[sp] = Array.from(sportYears[sp]).sort((a, b) => b - a);
    const maxYear = sportYears[sp][0];
    latestYears[sp] = maxYear;
    if (maxYear > globalMaxYear) globalMaxYear = maxYear;
    sportChamps[sp] = [];
    champStreaks[sp] = {};
  }

  globalStatsData.forEach((stat) => {
    for (const sp in sportYears) {
      const data = stat.by_sport[sp];
      if (
        data &&
        data.championships &&
        data.championships.includes(latestYears[sp])
      ) {
        sportChamps[sp].push(stat.manager);

        let streak = 1;
        for (let i = 1; i < sportYears[sp].length; i++) {
          if (data.championships.includes(sportYears[sp][i])) streak++;
          else break;
        }
        champStreaks[sp][stat.manager] = streak;
      }
    }
  });

  // 2. Re-sort data
  const sortedData = [...globalStatsData].sort((a, b) => {
    const aData =
      selectedSport === "All"
        ? a.overall
        : a.by_sport[selectedSport] || { championships: [], reg_wins: 0 };
    const bData =
      selectedSport === "All"
        ? b.overall
        : b.by_sport[selectedSport] || { championships: [], reg_wins: 0 };
    if (bData.championships.length !== aData.championships.length)
      return bData.championships.length - aData.championships.length;
    return bData.reg_wins - aData.reg_wins;
  });

  // 3. Render Table
  sortedData.forEach((stat) => {
    const activeData =
      selectedSport === "All" ? stat.overall : stat.by_sport[selectedSport];
    if (!activeData) return;

    const tr = document.createElement("tr");

    const renderSports =
      selectedSport === "All"
        ? [...new Set(stat.sports_played)].sort((a, b) => {
            const idxA = sportOrder.indexOf(a);
            const idxB = sportOrder.indexOf(b);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
          })
        : [selectedSport];

    let sportsHtmlLines = [];
    let champsHtmlLines = [];

    renderSports.forEach((sp) => {
      sportsHtmlLines.push(
        `<div style="height: 28px; display: flex; align-items: center; justify-content: flex-end;" title="${sp}">${sportIcons[sp] || sp}</div>`,
      );

      const data = stat.by_sport[sp];
      let champHtmlForSport = '<span style="color:var(--divider)">-</span>';

      if (data && data.championships && data.championships.length > 0) {
        const uniqueYears = [...new Set(data.championships)].sort(
          (a, b) => b - a,
        );
        const yearsStr = uniqueYears.join(", ");
        champHtmlForSport = `<span title="Won in: ${yearsStr}" style="cursor:help; letter-spacing: 2px;">${"🏆".repeat(uniqueYears.length)}</span>`;
      }
      champsHtmlLines.push(
        `<div style="height: 28px; display: flex; align-items: center;">${champHtmlForSport}</div>`,
      );
    });

    const sportsStr = sportsHtmlLines.join("");
    const champHtml = champsHtmlLines.join("");

    // Reigning Champ Badge Logic (Streaks & Stale Tracking)
    let reigningText = "";
    const reigningSports =
      selectedSport !== "All"
        ? sportChamps[selectedSport] &&
          sportChamps[selectedSport].includes(stat.manager)
          ? [selectedSport]
          : []
        : Object.keys(sportChamps).filter((sp) =>
            sportChamps[sp].includes(stat.manager),
          );

    const activeReigningSports = reigningSports.filter(
      (sp) => globalMaxYear - latestYears[sp] < 2,
    );

    if (activeReigningSports.length > 0) {
      const badgesHtml = activeReigningSports
        .map((sp) => {
          const streak = champStreaks[sp][stat.manager];

          let classes = "reigning-badge";
          if (streak > 1) classes += " streak";

          let badgeTitle = `${latestYears[sp]} ${sp} Champion`;
          let badgeLabel = ` Champion`;

          if (streak > 1) badgeLabel = `${streak}-Peat Champion`;

          let iconStr = sportIcons[sp] || sp;

          return `<span class="${classes}" title="${badgeTitle}">${iconStr} ${badgeLabel}</span>`;
        })
        .join("");
      reigningText = badgesHtml;
    }

    if (selectedSport === "All") {
      const yearSports = {};
      for (const [sp, data] of Object.entries(stat.by_sport)) {
        (data.championships || []).forEach((y) => {
          if (!yearSports[y]) yearSports[y] = [];
          yearSports[y].push(sp);
        });
      }
      const undisputedYears = Object.keys(yearSports)
        .filter((y) => yearSports[y].length > 1)
        .sort((a, b) => b - a);
      undisputedYears.forEach((y) => {
        const emojis = yearSports[y].map((sp) => sportIcons[sp] || sp).join("");
        const count = yearSports[y].length;
        const crownName =
          count === 2
            ? "Dual-Crown"
            : count === 3
              ? "Triple-Crown"
              : count === 4
                ? "Grand Slam"
                : "Multi-Crown";
        reigningText += `<span class="reigning-badge undisputed" title="Won ${yearSports[y].join(", ")} in ${y}">${emojis} ${crownName} ('${String(y).slice(-2)})</span>`;
      });
    }

    // Historical Streaks (2-Peats, 3-Peats that are no longer active)
    const sportsToEvaluate =
      selectedSport === "All" ? Object.keys(stat.by_sport) : [selectedSport];
    sportsToEvaluate.forEach((sp) => {
      const data = stat.by_sport[sp];
      if (!data || !data.championships || data.championships.length < 2) return;

      const champs = data.championships;
      const timeline = [...sportYears[sp]].reverse(); // Chronological timeline (oldest to newest)

      let currentStreak = 0;
      let streakYears = [];

      const evaluateStreak = () => {
        if (currentStreak >= 2 && !streakYears.includes(latestYears[sp])) {
          const iconStr = sportIcons[sp] || sp;
          const yearLabels = streakYears
            .map((y) => `'${String(y).slice(-2)}`)
            .join(", ");
          reigningText += `<span class="reigning-badge historical" title="Won consecutive championships in: ${streakYears.join(", ")}">${iconStr} ${currentStreak}-Peat (${yearLabels})</span>`;
        }
        currentStreak = 0;
        streakYears = [];
      };

      timeline.forEach((year) => {
        if (champs.includes(year)) {
          currentStreak++;
          streakYears.push(year);
        } else {
          evaluateStreak();
        }
      });
      evaluateStreak();
    });

    const regStr = `${activeData.reg_wins}-${activeData.reg_losses}${activeData.reg_ties > 0 ? "-" + activeData.reg_ties : ""}`;
    const postStr = `${activeData.post_wins}-${activeData.post_losses}${activeData.post_ties > 0 ? "-" + activeData.post_ties : ""}`;
    const consStr = `${activeData.consolation_wins || 0}-${activeData.consolation_losses || 0}${activeData.consolation_ties > 0 ? "-" + activeData.consolation_ties : ""}`;

    tr.innerHTML = `
            <td><strong>${stat.manager}</strong></td>
            <td><div class="badge-stack">${reigningText || '<span style="color:var(--divider)">-</span>'}</div></td>
            <td>${sportsStr}</td>
            <td>${champHtml}</td>
            <td>${regStr}</td>
            <td>${postStr}</td>
            <td>${consStr}</td>
            <td class="points-cell">${activeData.points.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
        `;
    tbody.appendChild(tr);
  });
}

// --- Render Championship History (Matrix Timeline) ---
function renderChampionshipHistory() {
  const container = document.getElementById("history-container");

  const yearsSet = new Set();
  const sportsSet = new Set();
  const matrix = {}; // Format: matrix[year][sport] = ['Manager1']

  // 1. Build the multi-dimensional mapping
  globalStatsData.forEach((stat) => {
    const managerName = stat.manager;
    for (const [sport, data] of Object.entries(stat.by_sport)) {
      if (data.championships && data.championships.length > 0) {
        sportsSet.add(sport);
        data.championships.forEach((year) => {
          yearsSet.add(year);

          // Initialize nested objects if they don't exist yet
          if (!matrix[year]) matrix[year] = {};
          if (!matrix[year][sport]) matrix[year][sport] = [];

          // Push to an array just in case of co-champions or multiple leagues of the same sport
          matrix[year][sport].push(managerName);
        });
      }
    }
  });

  // 2. Sort the axes
  const yearsArray = Array.from(yearsSet).sort((a, b) => b - a); // Descending (Newest first)

  const sportsArray = Array.from(sportsSet).sort((a, b) => {
    const indexA = sportOrder.indexOf(a);
    const indexB = sportOrder.indexOf(b);

    // If a sport isn't in the list, assign it 99 to push it to the right
    const weightA = indexA === -1 ? 99 : indexA;
    const weightB = indexB === -1 ? 99 : indexB;

    return weightA - weightB;
  });

  if (yearsArray.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; color: var(--text-muted);">No championship history found yet.</p>';
    return;
  }

  // 3. Build the HTML Table Matrix
  let html = '<table class="history-table"><thead><tr>';
  html += '<th style="text-align:left;">Year</th>';

  // Generate Column Headers
  sportsArray.forEach((sport) => {
    const icon = sportIcons[sport] || "";
    html += `<th>${icon} ${sport}</th>`;
  });
  html += "</tr></thead><tbody>";

  // Generate Rows
  yearsArray.forEach((year) => {
    html += `<tr><td class="history-year-cell">${year}</td>`;

    sportsArray.forEach((sport) => {
      if (matrix[year] && matrix[year][sport]) {
        // If they won, display name with trophy. Join with <br> if multiple champs.
        const champsStr = matrix[year][sport]
          .map((name) => `🏆 ${name}`)
          .join("<br>");
        html += `<td>${champsStr}</td>`;
      } else {
        // The gap year
        html += `<td><span class="no-champ">-</span></td>`;
      }
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// --- Shared Helper ---
function getUniqueSports() {
  const sportsSet = new Set();
  globalStatsData.forEach((stat) => {
    stat.sports_played.forEach((s) => sportsSet.add(s));
  });
  return Array.from(sportsSet).sort((a, b) => {
    const idxA = sportOrder.indexOf(a);
    const idxB = sportOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
}

// --- Initialize Superlatives Filter ---
function initSuperlativesFilter() {
  const dropdown = document.getElementById("superlatives-manager-filter");

  // Populate managers
  const managers = globalStatsData.map((m) => m.manager).sort();
  managers.forEach((mgr) => {
    const option = document.createElement("option");
    option.value = mgr;
    option.innerText = mgr;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected === "League") {
      renderSuperlatives(globalLeagueSuperlatives);
    } else {
      const mgrData = globalStatsData.find((m) => m.manager === selected);
      const mgrSuperlatives = mgrData ? mgrData.superlatives : null;
      if (mgrSuperlatives) {
        renderSuperlatives(mgrSuperlatives);
      } else {
        document.getElementById("superlatives-container").innerHTML =
          '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No records found for this manager.</p>';
      }
    }
  });
}

// --- Initialize Hall of Fame ---
function initHallOfFame() {
  const hofDropdown = document.getElementById("hof-sport-filter");
  const uniqueSports = getUniqueSports();

  uniqueSports.forEach((sport) => {
    const option = document.createElement("option");
    option.value = sport;
    option.innerText = sport;
    hofDropdown.appendChild(option);
  });

  hofDropdown.addEventListener("change", (e) =>
    renderHallOfFame(e.target.value),
  );

  renderHallOfFame("All");
}

// --- Initialize Heatmap ---
function initHeatmap() {
  const chartDom = document.getElementById("heatmap-container");
  echartInstance = echarts.init(chartDom);

  // 1. Build Managers List
  const managersSet = new Set();
  globalH2HData.forEach((match) => {
    managersSet.add(match.manager_1);
    managersSet.add(match.manager_2);
  });
  allManagers = Array.from(managersSet).sort();

  // 2. Build Heatmap Dropdown
  const filterDropdown = document.getElementById("sport-filter");
  const uniqueSports = getUniqueSports();

  uniqueSports.forEach((sport) => {
    const option = document.createElement("option");
    option.value = sport;
    option.innerText = sport;
    filterDropdown.appendChild(option);
  });

  filterDropdown.addEventListener("change", (e) =>
    updateHeatmap(e.target.value),
  );
  window.addEventListener("resize", () => echartInstance.resize());

  updateHeatmap("All");
}

function updateHeatmap(selectedSport) {
  const isDark = document.body.classList.contains("dark-theme");
  const heatmapData = [];

  // Pre-compute H2H map for O(1) lookups instead of using .find() inside a nested loop
  const h2hMap = new Map();
  globalH2HData.forEach((match) => {
    h2hMap.set(`${match.manager_1}_vs_${match.manager_2}`, match);
  });

  allManagers.forEach((m1, xIndex) => {
    allManagers.forEach((m2, yIndex) => {
      if (m1 === m2) {
        heatmapData.push([xIndex, yIndex, "-"]);
        return;
      }

      const sortedManagers = [m1, m2].sort();
      const key = `${sortedManagers[0]}_vs_${sortedManagers[1]}`;
      const match = h2hMap.get(key);

      let activeRecord = null;
      if (match) {
        if (selectedSport === "All") {
          activeRecord = match;
        } else if (match.by_sport[selectedSport]) {
          activeRecord = match.by_sport[selectedSport];
        }
      }

      if (!activeRecord || activeRecord.total_matchups === 0) {
        heatmapData.push([xIndex, yIndex, "-"]);
      } else {
        const isM1 = match.manager_1 === m1;
        const m1Wins = isM1
          ? activeRecord.manager_1_wins
          : activeRecord.manager_2_wins;

        const winPct = (m1Wins / activeRecord.total_matchups) * 100;
        const losses = activeRecord.total_matchups - m1Wins - activeRecord.ties;

        heatmapData.push([
          xIndex,
          yIndex,
          winPct.toFixed(1),
          m1Wins,
          losses,
          activeRecord.ties,
        ]);
      }
    });
  });

  const option = {
    tooltip: {
      position: "top",
      formatter: function (params) {
        if (params.value[2] === "-") return "Self";
        const m1 = allManagers[params.value[0]];
        const m2 = allManagers[params.value[1]];
        return `<strong>${m1}</strong> vs <strong>${m2}</strong><br/>
                        Win Rate: ${params.value[2]}%<br/>
                        Record: ${params.value[3]}-${params.value[4]}-${params.value[5]}`;
      },
    },
    grid: { height: "70%", top: "10%" },
    xAxis: {
      type: "category",
      data: allManagers,
      splitArea: { show: true },
      axisLabel: {
        interval: 0,
        rotate: 45,
        color: isDark ? "#94a3b8" : "#666",
      },
    },
    yAxis: {
      type: "category",
      data: allManagers,
      splitArea: { show: true },
      axisLabel: { color: isDark ? "#94a3b8" : "#666" },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "0%",
      textStyle: {
        color: isDark ? "#f1f5f9" : "#1a1a1a",
      },
      inRange: {
        color: ["#e74c3c", isDark ? "#1e293b" : "#f5f7fa", "#2ecc71"],
      },
    },
    series: [
      {
        name: "Head to Head",
        type: "heatmap",
        data: heatmapData,
        label: {
          show: true,
          formatter: (params) =>
            params.value[2] !== "-" ? Math.round(params.value[2]) + "%" : "",
          color: isDark ? "#f1f5f9" : "#333",
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" },
        },
      },
    ],
  };

  echartInstance.setOption(option);
}

// --- Initialize Spider/Radar Chart ---
function initRadar() {
  const chartDom = document.getElementById("radar-container");
  radarInstance = echarts.init(chartDom);

  // Populate the two dropdowns
  const p1Dropdown = document.getElementById("radar-p1-filter");
  const p2Dropdown = document.getElementById("radar-p2-filter");

  globalStatsData.forEach((stat, index) => {
    const opt1 = new Option(stat.manager, stat.manager);
    const opt2 = new Option(stat.manager, stat.manager);
    p1Dropdown.add(opt1);
    p2Dropdown.add(opt2);
  });

  // Default Player 2 to the second person in the list so they don't overlap entirely on load
  if (globalStatsData.length > 1) p2Dropdown.selectedIndex = 1;

  p1Dropdown.addEventListener("change", updateRadar);
  p2Dropdown.addEventListener("change", updateRadar);
  window.addEventListener("resize", () => radarInstance.resize());

  updateRadar();
}

function updateRadar() {
  const isDark = document.body.classList.contains("dark-theme");
  const p1Name = document.getElementById("radar-p1-filter").value;
  const p2Name = document.getElementById("radar-p2-filter").value;

  const p1 = globalStatsData.find((m) => m.manager === p1Name);
  const p2 = globalStatsData.find((m) => m.manager === p2Name);

  // Helper to calculate Win % and Total Matches
  const getMetrics = (p) => {
    const tWins = p.overall.reg_wins + p.overall.post_wins;
    const tLosses = p.overall.reg_losses + p.overall.post_losses;
    const tTies = p.overall.reg_ties + p.overall.post_ties;
    const totalMatches = tWins + tLosses + tTies;
    const winPct =
      totalMatches > 0 ? ((tWins / totalMatches) * 100).toFixed(1) : 0;
    return { totalWins: tWins, totalMatches, winPct: parseFloat(winPct) };
  };

  // Calculate the absolute maximums in the league so the web scales correctly
  let maxWins = 0,
    maxMatches = 0,
    maxChamps = 0,
    maxSports = 0;
  globalStatsData.forEach((p) => {
    const metrics = getMetrics(p);
    if (metrics.totalWins > maxWins) maxWins = metrics.totalWins;
    if (metrics.totalMatches > maxMatches) maxMatches = metrics.totalMatches;
    if (p.overall.championships.length > maxChamps)
      maxChamps = p.overall.championships.length;
    if (p.sports_played.length > maxSports) maxSports = p.sports_played.length;
  });

  // Format data for the chart
  const formatRadarData = (p) => {
    const m = getMetrics(p);
    return [
      m.winPct,
      m.totalWins,
      p.overall.championships.length,
      m.totalMatches,
      p.sports_played.length,
    ];
  };

  const option = {
    tooltip: { trigger: "item" },
    legend: {
      data: [p1.manager, p2.manager],
      bottom: 0,
      textStyle: { color: isDark ? "#f1f5f9" : "#1a1a1a" },
    },
    radar: {
      indicator: [
        { name: "Win %", max: 100 },
        { name: "Total Wins", max: maxWins + 5 }, // Add slight buffer to outer edge
        { name: "Championships", max: maxChamps < 3 ? 3 : maxChamps }, // Minimum of 3 so the web doesn't look weird if max is 1
        { name: "Matches Played", max: maxMatches + 10 },
        { name: "Sports Played", max: maxSports < 3 ? 3 : maxSports },
      ],
      shape: "polygon",
      splitNumber: 5,
      axisName: { color: isDark ? "#93c5fd" : "#2c3e50", fontWeight: "bold" },
      splitArea: {
        areaStyle: {
          color: isDark ? ["#0f172a", "#1e293b"] : ["#f5f7fa", "#ffffff"],
        },
      }, // Alternating web colors
    },
    series: [
      {
        name: "Manager Comparison",
        type: "radar",
        data: [
          {
            value: formatRadarData(p1),
            name: p1.manager,
            itemStyle: { color: "#3498db" }, // Blue
            areaStyle: { opacity: 0.3 },
          },
          {
            value: formatRadarData(p2),
            name: p2.manager,
            itemStyle: { color: "#e74c3c" }, // Red
            areaStyle: { opacity: 0.3 },
          },
        ],
      },
    ],
  };

  radarInstance.setOption(option);
}

loadDashboard();
