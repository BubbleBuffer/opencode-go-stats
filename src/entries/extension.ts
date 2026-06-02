import type { StatsResult } from "../packages/core/types";
import { computeStats } from "../packages/stats/stats";
import { showLoading, injectBaseStyles, buildPricingTable, buildSummaryTable } from "../packages/ui/ui";
import { renderCharts, dateRanges } from "../packages/ui/charts";
import { runPipeline } from "../packages/pipeline/pipeline";

(async () => {
  if (document.getElementById("opencode-stats-root")) return;

  const WS_ID = window.location.pathname.split("/")[2];
  if (!WS_ID || WS_ID === "") {
    console.error("[oc-stats] Cannot determine workspace ID from URL. Make sure you are on an opencode.ai workspace page.");
    return;
  }

  const CACHE_KEY = `opencode_ext_stats_v3_${WS_ID}`;

  injectBaseStyles();

  const sections = document.querySelector('[data-slot="sections"]');
  if (!sections) return;

  const root = showLoading();
  const usageSection = sections.querySelector('[data-slot="usage-table"]')?.closest("section");
  if (usageSection) sections.insertBefore(root, usageSection);
  else sections.appendChild(root);

  const allRecords = await runPipeline(WS_ID, CACHE_KEY);

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

  let pageChart: HTMLElement | null = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    pageChart = document.querySelector('[data-slot="chart-container"]') as HTMLElement | null;
    if (pageChart) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!pageChart) {
    console.error("[oc-stats] Chart container not found on page after 5s");
    return;
  }
  pageChart.innerHTML = "";
  pageChart.style.cssText = "height:auto;min-height:auto";
  renderCharts(allRecords, getStats, applyFilter, pageChart);
})().catch((e) => { console.error("[oc-stats] Fatal extension:", e); });
