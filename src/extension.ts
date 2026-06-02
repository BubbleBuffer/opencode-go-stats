import type { UsageRecord, StatsResult } from "./types";
import { fetchPage } from "./parse";
import { computeStats } from "./stats";
import { loadCache, saveCache, mergeAndSort } from "./cache";
import { showLoading, injectBaseStyles, buildPricingTable, buildSummaryTable, el } from "./ui";
import { loadChartJS, renderCharts, dateRanges } from "./charts";

(async () => {
  if (document.getElementById("opencode-stats-root")) return;

  const WS_ID = window.location.pathname.split("/")[2];
  const FN_ID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c";
  const CACHE_KEY = `opencode_ext_stats_v3_${WS_ID}`;

  injectBaseStyles();

  const sections = document.querySelector('[data-slot="sections"]');
  if (!sections) return;

  const root = showLoading();
  const usageSection = sections.querySelector('[data-slot="usage-table"]')?.closest("section");
  if (usageSection) sections.insertBefore(root, usageSection);
  else sections.appendChild(root);

  const cached = loadCache(CACHE_KEY);
  const cachedIds = new Set(cached.records.map((r: UsageRecord) => r.id));
  const wasComplete = cached.complete === true;

  const allRecords: UsageRecord[] = [];
  let page = 0;
  let emptyCount = 0;
  let reachedEnd = false;

  while (true) {
    const records = await fetchPage(WS_ID, FN_ID, page);
    if (records.length === 0) {
      emptyCount++;
      if (emptyCount >= 2) { reachedEnd = true; break; }
      page++;
      continue;
    }
    emptyCount = 0;
    const newRecords = records.filter((r: UsageRecord) => !cachedIds.has(r.id!));
    if (wasComplete && newRecords.length === 0) break;
    allRecords.push(...newRecords);
    page++;
  }

  const merged = mergeAndSort(allRecords, cached.records);
  saveCache(CACHE_KEY, merged, wasComplete || reachedEnd);
  allRecords.length = 0;
  allRecords.push(...merged);

  console.log("Total records:", allRecords.length);

  if (allRecords.length === 0) {
    root.querySelector("p")!.textContent = "No usage data found.";
    return;
  }

  root.innerHTML = "";

  let currentStats: StatsResult | null = null;

  function applyFilter(rangeIdx: number) {
    const rng = dateRanges[rangeIdx];
    const filtered = rng ? allRecords.filter(rng.fn) : allRecords;
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

  applyFilter(0);

  const Chart = await loadChartJS();
  if (Chart) {
    const pageChart = document.querySelector('[data-slot="chart-container"]') as HTMLElement | null;
    if (pageChart) { pageChart.innerHTML = ""; pageChart.style.cssText = "height:auto;min-height:auto"; }
    const target = pageChart || root;
    renderCharts(allRecords, getStats, applyFilter, target);
  }
})();
