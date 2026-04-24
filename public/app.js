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
function renderSuperlatives(superlativesData, selectedSport = "All") {
  const container = document.getElementById("superlatives-container");
  container.innerHTML = ""; // Clear loading message
  if (!superlativesData) return;

  const sortedSports = Object.keys(superlativesData).sort((a, b) => {
    const idxA = sportOrder.indexOf(a);
    const idxB = sportOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const sportsToRender =
    selectedSport === "All"
      ? sortedSports
      : sortedSports.filter((s) => s === selectedSport);
  if (sportsToRender.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No records found for this selection.</p>';
    return;
  }

  for (const sport of sportsToRender) {
    const superlative = superlativesData[sport];
    // Skip if no actual data was parsed for this sport yet
    if (!superlative.highest_score || superlative.highest_score.value === 0)
      continue;

    const icon = sportIcons[sport] || "🏆";
    const espnNote =
      sport === "NBA"
        ? "<span style='font-size: 0.85rem; font-weight: normal; color: var(--text-muted);'>(Not including ESPN years)</span>"
        : "";

    // Generic card builder to cleanly iterate and handle arrays
    const buildCard = (type, title, tooltip, formatVal, formatHolder) => {
      const data = superlative[type];
      if (!data) return "";

      const isInvalid = data.value >= 99999 || data.value === 0;
      const displayVal = isInvalid ? "N/A" : formatVal(data.value);

      let holdersHtml = "";
      if (!isInvalid && data.holders && data.holders.length > 0) {
        if (data.holders.length === 1) {
          const h = data.holders[0];
          holdersHtml = `
            <p class="manager">${h.manager || h.winner || h.loser}</p>
            <p class="meta">${formatHolder(h, data.value)}</p>
          `;
        } else {
          holdersHtml = `<div class="record-holders">`;
          data.holders.forEach((h) => {
            holdersHtml += `
              <div class="record-holder">
                <div class="manager" style="font-weight: 600; margin-bottom: 2px;">${h.manager || h.winner || h.loser}</div>
                <div class="meta" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">${formatHolder(h, data.value)}</div>
              </div>
            `;
          });
          holdersHtml += `</div>`;
        }
      } else {
        let fallbackMsg = "No records recorded.";
        if (type.includes("playoff")) fallbackMsg = "Never made the playoffs.";
        if (type.includes("miss_playoff") || type.includes("drought"))
          fallbackMsg = "Never missed the playoffs.";
        holdersHtml = `<p class="meta">${fallbackMsg}</p>`;
      }

      return `
        <div class="score-card ${type.replace(/_/g, "-")}">
          <h3 title="${tooltip}">${title}</h3>
          <p class="metric">${displayVal}</p>
          ${holdersHtml}
        </div>
      `;
    };

    const sectionHtml = `
            <div class="sport-section">
                <div class="sport-header">${icon} ${sport} Records (Regular Season) ${espnNote}</div>
                <div class="scores-grid">
          ${buildCard(
            "highest_ppg",
            "🚂 The Juggernaut",
            "Highest Points Per Game For in a single season",
            (v) => `${v.toFixed(1)} PF Avg`,
            (h) =>
              `Highest scoring offense | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "lowest_ppg",
            "📉 Rough Season",
            "Lowest Points Per Game For in a single season",
            (v) => `${v.toFixed(1)} PF Avg`,
            (h) =>
              `Lowest scoring offense | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "highest_score",
            "🌋 All-Time High",
            "Highest points scored in a single game",
            (v) => `${v.toLocaleString()} pts`,
            (h, v) =>
              `Against ${h.opponent} (${v} to ${h.opp_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "lowest_score",
            "🪫 All-Time Low",
            "Lowest points scored in a single game",
            (v) => `${v.toLocaleString()} pts`,
            (h, v) =>
              `Against ${h.opponent} (${v} to ${h.opp_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "longest_playoff_streak",
            "🏃‍♂️ The Marathon",
            "Most consecutive seasons making the playoffs",
            (v) => (v === 1 ? "1 Season" : `${v} Straight Seasons`),
            (h) =>
              h.start_y === h.end_y
                ? `Playoff appearance in ${h.start_y}`
                : `Playoff appearances from ${h.start_y} to ${h.end_y}`,
          )}
          ${buildCard(
            "longest_playoff_drought",
            "🏜️ The Drought",
            "Most consecutive seasons missing the playoffs",
            (v) => (v === 1 ? "1 Season" : `${v} Straight Seasons`),
            (h) =>
              h.start_y === h.end_y
                ? `Missed playoffs in ${h.start_y}`
                : `Missed playoffs from ${h.start_y} to ${h.end_y}`,
          )}
          ${buildCard(
            "longest_win_streak",
            "🔥 On Fire",
            "Most consecutive regular season wins",
            (v) => `${v} Straight Wins`,
            (h) =>
              `Regular Season<br>Wk ${h.start_p}, ${h.start_y} to Wk ${h.end_p}, ${h.end_y}`,
          )}
          ${buildCard(
            "longest_loss_streak",
            "🧊 Ice Cold",
            "Most consecutive regular season losses",
            (v) => `${v} Straight Losses`,
            (h) =>
              `Regular Season<br>Wk ${h.start_p}, ${h.start_y} to Wk ${h.end_p}, ${h.end_y}`,
          )}
          ${buildCard(
            "highest_losing_score",
            "💔 The Heartbreak",
            "Highest score in a loss",
            (v) => `${v.toLocaleString()} pts`,
            (h, v) =>
              `Lost to ${h.opponent} (${v} to ${h.opp_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "lowest_winning_score",
            "🦝 The Heist",
            "Lowest score in a win",
            (v) => `${v.toLocaleString()} pts`,
            (h, v) =>
              `Defeated ${h.opponent} (${v} to ${h.opp_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "largest_victory_margin",
            "🥊 Biggest Blowout",
            "Largest margin of victory",
            (v) => `+${v.toLocaleString()} pts`,
            (h) =>
              `Destroyed ${h.loser} (${h.winning_score} to ${h.losing_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "smallest_victory_margin",
            "🤏 Close One!",
            "Smallest margin of victory",
            (v) => `+${v.toLocaleString()} pts`,
            (h) =>
              `Survived ${h.loser} (${h.winning_score} to ${h.losing_score})<br>Week ${h.period}, ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "highest_miss_playoffs_ppg",
            "🏹 Glass Cannon",
            "Highest Points Per Game For without making the playoffs",
            (v) => `${v.toFixed(1)} PF Avg`,
            (h) =>
              `Highest scoring offense to miss the playoffs | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "lowest_playoff_ppg",
            "🤞 Lucky Breaks",
            "Lowest Points Per Game For while still making the playoffs",
            (v) => `${v.toFixed(1)} PF Avg`,
            (h) =>
              `Lowest scoring offense to make the playoffs | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "highest_ppga",
            "🌩️ Schedule Victim",
            "Highest Points Per Game Against in a single season",
            (v) => `${v.toFixed(1)} PA Avg`,
            (h) =>
              `Hardest schedule | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "lowest_ppga",
            "🐴 Golden Horseshoe",
            "Lowest Points Per Game Against in a single season",
            (v) => `${v.toFixed(1)} PA Avg`,
            (h) =>
              `Easiest schedule | ${h.year} | ${getPlatformIcon(h.platform)}`,
          )}
          ${buildCard(
            "most_wins_under_median",
            "🍀 Better Lucky Than Good",
            "Most wins while scoring in the bottom half of the league",
            (v) => `${v} Wins`,
            (h) => `Career wins despite scoring<br>below the weekly median.`,
          )}
          ${buildCard(
            "most_losses_over_median",
            "🌧️ Bad Beats",
            "Most career losses despite scoring in the top half of the league",
            (v) => `${v} Losses`,
            (h) => `Career losses despite scoring<br>above the weekly median.`,
          )}

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

  // Filter inactive managers if toggled
  const hideInactive = document.getElementById("hide-inactive-toggle")?.checked;
  let filteredData = sortedData;
  if (hideInactive) {
    let maxYearPlayed = 0;
    globalStatsData.forEach((stat) => {
      const years =
        selectedSport === "All"
          ? stat.years_played
          : stat.by_sport[selectedSport]?.years_played || [];
      if (years && years.length > 0) {
        const max = Math.max(...years);
        if (max > maxYearPlayed) maxYearPlayed = max;
      }
    });

    filteredData = sortedData.filter((stat) => {
      const years =
        selectedSport === "All"
          ? stat.years_played
          : stat.by_sport[selectedSport]?.years_played || [];
      if (!years || years.length === 0) return false;
      return Math.max(...years) >= maxYearPlayed - 1;
    });
  }

  // 3. Render Table
  filteredData.forEach((stat) => {
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

      if (data) {
        let medalsHtml = [];
        if (data.championships && data.championships.length > 0) {
          const uniqueYears = [...new Set(data.championships)].sort(
            (a, b) => b - a,
          );
          medalsHtml.push(
            `<span title="1st Place: ${uniqueYears.join(", ")}" style="cursor:help;">${"🏆".repeat(uniqueYears.length)}</span>`,
          );
        }
        if (data.second_place && data.second_place.length > 0) {
          const uniqueYears = [...new Set(data.second_place)].sort(
            (a, b) => b - a,
          );
          medalsHtml.push(
            `<span title="2nd Place: ${uniqueYears.join(", ")}" style="cursor:help;">🥈x${uniqueYears.length}</span>`,
          );
        }
        if (data.third_place && data.third_place.length > 0) {
          const uniqueYears = [...new Set(data.third_place)].sort(
            (a, b) => b - a,
          );
          medalsHtml.push(
            `<span title="3rd Place: ${uniqueYears.join(", ")}" style="cursor:help;">🥉x${uniqueYears.length}</span>`,
          );
        }

        const hasGold = data.championships && data.championships.length > 0;
        const hasSilver = data.second_place && data.second_place.length > 0;
        const hasBronze = data.third_place && data.third_place.length > 0;

        if (hasGold || hasSilver || hasBronze) {
          const goldStyle =
            "min-width: 90px; display: inline-block; white-space: nowrap;";
          const medalStyle =
            "min-width: 45px; display: inline-block; white-space: nowrap;";
          let goldHtml = `<span style="${goldStyle}"></span>`;
          let silverHtml = `<span style="${medalStyle}"></span>`;
          let bronzeHtml = `<span style="${medalStyle}"></span>`;

          if (hasGold) {
            const uniqueYears = [...new Set(data.championships)].sort(
              (a, b) => b - a,
            );
            goldHtml = `<span title="1st Place: ${uniqueYears.join(", ")}" style="cursor:help; ${goldStyle}">${"🏆".repeat(uniqueYears.length)}</span>`;
          }
          if (hasSilver) {
            const uniqueYears = [...new Set(data.second_place)].sort(
              (a, b) => b - a,
            );
            silverHtml = `<span title="2nd Place: ${uniqueYears.join(", ")}" style="cursor:help; ${medalStyle}">🥈x${uniqueYears.length}</span>`;
          }
          if (hasBronze) {
            const uniqueYears = [...new Set(data.third_place)].sort(
              (a, b) => b - a,
            );
            bronzeHtml = `<span title="3rd Place: ${uniqueYears.join(", ")}" style="cursor:help; ${medalStyle}">🥉x${uniqueYears.length}</span>`;
          }

          champHtmlForSport = `<div style="display:flex; gap:4px; font-size: 0.9rem;">${goldHtml}${silverHtml}${bronzeHtml}</div>`;
        }
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
      if (!data) return;

      (data.undefeated_seasons || []).forEach((year) => {
        const iconStr = sportIcons[sp] || sp;
        reigningText += `<span class="reigning-badge perfect" title="Undefeated Regular Season in ${year}">${iconStr} Perfect Reg. Season ('${String(year).slice(-2)})</span>`;
      });

      if (!data.championships || data.championships.length < 2) return;
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

    // Calculate Active Era
    const activeYearsPlayed =
      selectedSport === "All"
        ? stat.years_played
        : stat.by_sport[selectedSport]?.years_played || [];
    let seasonsStr = "";
    if (activeYearsPlayed && activeYearsPlayed.length > 0) {
      const ranges = [];
      let start = activeYearsPlayed[0];
      let end = activeYearsPlayed[0];
      for (let i = 1; i < activeYearsPlayed.length; i++) {
        if (activeYearsPlayed[i] === end + 1) {
          end = activeYearsPlayed[i];
        } else {
          ranges.push(start === end ? `${start}` : `${start}-${end}`);
          start = end = activeYearsPlayed[i];
        }
      }
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      const yearRange = ranges.join(", ");
      seasonsStr = `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; line-height: 1.4;"><strong style="color: var(--text-main);">${activeYearsPlayed.length} Year${activeYearsPlayed.length > 1 ? "s" : ""}</strong><br>${yearRange}</div>`;
    }

    tr.innerHTML = `
            <td>
                <div class="manager-name-link" style="font-size: 1.05rem; font-weight: bold; cursor: pointer;" onclick="openPlayerCard('${stat.manager.replace(/'/g, "\\'")}')">${stat.manager}</div>
                ${seasonsStr}
            </td>
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
  const managerDropdown = document.getElementById(
    "superlatives-manager-filter",
  );
  const sportDropdown = document.getElementById("superlatives-sport-filter");

  // Populate managers
  const managers = globalStatsData.map((m) => m.manager).sort();
  managers.forEach((mgr) => {
    const option = document.createElement("option");
    option.value = mgr;
    option.innerText = mgr;
    managerDropdown.appendChild(option);
  });

  // Populate sports
  const uniqueSports = getUniqueSports();
  uniqueSports.forEach((sport) => {
    const option = document.createElement("option");
    option.value = sport;
    option.innerText = sport;
    sportDropdown.appendChild(option);
  });

  const updateFilters = () => {
    const selectedManager = managerDropdown.value;
    const selectedSport = sportDropdown.value;

    let dataToRender = globalLeagueSuperlatives;
    if (selectedManager !== "League") {
      const mgrData = globalStatsData.find(
        (m) => m.manager === selectedManager,
      );
      dataToRender = mgrData ? mgrData.superlatives : null;
    }

    if (dataToRender) {
      renderSuperlatives(dataToRender, selectedSport);
    } else {
      document.getElementById("superlatives-container").innerHTML =
        '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No records found for this selection.</p>';
    }
  };

  managerDropdown.addEventListener("change", updateFilters);
  sportDropdown.addEventListener("change", updateFilters);
}

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

  const filterContainer = document.createElement("div");
  filterContainer.style.display = "flex";
  filterContainer.style.alignItems = "center";
  filterContainer.style.gap = "15px";

  // Dynamically inject the Hide Inactive toggle next to the dropdown
  const toggleLabel = document.createElement("label");
  toggleLabel.style.display = "flex";
  toggleLabel.style.alignItems = "center";
  toggleLabel.style.gap = "8px";
  toggleLabel.style.cursor = "pointer";
  toggleLabel.style.fontSize = "0.95rem";
  toggleLabel.style.fontWeight = "600";
  toggleLabel.style.color = "var(--text-muted)";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.id = "hide-inactive-toggle";
  toggleInput.addEventListener("change", () =>
    renderHallOfFame(hofDropdown.value),
  );

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(document.createTextNode("Hide Inactive"));

  if (hofDropdown.parentElement) {
    hofDropdown.parentElement.insertBefore(filterContainer, hofDropdown);
    filterContainer.appendChild(hofDropdown);
    filterContainer.appendChild(toggleLabel);
  }

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

// --- Player Card Modal ---
function openPlayerCard(managerName) {
  let modal = document.getElementById("player-card-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "player-card-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="modal-close" onclick="closePlayerCard()">&times;</span>
        <div id="player-card-body"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePlayerCard();
    });
  }

  const stat = globalStatsData.find((m) => m.manager === managerName);
  if (!stat) return;

  const body = document.getElementById("player-card-body");

  const totalWins = stat.overall.reg_wins + stat.overall.post_wins;
  const totalLosses = stat.overall.reg_losses + stat.overall.post_losses;
  const totalTies =
    (stat.overall.reg_ties || 0) + (stat.overall.post_ties || 0);
  const totalGames = totalWins + totalLosses + totalTies;
  const winPct =
    totalGames > 0
      ? ((totalWins + totalTies * 0.5) / totalGames)
          .toFixed(3)
          .replace(/^0+/, "")
      : ".000";

  let html = `
    <div style="text-align: center; margin-bottom: 2rem;">
        <h2 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--primary);">${stat.manager}</h2>
        <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
            <div class="score-card" style="padding: 0.5rem 1rem; border-top-color: var(--primary); min-width: 100px;">
                <h3 style="margin:0; font-size:0.8rem;">Win %</h3>
                <div style="font-size:1.2rem; font-weight:bold; color: var(--text-main);">${winPct}</div>
            </div>
            <div class="score-card" style="padding: 0.5rem 1rem; border-top-color: #f1c40f; min-width: 100px;">
                <h3 style="margin:0; font-size:0.8rem;">Championships</h3>
                <div style="font-size:1.2rem; font-weight:bold; color: var(--text-main);">${stat.overall.championships.length}</div>
            </div>
            <div class="score-card" style="padding: 0.5rem 1rem; border-top-color: #3498db; min-width: 100px;">
                <h3 style="margin:0; font-size:0.8rem;">Total Points</h3>
                <div style="font-size:1.2rem; font-weight:bold; color: var(--text-main);">${stat.overall.points.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
            </div>
        </div>
    </div>
  `;

  html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">`;

  const renderSports = [...new Set(stat.sports_played)].sort((a, b) => {
    const idxA = sportOrder.indexOf(a);
    const idxB = sportOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  renderSports.forEach((sp) => {
    const sData = stat.by_sport[sp];
    const sWins = sData.reg_wins + sData.post_wins;
    const sLosses = sData.reg_losses + sData.post_losses;
    const sTies = (sData.reg_ties || 0) + (sData.post_ties || 0);
    const sGames = sWins + sLosses + sTies;
    const sWinPct =
      sGames > 0
        ? ((sWins + sTies * 0.5) / sGames).toFixed(3).replace(/^0+/, "")
        : ".000";

    html += `
        <div class="card" style="padding: 1rem; text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">${sportIcons[sp] || ""}</div>
            <h3 style="margin: 0 0 0.5rem 0; color: var(--primary);">${sp}</h3>
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                Record: <strong style="color: var(--text-main);">${sWins}-${sLosses}${sTies > 0 ? "-" + sTies : ""}</strong> (${sWinPct})
            </div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                🏆 <strong>${(sData.championships || []).length}</strong> | 
                🥈 <strong>${(sData.second_place || []).length}</strong> | 
                🥉 <strong>${(sData.third_place || []).length}</strong>
            </div>
        </div>
      `;
  });

  html += `</div>`;

  html += `
    <div style="margin-top: 2rem; text-align: center;">
        <button class="nav-button" onclick="closePlayerCard(); document.getElementById('superlatives-manager-filter').value = '${stat.manager.replace(/'/g, "\\\\'")}'; document.getElementById('superlatives-manager-filter').dispatchEvent(new Event('change')); document.getElementById('superlatives-container').scrollIntoView({behavior: 'smooth'});">
            View Trophy Cabinet
        </button>
    </div>
  `;

  body.innerHTML = html;
  modal.style.display = "flex";

  setTimeout(() => {
    modal.classList.add("show");
  }, 10);
}

function closePlayerCard() {
  const modal = document.getElementById("player-card-modal");
  if (modal) {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.style.display = "none";
    }, 300);
  }
}

loadDashboard();
