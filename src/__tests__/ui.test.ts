import { describe, it, expect } from "vitest";
import { summaryPricingCells, summaryPricingColumns } from "../packages/ui/ui";
import type { ModelPrices, ModelStats } from "../packages/core/types";

describe("pricing header union logic", () => {
  it("computes union of pricing fields across all displayed models", () => {
    const modelStats: Record<string, ModelStats> = {
      "gpt-4": { model: "gpt-4", requests: 10, inputTokens: 100, outputTokens: 50, reasoningTokens: 0, cacheReadTokens: 10, totalCost: 1000 },
      "claude": { model: "claude", requests: 5, inputTokens: 50, outputTokens: 25, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 500 },
    };
    const modelPrices: Record<string, ModelPrices> = {
      "gpt-4": { inputTokens: 0.001, outputTokens: 0.002, cacheReadTokens: 0.0001 },
      "claude": { outputTokens: 0.003 },
    };

    expect(summaryPricingColumns(modelStats, modelPrices)).toEqual([
      { field: "inputTokens", header: "In $/1M" },
      { field: "outputTokens", header: "Out $/1M" },
      { field: "cacheReadTokens", header: "Cache Rd $/1M" },
    ]);
  });

  it("renders one pricing cell per selected header", () => {
    const columns = [
      { field: "outputTokens" as const, header: "Out $/1M" },
    ];

    expect(summaryPricingCells({ outputTokens: 0.003 }, columns)).toEqual(["$0.0030"]);
    expect(summaryPricingCells({}, columns)).toEqual(["-"]);
  });

  it("omits pricing cells when there are no pricing headers", () => {
    expect(summaryPricingCells({ outputTokens: 0.003 }, [])).toEqual([]);
  });
});
