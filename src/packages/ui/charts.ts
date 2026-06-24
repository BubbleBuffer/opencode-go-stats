import { Chart, BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import type { UsageRecord, ModelStats, StatsResult } from "../core/types";
import { el, formatUSD } from "./ui";
import { COST_SCALE, TPM_SCALE } from "../core/constants";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type Metric = "spend" | "requests" | "costPerRequest" | "tokensPerRequest" | "tokenMix";
type SortDirection = "asc" | "desc";
export type CostPerRequestRank = "costPerRequest" | "totalCost" | "requests" | "pricePerMillion" | "avgTokens";
export type TokensPerRequestRank = "total" | "input" | "output" | "reasoning" | "cacheRead";
export type TokenMixRank = "totalTokens" | "inputShare" | "outputShare" | "reasoningShare" | "cacheReadShare" | "cost";
export type TokenMixMode = "percent" | "absolute";

export interface CostPerRequestRow {
  model: string;
  value: number;
  costPerRequest: number;
  totalCostUSD: number;
  requests: number;
  pricePerMillion: number;
  avgTokensPerRequest: number;
}

export interface TokensPerRequestRow {
  model: string;
  value: number;
  totalAvg: number;
  inputAvg: number;
  outputAvg: number;
  reasoningAvg: number;
  cacheReadAvg: number;
}

export interface TokenMixSegment {
  label: "Input" | "Output" | "Reasoning" | "Cache read";
  value: number;
}

export interface TokenMixRow {
  model: string;
  totalTokens: number;
  totalCostUSD: number;
  inputShare: number;
  outputShare: number;
  reasoningShare: number;
  cacheReadShare: number;
  segments: TokenMixSegment[];
}

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

export function buildCostPerRequestRows(
  stats: ModelStats[],
  rankBy: CostPerRequestRank,
  direction: SortDirection,
): CostPerRequestRow[] {
  const rows = stats.map(s => {
    const totalTokens = tokenTotal(s);
    const totalCostUSD = s.totalCost / COST_SCALE;
    const costPerRequest = safeDivide(totalCostUSD, s.requests);
    const pricePerMillion = safeDivide(totalCostUSD, totalTokens / TPM_SCALE);
    const avgTokensPerRequest = safeDivide(totalTokens, s.requests);
    const row: CostPerRequestRow = {
      model: s.model,
      value: 0,
      costPerRequest: round(costPerRequest, 10),
      totalCostUSD: round(totalCostUSD, 10),
      requests: s.requests,
      pricePerMillion: round(pricePerMillion, 10),
      avgTokensPerRequest: round(avgTokensPerRequest),
    };
    row.value = round(costPerRequestSortValue(row, rankBy), costRankPrecision(rankBy));
    return row;
  });
  return sortRows(rows, row => costPerRequestSortValue(row, rankBy), direction);
}

export function buildTokensPerRequestRows(
  stats: ModelStats[],
  rankBy: TokensPerRequestRank,
  direction: SortDirection,
): TokensPerRequestRow[] {
  const rows = stats.map(s => {
    const inputAvg = safeDivide(s.inputTokens, s.requests);
    const outputAvg = safeDivide(s.outputTokens, s.requests);
    const reasoningAvg = safeDivide(s.reasoningTokens, s.requests);
    const cacheReadAvg = safeDivide(s.cacheReadTokens, s.requests);
    const totalAvg = inputAvg + outputAvg + reasoningAvg + cacheReadAvg;
    const rankValues = { totalAvg, inputAvg, outputAvg, reasoningAvg, cacheReadAvg };
    return {
      model: s.model,
      value: round(tokensPerRequestSortValue(rankValues, rankBy)),
      totalAvg: round(totalAvg),
      inputAvg: round(inputAvg),
      outputAvg: round(outputAvg),
      reasoningAvg: round(reasoningAvg),
      cacheReadAvg: round(cacheReadAvg),
    };
  });
  return sortRows(rows, row => tokensPerRequestSortValue(row, rankBy), direction);
}

export function buildTokenMixRows(
  stats: ModelStats[],
  rankBy: TokenMixRank,
  direction: SortDirection,
  mode: TokenMixMode,
): TokenMixRow[] {
  const rows = stats.map(s => {
    const totalTokens = tokenTotal(s);
    const totalCostUSD = s.totalCost / COST_SCALE;
    const inputShare = percent(s.inputTokens, totalTokens);
    const outputShare = percent(s.outputTokens, totalTokens);
    const reasoningShare = percent(s.reasoningTokens, totalTokens);
    const cacheReadShare = percent(s.cacheReadTokens, totalTokens);
    const segmentValue = (tokens: number, share: number) => mode === "percent" ? share : tokens;
    const segments: TokenMixSegment[] = [
      { label: "Input", value: round(segmentValue(s.inputTokens, inputShare)) },
      { label: "Output", value: round(segmentValue(s.outputTokens, outputShare)) },
      { label: "Reasoning", value: round(segmentValue(s.reasoningTokens, reasoningShare)) },
      { label: "Cache read", value: round(segmentValue(s.cacheReadTokens, cacheReadShare)) },
    ];
    return {
      model: s.model,
      totalTokens,
      totalCostUSD: round(totalCostUSD),
      inputShare,
      outputShare,
      reasoningShare,
      cacheReadShare,
      segments,
    };
  });
  return sortRows(rows, row => tokenMixSortValue(row, rankBy), direction);
}

function tokenTotal(stats: ModelStats) {
  return stats.inputTokens + stats.outputTokens + stats.reasoningTokens + stats.cacheReadTokens;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percent(part: number, total: number) {
  return round(safeDivide(part, total) * 100);
}

function sortRows<T extends { model: string }>(rows: T[], valueFor: (row: T) => number, direction: SortDirection): T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = (valueFor(a) - valueFor(b)) * multiplier;
    return diff || a.model.localeCompare(b.model);
  });
}

function costPerRequestSortValue(row: CostPerRequestRow, rankBy: CostPerRequestRank) {
  if (rankBy === "totalCost") return row.totalCostUSD;
  if (rankBy === "requests") return row.requests;
  if (rankBy === "pricePerMillion") return row.pricePerMillion;
  if (rankBy === "avgTokens") return row.avgTokensPerRequest;
  return row.costPerRequest;
}

function costRankPrecision(rankBy: CostPerRequestRank) {
  return rankBy === "costPerRequest" || rankBy === "totalCost" || rankBy === "pricePerMillion" ? 10 : 6;
}

function tokensPerRequestSortValue(row: Pick<TokensPerRequestRow, "totalAvg" | "inputAvg" | "outputAvg" | "reasoningAvg" | "cacheReadAvg">, rankBy: TokensPerRequestRank) {
  if (rankBy === "input") return row.inputAvg;
  if (rankBy === "output") return row.outputAvg;
  if (rankBy === "reasoning") return row.reasoningAvg;
  if (rankBy === "cacheRead") return row.cacheReadAvg;
  return row.totalAvg;
}

function tokenMixSortValue(row: TokenMixRow, rankBy: TokenMixRank) {
  if (rankBy === "inputShare") return row.inputShare;
  if (rankBy === "outputShare") return row.outputShare;
  if (rankBy === "reasoningShare") return row.reasoningShare;
  if (rankBy === "cacheReadShare") return row.cacheReadShare;
  if (rankBy === "cost") return row.totalCostUSD;
  return row.totalTokens;
}

function round(value: number, precision = 6) {
  return +value.toFixed(precision);
}

export function renderCharts(
  getAllRecords: () => UsageRecord[],
  getStats: () => StatsResult | null,
  applyFilter: (idx: number) => void,
  target: HTMLElement,
): { refreshData: () => void } {
  let currentStats = getStats();
  if (!currentStats) return { refreshData: () => {} };

  let activeRange = 0;
  let activeMetric: Metric = "spend";
  let sortDirection: SortDirection = "desc";
  let costPerRequestRank: CostPerRequestRank = "costPerRequest";
  let tokensPerRequestRank: TokensPerRequestRank = "total";
  let tokenMixRank: TokenMixRank = "totalTokens";
  let tokenMixMode: TokenMixMode = "percent";
  let chartInst: any = null;

  if (!document.getElementById("oc-chart-dashboard-style")) {
    const chartStyle = el("style");
    chartStyle.id = "oc-chart-dashboard-style";
    chartStyle.textContent = `
    #oc-chart-dashboard { display: flex; flex-direction: column; gap: var(--space-4); }
    #oc-chart-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    #oc-chart-options { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
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
      #oc-chart-options { width: 100%; }
    }
  `;
    document.head.appendChild(chartStyle);
  }

  const dashboard = el("div", { id: "oc-chart-dashboard" });
  const controls = el("div", { id: "oc-chart-controls" });
  const rangeControl = el("div", { id: "oc-range-control" });
  const chartOptions = el("div", { id: "oc-chart-options" });
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

  addOption(metricSelect, "spend", "Spend Over Time");
  addOption(metricSelect, "requests", "Requests");
  addOption(metricSelect, "costPerRequest", "Cost / Request");
  addOption(metricSelect, "tokensPerRequest", "Avg Tokens / Request");
  addOption(metricSelect, "tokenMix", "Token Mix");
  metricSelect.value = activeMetric;
  metricSelect.addEventListener("change", () => {
    activeMetric = metricSelect.value as Metric;
    currentStats = getStats();
    renderChartOptions();
    renderActiveChart();
  });
  controls.appendChild(rangeControl);
  controls.appendChild(el("label", { className: "oc-select-control" }, ["Metric", metricSelect]));
  controls.appendChild(chartOptions);
  dashboard.appendChild(controls);
  dashboard.appendChild(chartCard);
  target.appendChild(dashboard);

  updateActiveRange();
  renderChartOptions();
  renderActiveChart();

  function refreshData() {
    currentStats = getStats();
    if (!currentStats || !chartInst) return;

    try {
      let data: any;

      if (activeMetric === "spend") {
        const { days, buckets } = dailyBuckets();
        data = { labels: days, datasets: modelDailyDatasets(days, buckets, recordCostUSD) };
      } else if (activeMetric === "requests") {
        const { days, buckets } = dailyBuckets();
        data = { labels: days, datasets: modelDailyDatasets(days, buckets, () => 1) };
      } else if (activeMetric === "costPerRequest") {
        data = costPerRequestData();
      } else if (activeMetric === "tokensPerRequest") {
        data = tokensPerRequestData();
      } else {
        data = tokenMixData();
      }

      chartInst.data = data;
      chartInst.update("none");
    } catch (e) {
      console.warn("Chart refresh error:", e);
    }
  }

  return { refreshData };

  function addOption(select: HTMLSelectElement, value: string, label: string) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function renderChartOptions() {
    chartOptions.replaceChildren();
    if (activeMetric === "costPerRequest") {
      chartOptions.appendChild(selectControl("Rank by", costPerRequestRank, [
        ["costPerRequest", "Cost/request"],
        ["totalCost", "Total cost"],
        ["requests", "Requests"],
        ["pricePerMillion", "$/1M tokens"],
        ["avgTokens", "Avg tokens/request"],
      ], value => { costPerRequestRank = value as CostPerRequestRank; }));
      chartOptions.appendChild(directionControl());
    } else if (activeMetric === "tokensPerRequest") {
      chartOptions.appendChild(selectControl("Rank by", tokensPerRequestRank, [
        ["total", "Total avg"],
        ["input", "Input avg"],
        ["output", "Output avg"],
        ["reasoning", "Reasoning avg"],
        ["cacheRead", "Cache-read avg"],
      ], value => { tokensPerRequestRank = value as TokensPerRequestRank; }));
      chartOptions.appendChild(directionControl());
    } else if (activeMetric === "tokenMix") {
      chartOptions.appendChild(selectControl("Mode", tokenMixMode, [
        ["percent", "Percent"],
        ["absolute", "Absolute"],
      ], value => { tokenMixMode = value as TokenMixMode; }));
      chartOptions.appendChild(selectControl("Rank by", tokenMixRank, [
        ["totalTokens", "Total tokens"],
        ["inputShare", "Input share"],
        ["outputShare", "Output share"],
        ["reasoningShare", "Reasoning share"],
        ["cacheReadShare", "Cache-read share"],
        ["cost", "Cost"],
      ], value => { tokenMixRank = value as TokenMixRank; }));
      chartOptions.appendChild(directionControl());
    }
  }

  function selectControl(
    label: string,
    currentValue: string,
    options: [string, string][],
    onChange: (value: string) => void,
  ) {
    const select = el("select") as HTMLSelectElement;
    for (const [value, text] of options) addOption(select, value, text);
    select.value = currentValue;
    select.addEventListener("change", () => {
      onChange(select.value);
      currentStats = getStats();
      renderActiveChart();
    });
    return el("label", { className: "oc-select-control" }, [label, select]);
  }

  function directionControl() {
    return selectControl("Direction", sortDirection, [
      ["desc", "High first"],
      ["asc", "Low first"],
    ], value => { sortDirection = value as SortDirection; });
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
      if (activeMetric === "spend") chartInst = renderSpendChart();
      else if (activeMetric === "requests") chartInst = renderRequestsChart();
      else if (activeMetric === "costPerRequest") chartInst = renderCostPerRequestChart();
      else if (activeMetric === "tokensPerRequest") chartInst = renderTokensPerRequestChart();
      else chartInst = renderTokenMixChart();
    } catch (e) {
      console.warn("Chart render error:", e);
    }
  }

  function filteredRecords() {
    return getAllRecords().filter(dateRanges[activeRange].fn);
  }

  function modelName(r: UsageRecord) {
    return r.model || "unknown";
  }

  function recordCostUSD(r: UsageRecord) {
    return (r.cost || 0) / COST_SCALE;
  }

  function modelStats() {
    return Object.values(currentStats!.modelStats);
  }

  function modelStatsSorted() {
    const stats = Object.values(currentStats!.modelStats);
    return stats.sort((a, b) => b.totalCost - a.totalCost);
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

  function renderSpendChart() {
    const { days, buckets } = dailyBuckets();
    const datasets = modelDailyDatasets(days, buckets, recordCostUSD);
    return new Chart(canvas, {
      type: "bar",
      data: { labels: days, datasets: datasets as any },
      options: dailyOptions("usd"),
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

  function renderCostPerRequestChart() {
    return new Chart(canvas, {
      type: "bar",
      data: costPerRequestData() as any,
      options: horizontalOptions("usdPerRequest"),
    });
  }

  function renderTokensPerRequestChart() {
    return new Chart(canvas, {
      type: "bar",
      data: tokensPerRequestData() as any,
      options: horizontalOptions("tokens", true),
    });
  }

  function renderTokenMixChart() {
    return new Chart(canvas, {
      type: "bar",
      data: tokenMixData() as any,
      options: horizontalOptions(tokenMixMode === "percent" ? "percent" : "tokens", true),
    });
  }

  function costPerRequestData() {
    const rows = buildCostPerRequestRows(modelStats(), costPerRequestRank, sortDirection);
    return {
      labels: rows.map(r => r.model),
      datasets: [{
        label: "$ / Request",
        data: rows.map(r => r.costPerRequest),
        backgroundColor: FILL_COLORS[0],
        borderColor: STROKE_COLORS[0],
        borderWidth: 1,
      }],
    };
  }

  function tokensPerRequestData() {
    const rows = buildTokensPerRequestRows(modelStats(), tokensPerRequestRank, sortDirection);
    return stackedTokenData(rows.map(r => r.model), [
      ["Input", rows.map(r => r.inputAvg)],
      ["Output", rows.map(r => r.outputAvg)],
      ["Reasoning", rows.map(r => r.reasoningAvg)],
      ["Cache read", rows.map(r => r.cacheReadAvg)],
    ]);
  }

  function tokenMixData() {
    const rows = buildTokenMixRows(modelStats(), tokenMixRank, sortDirection, tokenMixMode);
    return stackedTokenData(rows.map(r => r.model), [
      ["Input", rows.map(r => r.segments[0].value)],
      ["Output", rows.map(r => r.segments[1].value)],
      ["Reasoning", rows.map(r => r.segments[2].value)],
      ["Cache read", rows.map(r => r.segments[3].value)],
    ]);
  }

  function stackedTokenData(labels: string[], series: [string, number[]][]) {
    return {
      labels,
      datasets: series.map(([label, data], i) => ({
        label,
        data,
        backgroundColor: FILL_COLORS[i % FILL_COLORS.length],
        borderColor: STROKE_COLORS[i % STROKE_COLORS.length],
        borderWidth: 1,
        stack: "main",
      })),
    };
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

  function horizontalOptions(unit: "usd" | "tokens" | "percent" | "usdPerRequest", stacked = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      indexAxis: "y",
      plugins: commonPlugins(unit),
      scales: {
        x: { stacked, ticks: tickStyle({ callback: tickFormatter(unit) }), grid: { color: chartColor("grid") }, border: { color: chartColor("border") } },
        y: { ticks: tickStyle(), grid: { display: false }, border: { color: chartColor("border") } },
      },
    } as any;
  }

  function commonPlugins(unit: "usd" | "tokens" | "count" | "percent" | "usdPerRequest") {
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

  function tooltipLabel(ctx: any, unit: "usd" | "tokens" | "count" | "percent" | "usdPerRequest") {
    const label = ctx.dataset.label || "Value";
    const value = Number(ctx.raw || 0);
    if (unit === "usd") return label + ": " + formatUSD(value, value >= 10 ? 2 : 4);
    if (unit === "usdPerRequest") return label + ": " + formatUSD(value, value >= 10 ? 2 : 4) + "/request";
    if (unit === "tokens") return label + ": " + Math.round(value).toLocaleString() + " tokens";
    if (unit === "count") return label + ": " + Math.round(value).toLocaleString() + " requests";
    return label + ": " + value.toFixed(1) + "%";
  }

  function tickStyle(extra: Record<string, any> = {}) {
    return {
      color: chartColor("muted"),
      font: { family: fontFamily(), size: 11 },
      ...extra,
    };
  }

  function tickFormatter(unit: "usd" | "tokens" | "count" | "percent" | "usdPerRequest") {
    return (v: number | string) => {
      const value = Number(v);
      if (unit === "usd" || unit === "usdPerRequest") return "$" + compactNumber(value);
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
