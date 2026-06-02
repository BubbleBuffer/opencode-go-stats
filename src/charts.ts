import type { UsageRecord, ModelStats, ModelPrices, StatsResult } from "./types";
import { el } from "./ui";

const COLORS = ["#007aff","#ff9f0a","#30d158","#ff375f","#5e5ce6","#64d2ff","#ffd60a","#bf5af2","#ff6482","#32d74b"];

export interface DateRange { label: string; fn: (r: UsageRecord) => boolean }

export const dateRanges: DateRange[] = [
  { label: "All", fn: r => !!r.timeCreated },
  { label: "Today", fn: r => new Date(r.timeCreated!).toDateString() === new Date().toDateString() },
  { label: "7d", fn: r => Date.now() - new Date(r.timeCreated!).getTime() < 7 * 864e5 },
  { label: "30d", fn: r => Date.now() - new Date(r.timeCreated!).getTime() < 30 * 864e5 },
  { label: "90d", fn: r => Date.now() - new Date(r.timeCreated!).getTime() < 90 * 864e5 },
  { label: "1y", fn: r => Date.now() - new Date(r.timeCreated!).getTime() < 365 * 864e5 },
];

export async function loadChartJS(): Promise<any> {
  if ((window as any).Chart) return (window as any).Chart;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = () => resolve((window as any).Chart);
    s.onerror = () => { console.warn("[oc-stats] failed to load Chart.js from CDN"); resolve(null); };
    document.head.appendChild(s);
  });
}

export function renderCharts(
  allRecords: UsageRecord[],
  getStats: () => StatsResult | null,
  applyFilter: (idx: number) => void,
  target: HTMLElement,
) {
  const $Chart = (window as any).Chart;
  if (!$Chart) return;

  let currentStats = getStats();
  if (!currentStats) return;

  let activeRange = 0;

  const filterBar = el("div", { id: "oc-filter-bar" });
  const fStyle = el("style");
  fStyle.textContent = `
    #oc-filter-bar { display: flex; gap: var(--space-1); margin-bottom: var(--space-3); }
    #oc-filter-bar button { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); color: var(--color-text-muted); cursor: pointer; padding: var(--space-1) var(--space-2-5); font-size: var(--font-size-xs); font-family: var(--font-sans); }
    #oc-filter-bar button:hover { color: var(--color-text); border-color: var(--color-accent); }
    #oc-filter-bar button.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
  `;
  document.head.appendChild(fStyle);

  const filterBtns = dateRanges.map(r => {
    const btn = el("button", { text: r.label });
    btn.addEventListener("click", () => {
      activeRange = dateRanges.indexOf(r);
      applyFilter(activeRange);
      currentStats = getStats();
      showChart(chartIdx);
      updateActiveBtn();
    });
    filterBar.appendChild(btn);
    return btn;
  });

  function updateActiveBtn() {
    for (let i = 0; i < filterBtns.length; i++) {
      filterBtns[i].classList.toggle("active", i === activeRange);
    }
  }
  updateActiveBtn();

  const navStyle = el("style");
  navStyle.textContent = `
    #oc-chart-nav { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
    #oc-chart-nav button { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); color: var(--color-text); cursor: pointer; padding: var(--space-1-5) var(--space-3); font-size: var(--font-size-sm); }
    #oc-chart-nav button:hover { border-color: var(--color-accent); }
    #oc-chart-nav button:disabled { opacity: 0.3; cursor: default; }
    #oc-chart-label { flex: 1; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); font-family: var(--font-sans); }
  `;
  document.head.appendChild(navStyle);

  const nav = el("div", { id: "oc-chart-nav" });
  const prevBtn = el("button", { text: "\u2190" });
  const nextBtn = el("button", { text: "\u2192" });
  const label = el("span", { id: "oc-chart-label" });
  nav.appendChild(prevBtn);
  nav.appendChild(label);
  nav.appendChild(nextBtn);

  const canvas = document.createElement("canvas");
  canvas.id = "oc-chart-canvas";
  const chartWrap = el("div");
  chartWrap.style.cssText = "height:400px;position:relative";
  chartWrap.appendChild(canvas);

  const chartSection = el("div", { id: "opencode-stats-section" });
  chartSection.appendChild(filterBar);
  chartSection.appendChild(nav);
  chartSection.appendChild(chartWrap);

  (target as HTMLElement).appendChild(chartSection);

  let chartIdx = 0;
  let chartInst: any = null;

  function renderCostByModel() {
    const s = currentStats!;
    const byModel = Object.entries(s.modelStats).sort((a, b) => b[1].totalCost - a[1].totalCost);
    const ep = s.modelPrices;
    return new $Chart(canvas, {
      type: "bar",
      data: {
        labels: byModel.map(([m]) => m),
        datasets: [
          { label: "Input", data: byModel.map(([m, sm]) => +((sm.inputTokens / 1e6) * (ep[m]?.inputTokens || 0)).toFixed(6)), backgroundColor: COLORS[0] },
          { label: "Output", data: byModel.map(([m, sm]) => +((sm.outputTokens / 1e6) * (ep[m]?.outputTokens || 0)).toFixed(6)), backgroundColor: COLORS[1] },
          { label: "Cache Rd", data: byModel.map(([m, sm]) => +((sm.cacheReadTokens / 1e6) * (ep[m]?.cacheReadTokens || 0)).toFixed(6)), backgroundColor: COLORS[3] },
          { label: "Actual", data: byModel.map(([, sm]) => +(sm.totalCost / 1e8).toFixed(6)), type: "line", borderColor: COLORS[4], borderWidth: 2, pointRadius: 4, pointBackgroundColor: COLORS[4], fill: false, tension: 0.1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: {
          legend: { position: "bottom", labels: { color: "#a1a1a6", font: { family: "IBM Plex Mono", size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const [, sm] = byModel[ctx.dataIndex];
                if (ctx.dataset.label === "Actual")
                  return "Actual: $" + (+ctx.raw).toFixed(4) + " | " + sm.requests + " reqs | " + (sm.inputTokens + sm.outputTokens).toLocaleString() + " tok";
                return ctx.dataset.label + ": $" + (+ctx.raw).toFixed(4);
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: "#6e6e73", callback: (v: any) => "$" + v }, grid: { color: "#2c2c2e" } },
          y: { stacked: true, ticks: { color: "#a1a1a6", font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderDailyCost() {
    const s = currentStats!;
    const models = Object.keys(s.modelStats);
    const filtered = allRecords.filter(dateRanges[activeRange].fn);

    const daily: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      if (!r.timeCreated) continue;
      const d = new Date(r.timeCreated).toISOString().slice(0, 10);
      if (!daily[d]) daily[d] = {};
      daily[d][r.model!] = (daily[d][r.model!] || 0) + (r.cost || 0) / 1e8;
    }
    const days = Object.keys(daily).sort();

    const cumLine: number[] = [];
    let c = 0;
    for (const d of days) {
      for (const m of models) c += daily[d]?.[m] || 0;
      cumLine.push(+c.toFixed(6));
    }

    return new $Chart(canvas, {
      type: "bar",
      data: {
        labels: days,
        datasets: [
          ...models.map((m, i) => ({
            label: m,
            data: days.map(d => +(daily[d]?.[m] || 0).toFixed(6)),
            backgroundColor: COLORS[i % COLORS.length],
            stack: "cost",
          })),
          { label: "Cumulative", data: cumLine, type: "line", borderColor: "#ffffff", backgroundColor: "#ffffff22", borderWidth: 2, fill: true, pointRadius: 0, tension: 0.1, yAxisID: "y1", stack: "cum" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#a1a1a6", font: { family: "IBM Plex Mono", size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                if (ctx.dataset.yAxisID === "y1") return "Total: $" + (+ctx.raw).toFixed(2);
                const dayTotal = days.length ? models.reduce((sum: number, m: string) => sum + (daily[days[ctx.dataIndex]]?.[m] || 0), 0) : 0;
                return ctx.dataset.label + ": $" + (+ctx.raw).toFixed(4) + (dayTotal > 0 ? " (" + ((+ctx.raw / dayTotal) * 100).toFixed(0) + "% of day)" : "");
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: "#6e6e73", maxTicksLimit: 14, font: { size: 9 } }, grid: { display: false } },
          y: { stacked: true, position: "left", ticks: { color: "#6e6e73", callback: (v: any) => "$" + v }, grid: { color: "#2c2c2e" } },
          y1: { position: "right", ticks: { color: "#ffffff", callback: (v: any) => "$" + v.toFixed(2) }, grid: { display: false } },
        },
      },
    });
  }

  function renderCostShare() {
    const s = currentStats!;
    const sorted = Object.entries(s.modelStats).sort((a, b) => b[1].totalCost - a[1].totalCost);
    return new $Chart(canvas, {
      type: "doughnut",
      data: {
        labels: sorted.map(([m]) => m),
        datasets: [{
          data: sorted.map(([, sm]) => +(sm.totalCost / 1e8).toFixed(6)),
          backgroundColor: COLORS,
          borderColor: "#0c0c0e",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#a1a1a6", font: { family: "IBM Plex Mono", size: 11 }, padding: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const [, sm] = sorted[ctx.dataIndex];
                const pct = s.totalCostUSD > 0 ? ((ctx.raw / s.totalCostUSD) * 100).toFixed(1) : "0";
                const tok = (sm.inputTokens + sm.outputTokens + sm.reasoningTokens + sm.cacheReadTokens).toLocaleString();
                return ctx.label + ": $" + (+ctx.raw).toFixed(4) + " (" + pct + "%) | " + tok + " tok | " + sm.requests + " reqs";
              },
            },
          },
        },
      },
    });
  }

  const charts = [
    { name: "Cost by Model", render: renderCostByModel },
    { name: "Daily Cost + Cumulative", render: renderDailyCost },
    { name: "Cost Share", render: renderCostShare },
  ];

  function showChart(i: number) {
    if (chartInst) chartInst.destroy();
    try { chartInst = charts[i].render(); } catch (e) { console.warn("Chart render error:", e); }
    label.textContent = charts[i].name;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === charts.length - 1;
    chartIdx = i;
  }

  prevBtn.addEventListener("click", () => { if (chartIdx > 0) showChart(chartIdx - 1); });
  nextBtn.addEventListener("click", () => { if (chartIdx < charts.length - 1) showChart(chartIdx + 1); });
  showChart(0);
}
