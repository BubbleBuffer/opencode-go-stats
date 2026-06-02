import { describe, it, expect } from "vitest";
import { loadCache, mergeAndSort } from "../packages/cache/cache";
import type { UsageRecord } from "../packages/core/types";

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

describe("loadCache", () => {
  it("returns empty cache for missing key", () => {
    const result = loadCache("__nonexistent_key__" + Date.now());
    expect(result.records).toEqual([]);
    expect(result.at).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("falls back to empty cache for malformed JSON", () => {
    const key = "__test_malformed__" + Date.now();
    try {
      localStorage.setItem(key, "not valid json {{{");
    } catch { /* quota may be full */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    // cleanup
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for non-object JSON", () => {
    const key = "__test_nonobj__" + Date.now();
    try {
      localStorage.setItem(key, '"just a string"');
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for array instead of CacheEntry", () => {
    const key = "__test_array__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify([{ id: "x" }]));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for CacheEntry missing records field", () => {
    const key = "__test_missing_records__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), complete: true }));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for CacheEntry with non-array records", () => {
    const key = "__test_bad_records__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({ records: "not-an-array", at: Date.now(), complete: true }));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    expect(result.complete).toBe(false);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for CacheEntry with stale timestamp (negative at)", () => {
    const key = "__test_stale_at__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({ records: [], at: -1, complete: true }));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toEqual([]);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("falls back to empty cache for CacheEntry with null record fields", () => {
    const key = "__test_null_records__" + Date.now();
    try {
      // A record with required fields set to null should still be validated
      localStorage.setItem(key, JSON.stringify({
        records: [{ id: null, timeCreated: null, model: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, cost: null, reasoningTokens: null }],
        at: Date.now(),
        complete: true,
      }));
    } catch { /* quota */ }
    const result = loadCache(key);
    // All-null record should be treated as invalid record entry
    expect(result.records).toEqual([]);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("marks cache incomplete when validation strips records from a complete cache", () => {
    const key = "__test_stripped_complete__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({
        records: [{ id: "abc", timeCreated: "2026-06-01T00:00:00Z", model: "m", inputTokens: 1 }],
        at: Date.now(),
        complete: true,
      }));
    } catch { /* quota */ }

    const result = loadCache(key);

    expect(result.records).toEqual([]);
    expect(result.complete).toBe(false);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("returns valid CacheEntry when records array contains valid records", () => {
    const key = "__test_valid__" + Date.now();
    const rec = {
      id: "abc",
      timeCreated: "2026-06-01T00:00:00Z",
      model: "gpt-4",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cost: 100,
      reasoningTokens: 0,
    };
    try {
      localStorage.setItem(key, JSON.stringify({ records: [rec], at: Date.now(), complete: true }));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe("abc");
    expect(result.complete).toBe(true);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });

  it("returns incomplete when complete field is missing", () => {
    const key = "__test_no_complete__" + Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({ records: [], at: Date.now() }));
    } catch { /* quota */ }
    const result = loadCache(key);
    expect(result.complete).toBe(false);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
});

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

  it("handles invalid date strings without crashing", () => {
    const records = [
      makeRec("a", "invalid-date"),
      makeRec("b", "2026-06-01T00:00:00Z"),
    ];
    const result = mergeAndSort(records, []);
    expect(result).toHaveLength(2);
  });

  it("handles all invalid dates gracefully", () => {
    const records = [
      makeRec("a", "not-a-date"),
      makeRec("b", ""),
    ];
    const result = mergeAndSort(records, []);
    expect(result).toHaveLength(2);
  });

  it("sorts mixed valid and invalid dates", () => {
    const records = [
      makeRec("a", "invalid"),
      makeRec("b", "2026-06-03T00:00:00Z"),
      makeRec("c", "invalid2"),
      makeRec("d", "2026-06-01T00:00:00Z"),
    ];
    const result = mergeAndSort(records, []);
    expect(result.map(r => r.id)).toEqual(["b", "d", "a", "c"]);
  });
});
