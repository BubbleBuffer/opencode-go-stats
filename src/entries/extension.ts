import type { StatsResult } from "../packages/core/types";
import { computeStats } from "../packages/stats/stats";
import { showLoading, injectBaseStyles, buildPricingTable, buildSummaryTable } from "../packages/ui/ui";
import { renderCharts, dateRanges } from "../packages/ui/charts";
import { runPipeline } from "../packages/pipeline/pipeline";
import { loadCache } from "../packages/cache/cache";
import { Chart } from "chart.js";

let currentAbort: AbortController | null = null;

function cleanup() {
  const canvas = document.getElementById("oc-chart-canvas") as HTMLCanvasElement | null;
  if (canvas) {
    const chart = Chart.getChart(canvas);
    if (chart) chart.destroy();
  }
  document.getElementById("opencode-stats-root")?.remove();
  document.getElementById("opencode-stats-css")?.remove();
  document.getElementById("oc-chart-dashboard-style")?.remove();
  document.getElementById("oc-chart-dashboard")?.remove();
  const filterContainer = document.querySelector('[data-slot="filter-container"]');
  if (filterContainer) (filterContainer as HTMLElement).style.display = "";
}

function isUsagePage(): boolean {
  return /^\/workspace\/[^/]+\/usage$/.test(window.location.pathname);
}

async function waitForEl(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return null;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) return el;
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  if (!isUsagePage()) return;

  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();
  const signal = currentAbort.signal;

  cleanup();

  const WS_ID = window.location.pathname.split("/")[2];
  if (!WS_ID || WS_ID === "") {
    console.error("[oc-stats] Cannot determine workspace ID from URL. Make sure you are on an opencode.ai workspace page.");
    return;
  }

  const CACHE_KEY = `opencode_ext_stats_v3_${WS_ID}`;

  injectBaseStyles();

  const filterContainer = document.querySelector('[data-slot="filter-container"]');
  if (filterContainer) (filterContainer as HTMLElement).style.display = "none";

  const sections = await waitForEl('[data-slot="sections"]', 5000, signal);
  if (!sections) return;
  if (signal.aborted) return;

  const cache = loadCache(CACHE_KEY);

  const root = showLoading();
  const usageSection = sections.querySelector('[data-slot="usage-table"]')?.closest("section");
  if (usageSection) sections.insertBefore(root, usageSection);
  else sections.appendChild(root);

  if (signal.aborted) return;

  let allRecords = cache.records;

  let currentStats: StatsResult | null = null;

  function applyFilter(rangeIdx: number) {
    const rng = dateRanges[rangeIdx];
    const filtered = allRecords.filter(rng.fn);
    currentStats = computeStats(filtered);

    root.innerHTML = "";
    root.appendChild(buildPricingTable(currentStats.modelPrices));
    root.appendChild(buildSummaryTable(
      currentStats.modelStats,
      currentStats.modelPrices,
      currentStats.totalTokens,
      currentStats.totalCostUSD,
    ));
  }

  function getStats(): StatsResult | null {
    return currentStats;
  }

  let chartHandle: { refreshData: () => void } | null = null;
  let chartRenderSeq = 0;

  async function ensureCharts() {
    if (chartHandle) {
      chartHandle.refreshData();
      return;
    }

    const seq = ++chartRenderSeq;
    document.getElementById("oc-chart-dashboard")?.remove();
    document.getElementById("oc-chart-dashboard-style")?.remove();
    const pageChart = await waitForEl('[data-slot="chart-container"]', 5000, signal);
    if (!pageChart || signal.aborted) return;
    if (seq !== chartRenderSeq) return;
    pageChart.innerHTML = "";
    pageChart.style.cssText = "height:auto;min-height:auto";
    chartHandle = renderCharts(() => allRecords, getStats, applyFilter, pageChart);
  }

  const hasCache = allRecords.length > 0;

  if (hasCache) {
    applyFilter(0);
    ensureCharts();
  }

  runPipeline(WS_ID, CACHE_KEY).then(updated => {
    if (signal.aborted) return;

    console.log("Total records:", updated.length);

    if (updated.length === 0) {
      if (!hasCache) root.querySelector("p")!.textContent = "No usage data found.";
      return;
    }

    allRecords = updated;
    applyFilter(0);
    ensureCharts();
  }).catch(e => {
    console.error("[oc-stats] Pipeline error:", e);
  });
}

function watchNavigation() {
  let lastPath = window.location.pathname;

  const check = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      if (isUsagePage()) {
        main().catch(e => { console.error("[oc-stats] Error:", e); });
      } else {
        cleanup();
      }
    }
  };

  window.addEventListener("popstate", check);

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  (history as any).pushState = function (data: any, unused: string, url?: string | URL | null) {
    origPush(data, unused, url);
    check();
  };

  (history as any).replaceState = function (data: any, unused: string, url?: string | URL | null) {
    origReplace(data, unused, url);
    check();
  };

  return check;
}

const check = watchNavigation();
main().catch(e => { console.error("[oc-stats] Fatal extension:", e); });
