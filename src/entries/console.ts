import { computeStats } from "../packages/stats/stats";
import { loadCache } from "../packages/cache/cache";
import { COST_SCALE, TPM_SCALE } from "../packages/core/constants";
import { runPipeline } from "../packages/pipeline/pipeline";

(async () => {
  const WS_ID = window.location.pathname.split("/")[2];
  if (!WS_ID || WS_ID === "") {
    console.error("[oc-stats] Cannot determine workspace ID from URL. Make sure you are on an opencode.ai workspace page.");
    return;
  }

  const CACHE_KEY = `opencode_stats_v2_${WS_ID}`;

  console.group("\u{1F4CA} OpenCode Go Usage Stats");
  console.log("Workspace:", WS_ID);

  const cached = loadCache(CACHE_KEY);
  if (cached.records.length) {
    console.log("Loaded %d cached records from %s %s",
      cached.records.length,
      new Date(cached.at).toLocaleString(),
      cached.complete ? "(complete)" : "(incomplete)",
    );
  }

  console.log("Fetching all usage pages...");
  const allRecords = await runPipeline(WS_ID, CACHE_KEY);

  if (allRecords.length === 0) {
    console.log("No usage records found.");
    console.groupEnd();
    return;
  }

  console.log("Total records:", allRecords.length);

  const { modelPrices, modelStats, total, totalTokens, totalCostUSD } = computeStats(allRecords);

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
    const costUSD = s.totalCost / COST_SCALE;
    const ppm = tot > 0 ? "$" + (costUSD / (tot / TPM_SCALE)).toFixed(4) : "N/A";
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

  const overallPPM = totalTokens > 0 ? "$" + (totalCostUSD / (totalTokens / TPM_SCALE)).toFixed(4) : "N/A";

  console.log("\n--- \u{1F3C1} Grand Total ---");
  console.log({
    "Total Requests": String(Object.values(modelStats).reduce((sum, s) => sum + s.requests, 0)),
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
        "Total Cost": "$" + (s.totalCost / COST_SCALE).toFixed(6),
      })),
  );

  console.log("\u2705 Done!");
  console.groupEnd();

  (window as any).__opencodeStats = {
    records: allRecords,
    modelStats,
    sessionStats,
    total,
    modelPrices,
  };
  console.log("Data also available at window.__opencodeStats");
})().catch((e) => { console.error("[oc-stats] Fatal console:", e); });
