import { describe, it, expect } from "vitest";
import { mergeAndSort } from "./cache";
import type { UsageRecord } from "./types";

function makeRec(id: string, timeCreated: string): UsageRecord {
  return {
    id,
    timeCreated,
    model: "test",
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cost: 100,
    reasoningTokens: 0,
    sessionID: "",
  };
}

describe("mergeAndSort", () => {
  it("returns empty when both arrays empty", () => {
    expect(mergeAndSort([], [])).toEqual([]);
  });

  it("returns new records when cached is empty", () => {
    const records = [makeRec("a", "2026-06-01T00:00:00Z")];
    const result = mergeAndSort(records, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("returns cached records when new is empty", () => {
    const cached = [makeRec("a", "2026-06-01T00:00:00Z")];
    const result = mergeAndSort([], cached);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("merges and sorts by timeCreated descending", () => {
    const newRecords = [makeRec("a", "2026-06-01T00:00:00Z"), makeRec("c", "2026-06-03T00:00:00Z")];
    const cached = [makeRec("b", "2026-06-02T00:00:00Z")];
    const result = mergeAndSort(newRecords, cached);
    expect(result.length).toBe(3);
    // Should be sorted descending by timeCreated (newest first)
    expect(result[0].id).toBe("c");
    expect(result[1].id).toBe("b");
    expect(result[2].id).toBe("a");
  });

  it("handles records with empty timeCreated", () => {
    const records = [makeRec("a", "")];
    const result = mergeAndSort(records, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});