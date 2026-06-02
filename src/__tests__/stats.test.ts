import { describe, it, expect } from "vitest";
import { computeStats } from "../packages/stats/stats";
import type { UsageRecord } from "../packages/core/types";

function makeRec(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: "1",
    timeCreated: new Date().toISOString(),
    model: "gpt-4",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    cost: 1000,
    reasoningTokens: 0,
    sessionID: "",
    ...overrides,
  };
}

describe("computeStats", () => {
  it("returns empty object for empty records", () => {
    const result = computeStats([]);
    expect(result.modelStats).toEqual({});
    expect(result.modelPrices).toEqual({});
  });

  it("computes stats for a single model", () => {
    const records = [makeRec(), makeRec()];
    const result = computeStats(records);
    expect(result.modelStats["gpt-4"]).toBeDefined();
    expect(result.modelStats["gpt-4"].inputTokens).toBe(200);
    expect(result.modelStats["gpt-4"].outputTokens).toBe(100);
    expect(result.modelStats["gpt-4"].requests).toBe(2);
    expect(result.modelStats["gpt-4"].totalCost).toBe(2000);
  });

  it("computes stats for multiple models", () => {
    const records = [
      makeRec({ model: "gpt-4" }),
      makeRec({ model: "gpt-4" }),
      makeRec({ model: "claude", inputTokens: 10, outputTokens: 5, cost: 100 }),
    ];
    const result = computeStats(records);
    expect(Object.keys(result.modelStats)).toHaveLength(2);
    expect(result.modelStats["gpt-4"].requests).toBe(2);
    expect(result.modelStats["claude"].requests).toBe(1);
  });

  it('uses "unknown" for null/empty model', () => {
    const records = [makeRec({ model: "" }), makeRec({ model: "" } as any)];
    const result = computeStats(records);
    expect(Object.keys(result.modelStats)).toHaveLength(1);
    expect(result.modelStats["unknown"]).toBeDefined();
  });
});