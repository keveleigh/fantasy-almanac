// --- Theme Toggle ---
document.body.classList.add("preload-theme");

const themeToggle = document.getElementById("theme-toggle");
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
let luckChartInstance = null;
let luckData = [];

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
  if (luckChartInstance) renderLuckQuadrant(); // Refresh chart colors
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

// --- Live Dashboard Initializer ---
async function loadLiveDashboard() {
  try {
    const res = await fetch("data/live/mlb_current_season.json");
    const data = await res.json();

    document.getElementById("week-subtitle").innerHTML =
      `Week ${data.week} <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted); display: block; margin-top: 4px;">(Updates every Monday morning)</span>`;

    const prevWeekSpan = document.getElementById("prev-week-num");
    if (prevWeekSpan)
      prevWeekSpan.innerText = data.week > 1 ? data.week - 1 : "-";
    const currWeekSpan = document.getElementById("curr-week-num");
    if (currWeekSpan) currWeekSpan.innerText = data.week;

    renderTrueStandings(data.true_standings, data.remaining_sos);

    luckData = data.luck_quadrant;
    initLuckQuadrant();

    renderPreviousMatchups(
      data.previous_matchups,
      data.previous_week_median,
      data.heartbreak_threshold,
    );
    renderCurrentMatchups(
      data.current_matchups,
      data.true_standings,
      data.playoff_team_count,
    );
    renderMatchupLegend();
  } catch (error) {
    console.error("Error loading live JSON data:", error);
    document.getElementById("week-subtitle").innerHTML =
      `<span style="color:red;">Error loading live data. Did your GitHub Action run?</span>`;
  }
}

// --- 1. Render True Standings ---
function renderTrueStandings(standings, sosData) {
  const tbody = document.querySelector("#true-standings-table tbody");
  tbody.innerHTML = "";

  if (!standings || standings.length === 0) {
    tbody.innerHTML =
      "<tr><td colspan='7' style='text-align:center;'>No standings data yet.</td></tr>";
    return;
  }

  const sosMap = {};
  if (sosData) {
    sosData.forEach((teamSOS, index) => {
      let color = "var(--text-muted)";
      if (index < 3) {
        color = "#e74c3c";
      } else if (index >= sosData.length - 3) {
        color = "#2ecc71";
      }
      sosMap[teamSOS.team] = {
        ppg: teamSOS.sos_ppg.toFixed(1),
        color: color,
      };
    });
  }

  standings.forEach((team, index) => {
    const actualWins = parseInt(team.actual_record.split("-")[0]);
    const luckDiff = (actualWins - team.expected_wins).toFixed(1);

    let luckColor = "var(--text-muted)";
    let sign = "";
    if (luckDiff > 0.5) {
      luckColor = "#2ecc71";
      sign = "+";
    } // Lucky (Green)
    if (luckDiff < -0.5) {
      luckColor = "#e74c3c";
      sign = "";
    } // Unlucky (Red)

    const luckHtml = `<span style="color: ${luckColor}; font-weight:bold;">${sign}${luckDiff}</span>`;

    const fallbackLogo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#cbd5e1"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-size="50">👤</text></svg>')}`;
    const logoUrl = team.logo_url || fallbackLogo;
    const logoHtml = `<img src="${logoUrl}" class="team-avatar" alt="" onerror="this.onerror=null;this.src='${fallbackLogo}'">`;

    const trueRank = index + 1;
    const actualRank = team.actual_rank;
    const rankDiff = actualRank - trueRank;

    let rankColor = "var(--text-muted)";
    if (rankDiff > 0)
      rankColor = "#e74c3c"; // Actual rank is worse than true rank (Unlucky)
    else if (rankDiff < 0) rankColor = "#2ecc71"; // Actual rank is better than true rank (Lucky)

    const actualRankHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; white-space: nowrap;">Actual: <span style="color: ${rankColor}; font-weight: bold;">#${actualRank}</span></div>`;

    const sosInfo = sosMap[team.team] || {
      ppg: "N/A",
      color: "var(--text-muted)",
    };

    tbody.innerHTML += `
            <tr>
                <td style="text-align: center; vertical-align: middle;">
                    <div style="font-size: 1.2rem; font-weight: bold;">${trueRank}</div>
                    ${actualRankHtml}
                </td>
                <td><div style="display: flex; align-items: center; gap: 8px;">${logoHtml} <strong>${team.team}</strong></div></td>
                <td>${team.actual_record}</td>
                <td>${(team.true_win_pct * 100).toFixed(1)}%</td>
                <td>${team.expected_wins.toFixed(1)}</td>
                <td>${luckHtml}</td>
                <td style="color: ${sosInfo.color}; font-weight: bold;">${sosInfo.ppg}</td>
            </tr>
        `;
  });
}

// --- 2. Render The Luck Quadrant Scatterplot ---
function initLuckQuadrant() {
  const chartDom = document.getElementById("luck-chart");
  luckChartInstance = echarts.init(chartDom);
  renderLuckQuadrant();
  window.addEventListener("resize", () => {
    luckChartInstance.resize();
    renderLuckQuadrant();
  });
}

function renderLuckQuadrant() {
  if (!luckData || luckData.length === 0) return;

  const isDark = document.body.classList.contains("dark-theme");
  const isMobile = window.innerWidth < 768;
  const textColor = isDark ? "#f1f5f9" : "#1a1a1a";
  const mutedColor = isDark ? "#94a3b8" : "#666";
  const splitLineColor = isDark ? "#334155" : "#e0e0e0";

  // Calculate League Medians to draw the intersecting axes
  const getMedian = (arr) => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };
  const medianPF = getMedian(luckData.map((d) => d.pf).sort((a, b) => a - b));
  const medianPA = getMedian(luckData.map((d) => d.pa).sort((a, b) => a - b));

  // Dynamically color dots based on their quadrant
  const seriesData = luckData.map((d) => {
    let pointColor = "#3498db"; // Default Blue
    if (d.pf >= medianPF && d.pa <= medianPA)
      pointColor = "#2ecc71"; // Good & Lucky (Green)
    else if (d.pf >= medianPF && d.pa > medianPA)
      pointColor = "#3498db"; // Schedule Victim (Blue)
    else if (d.pf < medianPF && d.pa <= medianPA)
      pointColor = "#9b59b6"; // Lucky Breaks (Purple)
    else if (d.pf < medianPF && d.pa > medianPA) pointColor = "#e74c3c"; // Rough Season (Red)

    return {
      name: d.team,
      value: [d.pa, d.pf],
      itemStyle: { color: pointColor },
    };
  });

  const option = {
    tooltip: {
      formatter: (params) => {
        if (params.componentType === "markLine") {
          return `<strong>${params.name}</strong>: ${params.value}`;
        }
        return `<strong>${params.data.name}</strong><br/>Avg PF: ${params.value[1]}<br/>Avg PA: ${params.value[0]}`;
      },
    },
    grid: { left: "10%", right: "10%", bottom: "10%", top: "10%" },
    xAxis: {
      name: "Avg Points Against (PA)",
      nameLocation: "middle",
      nameGap: 30,
      type: "value",
      scale: true,
      axisLabel: { color: mutedColor },
      nameTextStyle: { color: textColor, fontWeight: "bold" },
      splitLine: { lineStyle: { type: "dashed", color: splitLineColor } },
    },
    yAxis: {
      name: "Avg Points For (PF)",
      nameLocation: "middle",
      nameGap: 40,
      type: "value",
      scale: true,
      axisLabel: { color: mutedColor },
      nameTextStyle: { color: textColor, fontWeight: "bold" },
      splitLine: { lineStyle: { type: "dashed", color: splitLineColor } },
    },
    series: [
      {
        type: "scatter",
        data: seriesData,
        symbolSize: 14,
        label: {
          show: true,
          formatter: "{b}",
          position: "top",
          color: textColor,
          fontSize: 10,
        },
        markLine: {
          animation: false,
          lineStyle: {
            type: "solid",
            color: isDark ? "#fde047" : "#f39c12",
            width: 2,
          },
          label: { color: textColor },
          data: [
            { xAxis: medianPA, name: "Median PA" },
            { yAxis: medianPF, name: "Median PF" },
          ],
        },
        markArea: {
          silent: true,
          itemStyle: { color: "transparent" },
          label: {
            color: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
            fontSize: isMobile ? 18 : 22,
            fontWeight: "bold",
            position: "inside",
          },
          data: [
            [
              {
                name: isMobile ? "GOOD &\nLUCKY" : "GOOD & LUCKY",
                x: "10%",
                y: "10%",
              },
              { xAxis: medianPA, yAxis: medianPF },
            ],
            [
              {
                name: isMobile ? "SCHEDULE\nVICTIM" : "SCHEDULE VICTIM",
                xAxis: medianPA,
                y: "10%",
              },
              { x: "90%", yAxis: medianPF },
            ],
            [
              {
                name: isMobile ? "LUCKY\nBREAKS" : "LUCKY BREAKS",
                x: "10%",
                yAxis: medianPF,
              },
              { xAxis: medianPA, y: "90%" },
            ],
            [
              {
                name: isMobile ? "ROUGH\nSEASON" : "ROUGH SEASON",
                xAxis: medianPA,
                yAxis: medianPF,
              },
              { x: "90%", y: "90%" },
            ],
          ],
        },
      },
    ],
  };
  luckChartInstance.setOption(option);
}

// --- 3. Render Matchup Center ---
function renderPreviousMatchups(matchups, median, heartbreak_threshold) {
  const container = document.getElementById("prev-matchups-container");
  container.innerHTML = "";

  if (!matchups || matchups.length === 0) {
    container.innerHTML =
      "<p style='color: var(--text-muted);'>No results available for the previous week.</p>";
    return;
  }

  matchups.forEach((match) => {
    const homeBold =
      match.home_score > match.away_score
        ? "font-weight:bold; color:var(--text-main);"
        : "color:var(--text-muted);";
    const awayBold =
      match.away_score > match.home_score
        ? "font-weight:bold; color:var(--text-main);"
        : "color:var(--text-muted);";

    let tagHtml = "";
    let borderColor = "";

    const winnerScore = Math.max(match.home_score, match.away_score);
    const loserScore =
      match.home_score < match.away_score ? match.home_score : match.away_score;
    const margin = Math.abs(match.home_score - match.away_score);
    const ratio = winnerScore > 0 ? loserScore / winnerScore : 0;

    const winnerRank =
      match.home_score > match.away_score ? match.home_rank : match.away_rank;
    const loserRank =
      match.home_score > match.away_score ? match.away_rank : match.home_rank;

    // Heartbreak: Lost despite having one of the top scores of the week
    if (heartbreak_threshold > 0 && loserScore >= heartbreak_threshold) {
      tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #8e44ad; text-align: center; margin-bottom: 8px; font-weight: 800;">💔 HEARTBREAK</div>`;
      borderColor = `border-top-color: #8e44ad;`;
    }
    // Upset: Lower rank (higher number) beats a team ranked 4+ spots higher
    else if (
      winnerRank &&
      loserRank &&
      winnerRank > loserRank &&
      winnerRank - loserRank >= 4
    ) {
      tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #e74c3c; text-align: center; margin-bottom: 8px; font-weight: 800;">🚨 UPSET</div>`;
      borderColor = `border-top-color: #e74c3c;`;
    }
    // Nail-biter: Loser scored 95% or more of the winner's score
    else if (winnerScore > 0 && ratio >= 0.95 && margin > 0) {
      tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #1abc9c; text-align: center; margin-bottom: 8px; font-weight: 800;">🤏 NAIL-BITER</div>`;
      borderColor = `border-top-color: #1abc9c;`;
    }
    // Blowout: Loser scored 75% or less of the winner's score
    else if (winnerScore > 0 && ratio <= 0.75) {
      tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #f39c12; text-align: center; margin-bottom: 8px; font-weight: 800;">💥 BLOWOUT</div>`;
      borderColor = `border-top-color: #f39c12;`;
    }
    // Lucky Win: Winning score was below the weekly median
    else if (median && winnerScore > 0 && winnerScore < median) {
      tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #2ecc71; text-align: center; margin-bottom: 8px; font-weight: 800;">🍀 LUCKY WIN</div>`;
      borderColor = `border-top-color: #2ecc71;`;
    }

    container.innerHTML += `
            <div class="score-card" style="display: flex; flex-direction: column; ${borderColor}">
                ${tagHtml}
                <div style="margin-top: auto;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px; ${awayBold}"><span>${match.away}</span><span>${match.away_score.toFixed(1)}</span></div>
                <div style="display:flex; justify-content:space-between; ${homeBold}"><span>${match.home}</span><span>${match.home_score.toFixed(1)}</span></div>
                </div>
            </div>`;
  });
}

function renderCurrentMatchups(matchups, standings, playoffCount = 6) {
  const container = document.getElementById("curr-matchups-container");
  container.innerHTML = "";

  if (!matchups || matchups.length === 0) {
    container.innerHTML =
      "<p style='color: var(--text-muted);'>No matchups available for the current week.</p>";
    return;
  }

  // Use actual API ranks to evaluate matchup storylines
  let actualRanks = {};
  let totalTeams = 12;
  if (standings && standings.length > 0) {
    totalTeams = standings.length;
    standings.forEach((team) => {
      actualRanks[team.team] = team.actual_rank;
    });
  }

  matchups.forEach((match) => {
    let tagHtml = "";
    let borderColor = "";

    const rank1 = actualRanks[match.home];
    const rank2 = actualRanks[match.away];

    if (rank1 && rank2) {
      const minRank = Math.min(rank1, rank2);
      const maxRank = Math.max(rank1, rank2);

      if (maxRank <= 4) {
        tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #f39c12; text-align: center; margin-bottom: 8px; font-weight: 800;">🏟️ Marquee Matchup</div>`;
        borderColor = `border-top-color: #f1c40f;`;
      } else if (minRank >= playoffCount - 1 && maxRank <= playoffCount + 2) {
        tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #e74c3c; text-align: center; margin-bottom: 8px; font-weight: 800;">🎟️ Wild Card Race</div>`;
        borderColor = `border-top-color: #e74c3c;`;
      } else if (minRank >= totalTeams - 2) {
        tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #95a5a6; text-align: center; margin-bottom: 8px; font-weight: 800;">🗑️ The Cellar</div>`;
        borderColor = `border-top-color: #95a5a6;`;
      } else if (maxRank - minRank >= 8) {
        tagHtml = `<div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #3498db; text-align: center; margin-bottom: 8px; font-weight: 800;">🪨 David vs Goliath</div>`;
        borderColor = `border-top-color: #3498db;`;
      }
    }

    const awayRankStr = rank2
      ? `<span style="color:var(--text-muted); font-size:0.85rem; margin-right:4px;">#${rank2}</span>`
      : "";
    const homeRankStr = rank1
      ? `<span style="color:var(--text-muted); font-size:0.85rem; margin-right:4px;">#${rank1}</span>`
      : "";

    container.innerHTML += `
            <div class="score-card" style="display: flex; flex-direction: column; ${borderColor}">
                ${tagHtml}
                <div style="margin-top: auto;">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px; color:var(--text-main);"><span>${awayRankStr}${match.away}</span><span style="color:var(--text-muted); font-size:0.9rem;">${match.away_record}</span></div>
                    <div style="display:flex; justify-content:space-between; color:var(--text-main);"><span>${homeRankStr}${match.home}</span><span style="color:var(--text-muted); font-size:0.9rem;">${match.home_record}</span></div>
                </div>
            </div>`;
  });
}

function renderMatchupLegend() {
  const currMatchups = document.getElementById("curr-matchups-container");
  if (!currMatchups) return;

  const existingLegend = document.getElementById("matchup-legend");
  if (existingLegend) existingLegend.remove();

  const legendDiv = document.createElement("div");
  legendDiv.id = "matchup-legend";
  legendDiv.style.marginTop = "2rem";
  legendDiv.style.paddingTop = "1.5rem";
  legendDiv.style.borderTop = "1px solid var(--divider)";
  
  legendDiv.innerHTML = `
    <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--primary); text-align: center; margin-bottom: 1rem;">Matchup Tags Legend</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; justify-content: center; font-size: 0.85rem; color: var(--text-main);">
        <div style="flex: 1; min-width: 250px; max-width: 400px;">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; font-size: 0.75rem; border-bottom: 1px dashed var(--divider); padding-bottom: 4px;">Previous Matchups</h4>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #8e44ad;">💔 HEARTBREAK:</span></strong> Lost despite scoring in the top 25% of the league</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #e74c3c;">🚨 UPSET:</span></strong> Lower ranked team beat a team ranked 4+ spots higher</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #1abc9c;">🤏 NAIL-BITER:</span></strong> Loser scored 95% or more of the winner's score</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #f39c12;">💥 BLOWOUT:</span></strong> Loser scored 75% or less of the winner's score</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #2ecc71;">🍀 LUCKY WIN:</span></strong> Won despite scoring below the weekly median</div>
        </div>
        <div style="flex: 1; min-width: 250px; max-width: 400px;">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; font-size: 0.75rem; border-bottom: 1px dashed var(--divider); padding-bottom: 4px;">Current Matchups</h4>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #f39c12;">🏟️ MARQUEE MATCHUP:</span></strong> Both teams are ranked in the Top 4</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #e74c3c;">🎟️ WILD CARD RACE:</span></strong> Both teams are battling near the playoff cutline</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #95a5a6;">🗑️ THE CELLAR:</span></strong> Both teams are ranked in the bottom 3</div>
            <div style="margin-bottom: 0.5rem;"><strong><span style="color: #3498db;">🪨 DAVID VS GOLIATH:</span></strong> Matchup between teams separated by 8+ ranking spots</div>
        </div>
    </div>
  `;

  currMatchups.parentElement.appendChild(legendDiv);
}

loadLiveDashboard();
