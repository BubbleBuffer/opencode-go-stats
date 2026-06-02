import { Chart, BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import type { UsageRecord, ModelStats, StatsResult } from "../core/types";
import { el, formatUSD } from "./ui";
import { COST_SCALE, TPM_SCALE } from "../core/constants";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type Metric = "cost" | "tokens" | "requests" | "efficiency" | "share";

const FILL_COLORS = [
  "rgba(196, 181, 253, 0.45)",
  "rgba(221, 214, 254, 0.45)",
  "rgba(186, 230, 253, 0.42)",
  "rgba(187, 247, 208, 0.38)",
  "rgba(254, 240, 138, 0.38)",
  "rgba(254, 202, 202, 0.38)",
  "rgba(191, 219, 254, 0.42)",
  "rgba(226, 232, 240, 0.38)",
];

const STROKE_COLORS = [
  "rgba(167, 139, 250, 0.85)",
  "rgba(196, 181, 253, 0.85)",
  "rgba(125, 211, 252, 0.82)",
  "rgba(134, 239, 172, 0.78)",
  "rgba(250, 204, 21, 0.72)",
  "rgba(252, 165, 165, 0.78)",
  "rgba(147, 197, 253, 0.82)",
  "rgba(203, 213, 225, 0.72)",
];

export interface DateRange { label: string; fn: (r: UsageRecord) => boolean }

/** Returns timestamp for a date string, or NaN if invalid/empty. */
export function finiteDate(s: string | undefined | null): number {
  if (!s) return NaN;
  const d = new Date(s);
  return isFinite(d.getTime()) ? d.getTime() : NaN;
}

export const dateRanges: DateRange[] = [
  { label: "All", fn: r => !!r.timeCreated },
  { label: "Today", fn: r => {
    const ts = finiteDate(r.timeCreated);
    if (!isFinite(ts)) return false;
    const recordDate = new Date(ts);
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const recordUTC = new Date(Date.UTC(recordDate.getUTCFullYear(), recordDate.getUTCMonth(), recordDate.getUTCDate()));
    return recordUTC.getTime() === todayUTC.getTime();
  } },
  { label: "7d", fn: r => Date.now() - finiteDate(r.timeCreated) < 7 * 864e5 },
  { label: "30d", fn: r => Date.now() - finiteDate(r.timeCreated) < 30 * 864e5 },
  { label: "90d", fn: r => Date.now() - finiteDate(r.timeCreated) < 90 * 864e5 },
  { label: "1y", fn: r => Date.now() - finiteDate(r.timeCreated) < 365 * 864e5 },
];

export function renderCharts(
  allRecords: UsageRecord[],
  getStats: () => StatsResult | null,
  applyFilter: (idx: number) => void,
  target: HTMLElement,
) {
  let currentStats = getStats();
  if (!currentStats) return;

  let activeRange = 0;
  let activeMetric: Metric = "cost";
  let chartInst: any = null;

  if (!document.getElementById("oc-chart-dashboard-style")) {
    const chartStyle = el("style");
    chartStyle.id = "oc-chart-dashboard-style";
    chartStyle.textContent = `
    #oc-chart-dashboard { display: flex; flex-direction: column; gap: var(--space-4); }
    #oc-chart-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    #oc-range-control { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .oc-select-control { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-muted); font-family: var(--font-mono); font-size: var(--font-size-sm); }
    #oc-chart-controls button,
    #oc-chart-controls select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); color: var(--color-text); cursor: pointer; font-family: var(--font-mono); font-size: var(--font-size-sm); line-height: 1; min-height: 2.125rem; padding: 0 var(--space-3); }
    #oc-chart-controls button:hover,
    #oc-chart-controls select:hover { border-color: var(--color-text-muted); }
    #oc-chart-controls button.active { background: var(--color-bg); border-color: var(--color-text-muted); color: var(--color-text); }
    #oc-chart-card { border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: var(--space-8); }
    #oc-chart-canvas-wrap { height: 400px; position: relative; overflow: hidden; }
    @media (max-width: 700px) {
      #oc-chart-card { padding: var(--space-4); }
      #oc-chart-canvas-wrap { min-height: 340px; }
      .oc-select-control { width: 100%; justify-content: space-between; }
      #oc-chart-controls select { flex: 1; }
    }
  `;
    document.head.appendChild(chartStyle);
  }

  const dashboard = el("div", { id: "oc-chart-dashboard" });
  const controls = el("div", { id: "oc-chart-controls" });
  const rangeControl = el("div", { id: "oc-range-control" });
  const metricSelect = el("select") as HTMLSelectElement;
  const canvas = document.createElement("canvas");
  const chartWrap = el("div", { id: "oc-chart-canvas-wrap" });
  const chartCard = el("div", { id: "oc-chart-card" });

  canvas.id = "oc-chart-canvas";
  chartWrap.appendChild(canvas);
  chartCard.appendChild(chartWrap);

  const filterBtns = dateRanges.map((r, idx) => {
    const btn = el("button", { text: r.label });
    btn.addEventListener("click", () => {
      activeRange = idx;
      applyFilter(activeRange);
      currentStats = getStats();
      updateActiveRange();
      renderActiveChart();
    });
    rangeControl.appendChild(btn);
    return btn;
  });

  addOption(metricSelect, "cost", "Cost");
  addOption(metricSelect, "tokens", "Tokens");
  addOption(metricSelect, "requests", "Requests");
  addOption(metricSelect, "efficiency", "Efficiency");
  addOption(metricSelect, "share", "Share");
  metricSelect.value = activeMetric;
  metricSelect.addEventListener("change", () => {
    activeMetric = metricSelect.value as Metric;
    renderActiveChart();
  });
  controls.appendChild(rangeControl);
  controls.appendChild(el("label", { className: "oc-select-control" }, ["Metric", metricSelect]));
  dashboard.appendChild(controls);
  dashboard.appendChild(chartCard);
  target.appendChild(dashboard);

  updateActiveRange();
  renderActiveChart();

  function addOption(select: HTMLSelectElement, value: string, label: string) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function updateActiveRange() {
    for (let i = 0; i < filterBtns.length; i++) {
      filterBtns[i].classList.toggle("active", i === activeRange);
    }
  }

  function renderActiveChart() {
    if (!currentStats) return;
    if (chartInst) chartInst.destroy();
    try {
      if (activeMetric === "cost") chartInst = renderCostChart();
      else if (activeMetric === "tokens") chartInst = renderTokensChart();
      else if (activeMetric === "requests") chartInst = renderRequestsChart();
      else if (activeMetric === "efficiency") chartInst = renderEfficiencyChart();
      else chartInst = renderShareChart();
    } catch (e) {
      console.warn("Chart render error:", e);
    }
  }

  function filteredRecords() {
    return allRecords.filter(dateRanges[activeRange].fn);
  }

  function modelName(r: UsageRecord) {
    return r.model || "unknown";
  }

  function recordCostUSD(r: UsageRecord) {
    return (r.cost || 0) / COST_SCALE;
  }

  function recordTokenTotal(r: UsageRecord) {
    return (r.inputTokens || 0) + (r.outputTokens || 0) + (r.reasoningTokens || 0) + (r.cacheReadTokens || 0);
  }

  function modelStatsSorted(sortBy: "cost" | "efficiency" = "cost") {
    const stats = Object.values(currentStats!.modelStats);
    return stats.sort((a, b) => sortValue(b, sortBy) - sortValue(a, sortBy));
  }

  function sortValue(stats: ModelStats, sortBy: "cost" | "efficiency") {
    if (sortBy === "cost") return stats.totalCost;
    const tokens = stats.inputTokens + stats.outputTokens + stats.reasoningTokens + stats.cacheReadTokens;
    return tokens > 0 ? (stats.totalCost / COST_SCALE) / (tokens / TPM_SCALE) : 0;
  }

  function orderedModels() {
    const seen = new Set<string>();
    for (const stats of modelStatsSorted()) seen.add(stats.model);
    for (const record of filteredRecords()) seen.add(modelName(record));
    return [...seen];
  }

  function dailyBuckets() {
    const buckets: Record<string, UsageRecord[]> = {};
    for (const record of filteredRecords()) {
      const ts = finiteDate(record.timeCreated);
      if (!isFinite(ts)) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!buckets[day]) buckets[day] = [];
      buckets[day].push(record);
    }
    const days = Object.keys(buckets).sort();
    return { days, buckets };
  }

  function modelDailyDatasets(days: string[], buckets: Record<string, UsageRecord[]>, valueFor: (r: UsageRecord) => number) {
    return orderedModels().map((model, i) => ({
      label: model,
      data: days.map(day => round(buckets[day].filter(r => modelName(r) === model).reduce((sum, r) => sum + valueFor(r), 0))),
      backgroundColor: FILL_COLORS[i % FILL_COLORS.length],
      borderColor: STROKE_COLORS[i % STROKE_COLORS.length],
      borderWidth: 1,
      stack: "main",
    }));
  }

  function renderCostChart() {
    const { days, buckets } = dailyBuckets();
    const datasets = modelDailyDatasets(days, buckets, recordCostUSD);
    return new Chart(canvas, {
      type: "bar",
      data: { labels: days, datasets: datasets as any },
      options: dailyOptions("usd"),
    });
  }

  function renderTokensChart() {
    const { days, buckets } = dailyBuckets();
    return new Chart(canvas, {
      type: "bar",
      data: { labels: days, datasets: modelDailyDatasets(days, buckets, recordTokenTotal) as any },
      options: dailyOptions("tokens"),
    });
  }

  function renderRequestsChart() {
    const { days, buckets } = dailyBuckets();
    return new Chart(canvas, {
      type: "bar",
      data: { labels: days, datasets: modelDailyDatasets(days, buckets, () => 1) as any },
      options: dailyOptions("count"),
    });
  }

  function renderEfficiencyChart() {
    const stats = modelStatsSorted("efficiency").filter(s => tokenTotal(s) > 0);
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: stats.map(s => s.model),
        datasets: [{
          label: "$ / 1M Tokens",
          data: stats.map(s => round((s.totalCost / COST_SCALE) / (tokenTotal(s) / TPM_SCALE))),
          backgroundColor: FILL_COLORS[0],
          borderColor: STROKE_COLORS[0],
          borderWidth: 1,
        }],
      } as any,
      options: horizontalOptions("usd"),
    });
  }

  function renderShareChart() {
    const stats = modelStatsSorted("cost");
    const total = currentStats!.totalCostUSD;
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: stats.map(s => s.model),
        datasets: [{
          label: "Cost Share",
          data: stats.map(s => total > 0 ? round(((s.totalCost / COST_SCALE) / total) * 100) : 0),
          backgroundColor: FILL_COLORS[1],
          borderColor: STROKE_COLORS[1],
          borderWidth: 1,
          costUSD: stats.map(s => s.totalCost / COST_SCALE),
        }],
      } as any,
      options: horizontalOptions("percent"),
    });
  }

  function tokenTotal(stats: ModelStats) {
    return stats.inputTokens + stats.outputTokens + stats.reasoningTokens + stats.cacheReadTokens;
  }

  function dailyOptions(unit: "usd" | "tokens" | "count") {
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      interaction: { mode: "index", intersect: false },
      plugins: commonPlugins(unit),
      scales: {
        x: { stacked: true, ticks: tickStyle({ maxTicksLimit: 12 }), grid: { display: false }, border: { color: chartColor("border") } },
        y: { stacked: true, ticks: tickStyle({ callback: tickFormatter(unit) }), grid: { color: chartColor("grid") }, border: { color: chartColor("border") } },
      },
    } as any;
  }

  function horizontalOptions(unit: "usd" | "percent") {
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      indexAxis: "y",
      plugins: commonPlugins(unit),
      scales: {
        x: { ticks: tickStyle({ callback: tickFormatter(unit) }), grid: { color: chartColor("grid") }, border: { color: chartColor("border") } },
        y: { ticks: tickStyle(), grid: { display: false }, border: { color: chartColor("border") } },
      },
    } as any;
  }

  function commonPlugins(unit: "usd" | "tokens" | "count" | "percent") {
    return {
      legend: {
        position: "bottom",
        labels: {
          color: chartColor("muted"),
          boxHeight: 10,
          boxWidth: 18,
          padding: 16,
          font: { family: fontFamily(), size: 12 },
        },
      },
      tooltip: {
        filter: (item: any) => Number(item.raw || 0) !== 0,
        callbacks: {
          label: (ctx: any) => tooltipLabel(ctx, unit),
        },
      },
    };
  }

  function tooltipLabel(ctx: any, unit: "usd" | "tokens" | "count" | "percent") {
    const label = ctx.dataset.label || "Value";
    const value = Number(ctx.raw || 0);
    if (unit === "usd") return label + ": " + formatUSD(value, value >= 10 ? 2 : 4);
    if (unit === "tokens") return label + ": " + Math.round(value).toLocaleString() + " tokens";
    if (unit === "count") return label + ": " + Math.round(value).toLocaleString() + " requests";
    const costUSD = Array.isArray(ctx.dataset.costUSD) ? ctx.dataset.costUSD[ctx.dataIndex] : null;
    return label + ": " + value.toFixed(1) + "%" + (typeof costUSD === "number" ? " (" + formatUSD(costUSD) + ")" : "");
  }

  function tickStyle(extra: Record<string, any> = {}) {
    return {
      color: chartColor("muted"),
      font: { family: fontFamily(), size: 11 },
      ...extra,
    };
  }

  function tickFormatter(unit: "usd" | "tokens" | "count" | "percent") {
    return (v: number | string) => {
      const value = Number(v);
      if (unit === "usd") return "$" + compactNumber(value);
      if (unit === "tokens") return compactNumber(value);
      if (unit === "percent") return value + "%";
      return compactNumber(value);
    };
  }

  function compactNumber(value: number) {
    if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
    if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + "K";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function round(value: number) {
    return +value.toFixed(6);
  }

  function fontFamily() {
    return cssVar("--font-mono") || "IBM Plex Mono, monospace";
  }

  function chartColor(kind: "muted" | "grid" | "border") {
    if (kind === "muted") return cssVar("--color-text-muted") || "#6b7280";
    if (kind === "grid") return cssVar("--color-border-muted") || "rgba(148, 163, 184, 0.25)";
    return cssVar("--color-border") || "rgba(148, 163, 184, 0.45)";
  }

  function cssVar(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
}
