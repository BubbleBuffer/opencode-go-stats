import { describe, it, expect } from "vitest";
import { estimateModelPrices } from "./pricing";
import type { UsageRecord, ModelStats } from "./types";
import { COST_SCALE, TPM_SCALE } from "./constants";

function makeRec(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: "1",
    timeCreated: new Date().toISOString(),
    model: "test-model",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cost: 1000,
    reasoningTokens: 0,
    sessionID: "",
    ...overrides,
  };
}

describe("estimateModelPrices", () => {
  it("returns null for empty records", () => {
    expect(estimateModelPrices([])).toBeNull();
  });

  it("returns null when no records have cost", () => {
    const records = [makeRec({ cost: 0 })];
    expect(estimateModelPrices(records)).toBeNull();
  });

  it("returns null when paid records less than active fields", () => {
    // One record with cost but potentially multiple active fields
    const records = [makeRec({ cost: 1000 })];
    expect(estimateModelPrices(records)).toBeNull();
  });

  it("returns null when all token fields are zero", () => {
    const records = [makeRec({ inputTokens: 0, outputTokens: 0, cost: 1000 })];
    expect(estimateModelPrices(records)).toBeNull();
  });

  it("estimates prices with input and output tokens", () => {
    // Need 2+ records with cost for 2 active fields (inputTokens, outputTokens)
    // Data must be linearly independent: ratio of tokens between records must differ
    const records = [
      makeRec({ cost: 1000, inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      makeRec({ cost: 3000, inputTokens: 3_000_000, outputTokens: 500_000 }),
    ];
    const result = estimateModelPrices(records);
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBeGreaterThan(0);
    expect(result!.outputTokens).toBeGreaterThanOrEqual(0);
  });

  it("returns prices with non-negative values", () => {
    const records = [
      makeRec({ cost: 1000, inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      makeRec({ cost: 3000, inputTokens: 3_000_000, outputTokens: 500_000 }),
    ];
    const result = estimateModelPrices(records);
    expect(result).not.toBeNull();
    expect(result!.inputTokens!).toBeGreaterThanOrEqual(0);
    expect(result!.outputTokens!).toBeGreaterThanOrEqual(0);
  });
});