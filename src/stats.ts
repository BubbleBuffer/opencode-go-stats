import type { UsageRecord, ModelStats, StatsResult } from "./types";
import { estimateModelPrices } from "./pricing";

export function computeStats(records: UsageRecord[]): StatsResult {
  const models = [...new Set(records.map(r => r.model || "unknown"))];
  const modelPrices: StatsResult["modelPrices"] = {};
  for (const model of models) {
    const recs = records.filter(r => r.model === model);
    const prices = estimateModelPrices(recs);
    if (prices) modelPrices[model] = prices;
  }

  const modelStats: Record<string, ModelStats> = {};
  for (const r of records) {
    const model = r.model || "unknown";
    if (!modelStats[model]) {
      modelStats[model] = {
        model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      };
    }
    const s = modelStats[model];
    s.requests++;
    s.inputTokens += r.inputTokens || 0;
    s.outputTokens += r.outputTokens || 0;
    s.reasoningTokens += r.reasoningTokens || 0;
    s.cacheReadTokens += r.cacheReadTokens || 0;
    s.totalCost += r.cost || 0;
  }

  const total = Object.values(modelStats).reduce((acc, s) => {
    acc.inputTokens += s.inputTokens;
    acc.outputTokens += s.outputTokens;
    acc.reasoningTokens += s.reasoningTokens;
    acc.cacheReadTokens += s.cacheReadTokens;
    acc.totalCost += s.totalCost;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });

  const totalTokens = total.inputTokens + total.outputTokens + total.reasoningTokens + total.cacheReadTokens;
  const totalCostUSD = total.totalCost / 1e8;

  return { modelPrices, modelStats, totalTokens, totalCostUSD };
}
