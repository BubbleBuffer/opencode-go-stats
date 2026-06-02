import type { UsageRecord } from "./types";
import { fetchPage } from "./parse";
import { computeStats } from "./stats";
import { loadCache, saveCache, mergeAndSort } from "./cache";

const WS_ID = window.location.pathname.split("/")[2];
const FN_ID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c";
const CACHE_KEY = `opencode_stats_v2_${WS_ID}`;

(async () => {
  console.group("\u{1F4CA} OpenCode Go Usage Stats");
  console.log("Workspace:", WS_ID);
  console.log("Fetching all usage pages...");

  const cached = loadCache(CACHE_KEY);
  const cachedIds = new Set(cached.records.map((r: UsageRecord) => r.id));
  const wasComplete = cached.complete === true;
  if (cached.records.length) {
    console.log("Loaded %d cached records from %s %s",
      cached.records.length,
      new Date(cached.ts).toLocaleString(),
      wasComplete ? "(complete)" : "(incomplete)",
    );
  }

  const allRecords: UsageRecord[] = [];
  let page = 0;
  let emptyCount = 0;
  let reachedEnd = false;

  while (true) {
    console.log("  Fetching page %d ...", page);
    const records = await fetchPage(WS_ID, FN_ID, page);
    if (records.length === 0) {
      emptyCount++;
      if (emptyCount >= 2) { reachedEnd = true; break; }
      page++;
      continue;
    }
    emptyCount = 0;
    const newRecords = records.filter((r: UsageRecord) => !cachedIds.has(r.id!));
    if (wasComplete && newRecords.length === 0) {
      console.log("    Page %d already fully cached — caught up!", page);
      break;
    }
    allRecords.push(...newRecords);
    console.log("    Got %d new records (total new: %d)", newRecords.length, allRecords.length);
    page++;
  }

  const merged = mergeAndSort(allRecords, cached.records);
  saveCache(CACHE_KEY, merged, wasComplete || reachedEnd);
  allRecords.length = 0;
  allRecords.push(...merged);

  console.log("Total records:", allRecords.length);

  if (allRecords.length === 0) {
    console.log("No usage data found.");
    console.groupEnd();
    return;
  }

  const { modelPrices, modelStats, totalTokens, totalCostUSD } = computeStats(allRecords);

  if (Object.keys(modelPrices).length > 0) {
    console.log("\n--- \u{1F52C} Estimated Pricing ($/1M tokens) ---");
    console.table(Object.entries(modelPrices).map(([model, p]) => ({
      Model: model,
      "In $/1M": p.inputTokens ? "$" + p.inputTokens.toFixed(4) : "-",
      "Out $/1M": p.outputTokens ? "$" + p.outputTokens.toFixed(4) : "-",
      "Cache Rd $/1M": p.cacheReadTokens ? "$" + p.cacheReadTokens.toFixed(4) : "-",
    })));
  }

  console.log("\n--- \u{1F4C8} Per-Model Summary ---");
  const modelRows = Object.values(modelStats).map(s => {
    const tot = s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens;
    const costUSD = s.totalCost / 1e8;
    const ppm = tot > 0 ? "$" + (costUSD / (tot / 1_000_000)).toFixed(4) : "N/A";
    const ep = modelPrices[s.model];
    const row: Record<string, any> = {
      Model: s.model,
      Requests: s.requests,
      "Input Tok": s.inputTokens.toLocaleString(),
      "Output Tok": s.outputTokens.toLocaleString(),
      "Reason Tok": s.reasoningTokens.toLocaleString(),
      "Cache Read": s.cacheReadTokens.toLocaleString(),
      "Total Tok": tot.toLocaleString(),
      "Cost (USD)": "$" + costUSD.toFixed(6),
      "$/1M Tok": ppm,
    };
    if (ep) {
      if (ep.inputTokens) row["In $/1M"] = "$" + ep.inputTokens.toFixed(4);
      if (ep.outputTokens) row["Out $/1M"] = "$" + ep.outputTokens.toFixed(4);
      if (ep.cacheReadTokens) row["Cache Rd $/1M"] = "$" + ep.cacheReadTokens.toFixed(4);
    }
    return row;
  });
  console.table(modelRows);

  const total = Object.values(modelStats).reduce((acc, s) => {
    acc.inputTokens += s.inputTokens;
    acc.outputTokens += s.outputTokens;
    acc.reasoningTokens += s.reasoningTokens;
    acc.cacheReadTokens += s.cacheReadTokens;
    acc.totalCost += s.totalCost;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });

  const overallPPM = totalTokens > 0 ? "$" + (totalCostUSD / (totalTokens / 1_000_000)).toFixed(4) : "N/A";

  console.log("\n--- \u{1F3C1} Grand Total ---");
  console.log({
    "Total Requests": total.inputTokens > 0 ? "[see per-model]" : "0",
    "Total Input Tokens": total.inputTokens.toLocaleString(),
    "Total Output Tokens": total.outputTokens.toLocaleString(),
    "Total Reasoning Tokens": total.reasoningTokens.toLocaleString(),
    "Total Cache Read Tokens": total.cacheReadTokens.toLocaleString(),
    "Total Tokens": totalTokens.toLocaleString(),
    "Total Cost": "$" + totalCostUSD.toFixed(6),
    "Overall $/1M Tokens": overallPPM,
  });

  const sessionStats: Record<string, any> = {};
  for (const r of allRecords) {
    const key = `${r.model} / ${r.sessionID?.slice(-8) || "?"}`;
    if (!sessionStats[key]) {
      sessionStats[key] = {
        model: r.model,
        session: r.sessionID?.slice(-8),
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        requests: 0,
        totalCost: 0,
      };
    }
    const s = sessionStats[key];
    s.requests++;
    s.inputTokens += r.inputTokens || 0;
    s.outputTokens += r.outputTokens || 0;
    s.reasoningTokens += r.reasoningTokens || 0;
    s.totalCost += r.cost || 0;
  }

  console.log("\n--- \u{1F4CA} Top Sessions by Cost ---");
  console.table(
    Object.values(sessionStats)
      .sort((a: any, b: any) => b.totalCost - a.totalCost)
      .slice(0, 20)
      .map((s: any) => ({
        "Model/Session": s.model + " / " + s.session,
        Requests: s.requests,
        "Input Tok": s.inputTokens.toLocaleString(),
        "Output Tok": s.outputTokens.toLocaleString(),
        "Reason Tok": s.reasoningTokens.toLocaleString(),
        "Total Cost": "$" + (s.totalCost / 1e8).toFixed(6),
      })),
  );

  console.log("\n\u2705 Done!");
  console.groupEnd();

  (window as any).__opencodeStats = {
    records: allRecords,
    modelStats,
    sessionStats,
    total,
    modelPrices,
  };
  console.log("Data also available at window.__opencodeStats");
})();
