import type { StatsResult } from "./types";
import { computeStats } from "./stats";
import { showLoading, injectBaseStyles, buildPricingTable, buildSummaryTable } from "./ui";
import { loadChartJS, renderCharts, dateRanges } from "./charts";
import { runPipeline } from "./pipeline";

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

  const allRecords = await runPipeline(WS_ID, CACHE_KEY, FN_ID);

  console.log("Total records:", allRecords.length);

  if (allRecords.length === 0) {
    root.querySelector("p")!.textContent = "No usage data found.";
    return;
  }

  root.innerHTML = "";

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

  applyFilter(0);

  let Chart: any;
  try {
    Chart = await loadChartJS();
  } catch (e) {
    console.warn("[oc-stats] Chart.js unavailable, skipping charts:", e);
    return;
  }
  if (Chart) {
    const pageChart = document.querySelector('[data-slot="chart-container"]') as HTMLElement | null;
    if (pageChart) { pageChart.innerHTML = ""; pageChart.style.cssText = "height:auto;min-height:auto"; }
    const target = pageChart || root;
    renderCharts(allRecords, getStats, applyFilter, target);
  }
})().catch((e) => { console.error("[oc-stats] Fatal extension:", e); });
