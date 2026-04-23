// --- Theme Toggle ---
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

themeToggle.addEventListener("click", () =>
  setTheme(!document.body.classList.contains("dark-theme")),
);

// --- Live Dashboard Initializer ---
async function loadLiveDashboard() {
  try {
    const res = await fetch("data/live/mlb_current_season.json");
    const data = await res.json();

    document.getElementById("week-subtitle").innerText = `Week ${data.week}`;

    const prevWeekSpan = document.getElementById("prev-week-num");
    if (prevWeekSpan)
      prevWeekSpan.innerText = data.week > 1 ? data.week - 1 : "-";
    const currWeekSpan = document.getElementById("curr-week-num");
    if (currWeekSpan) currWeekSpan.innerText = data.week;

    renderTrueStandings(data.true_standings, data.remaining_sos);

    luckData = data.luck_quadrant;
    initLuckQuadrant();

    renderPreviousMatchups(data.previous_matchups);
    renderCurrentMatchups(
      data.current_matchups,
      data.true_standings,
      data.playoff_team_count,
    );
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

    let trendIcon = `<span style="color: var(--text-muted); font-size: 0.85rem;">-</span>`;
    if (rankDiff > 0)
      trendIcon = `<span style="color: #2ecc71; font-size: 0.85rem; font-weight: bold;" title="Actual Rank: ${actualRank}">▲${rankDiff}</span>`;
    else if (rankDiff < 0)
      trendIcon = `<span style="color: #e74c3c; font-size: 0.85rem; font-weight: bold;" title="Actual Rank: ${actualRank}">▼${Math.abs(rankDiff)}</span>`;

    const sosInfo = sosMap[team.team] || {
      ppg: "N/A",
      color: "var(--text-muted)",
    };

    tbody.innerHTML += `
            <tr>
                <td style="text-align: center; vertical-align: middle;">
                    <div style="font-size: 1.1rem; font-weight: bold;">${trueRank}</div>
                    <div>${trendIcon}</div>
                </td>
                <td><div style="display: flex; align-items: center; gap: 8px;">${logoHtml} <strong>${team.team}</strong></div></td>
                <td>${team.actual_record}</td>
                <td>${(team.true_win_pct * 100).toFixed(1)}%</td>
                <td>${team.expected_wins}</td>
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
  window.addEventListener("resize", () => luckChartInstance.resize());
}

function renderLuckQuadrant() {
  if (!luckData || luckData.length === 0) return;

  const isDark = document.body.classList.contains("dark-theme");
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
        return `<strong>${params.data.name}</strong><br/>PF: ${params.value[1]}<br/>PA: ${params.value[0]}`;
      },
    },
    grid: { left: "10%", right: "10%", bottom: "10%", top: "10%" },
    xAxis: {
      name: "Points Against (PA)",
      nameLocation: "middle",
      nameGap: 30,
      type: "value",
      scale: true,
      axisLabel: { color: mutedColor },
      nameTextStyle: { color: textColor, fontWeight: "bold" },
      splitLine: { lineStyle: { type: "dashed", color: splitLineColor } },
    },
    yAxis: {
      name: "Points For (PF)",
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
            fontSize: 22,
            fontWeight: "bold",
            position: "inside",
          },
          data: [
            [
              { name: "GOOD & LUCKY", xAxis: "min", yAxis: medianPF },
              { xAxis: medianPA, yAxis: "max" },
            ],
            [
              { name: "SCHEDULE VICTIM", xAxis: medianPA, yAxis: medianPF },
              { xAxis: "max", yAxis: "max" },
            ],
            [
              { name: "LUCKY BREAKS", xAxis: "min", yAxis: "min" },
              { xAxis: medianPA, yAxis: medianPF },
            ],
            [
              { name: "ROUGH SEASON", xAxis: medianPA, yAxis: "min" },
              { xAxis: "max", yAxis: medianPF },
            ],
          ],
        },
      },
    ],
  };
  luckChartInstance.setOption(option);
}

// --- 3. Render Matchup Center ---
function renderPreviousMatchups(matchups) {
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

    container.innerHTML += `
            <div class="score-card">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px; ${awayBold}"><span>${match.away}</span><span>${match.away_score.toFixed(1)}</span></div>
                <div style="display:flex; justify-content:space-between; ${homeBold}"><span>${match.home}</span><span>${match.home_score.toFixed(1)}</span></div>
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

loadLiveDashboard();
