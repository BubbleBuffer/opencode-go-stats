import { afterEach, describe, it, expect } from "vitest";
import {
  buildCostPerRequestRows,
  buildTokenMixRows,
  buildTokensPerRequestRows,
  dateRanges,
  finiteDate,
} from "../packages/ui/charts";
import type { ModelStats, UsageRecord } from "../packages/core/types";

const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;

afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).document = originalDocument;
});

describe("finiteDate helper", () => {
  it("parses valid date strings to finite timestamps", () => {
    expect(finiteDate("2026-06-01T00:00:00Z")).toBeTruthy();
    expect(isFinite(finiteDate("2026-06-01T00:00:00Z"))).toBe(true);
  });

  it("returns NaN for invalid date strings", () => {
    expect(isFinite(finiteDate("invalid"))).toBe(false);
    expect(isFinite(finiteDate(""))).toBe(false);
    expect(isFinite(finiteDate(undefined))).toBe(false);
    expect(isFinite(finiteDate(null))).toBe(false);
  });

  it("date range filters do not throw on invalid dates", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const records: UsageRecord[] = [
      { id: "a", timeCreated: "invalid", model: "", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cost: 0, reasoningTokens: 0 },
      { id: "b", timeCreated: todayStr + "T00:00:00Z", model: "", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cost: 0, reasoningTokens: 0 },
    ];

    const allFilter = dateRanges.find(r => r.label === "All")!.fn;
    expect(records.filter(allFilter)).toHaveLength(2);

    const todayFilter = dateRanges.find(r => r.label === "Today")!.fn;
    const todayResults = records.filter(todayFilter);
    expect(todayResults).toHaveLength(1);
    expect(todayResults[0].id).toBe("b");
  });
});

describe("date range: Today UTC boundary", () => {
  // Regression: "Today" should use UTC calendar dates, not local timezone.
  // A record dated 2026-06-02T00:30:00Z should match "Today" when run at 2026-06-02 in UTC,
  // regardless of the local timezone offset.
  it("matches UTC midnight record on the correct UTC day", () => {
    // Override Date.now to pretend we're at 2026-06-02 03:00:00 UTC (early morning UTC)
    // A record at 2026-06-02 00:30:00Z should still match Today since it's the same UTC day
    const fakeNow = new Date("2026-06-02T03:00:00Z").getTime();
    const originalDate = Date;
    (globalThis as any).Date = class extends originalDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(fakeNow);
        else super(...args);
      }
      static override now() { return fakeNow; }
    };

    const todayFilter = dateRanges.find(r => r.label === "Today")!.fn;
    const record: UsageRecord = {
      id: "tz-test",
      timeCreated: "2026-06-02T00:30:00Z",
      model: "",
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      cost: 0, reasoningTokens: 0,
    };

    const result = (globalThis as any).Date.now();
    expect(new Date(result).toISOString().slice(0, 10)).toBe("2026-06-02");

    const matched = todayFilter(record);
    expect(matched).toBe(true);

    (globalThis as any).Date = originalDate;
  });

  it("does not match a record from the previous UTC day", () => {
    const fakeNow = new Date("2026-06-02T03:00:00Z").getTime();
    const originalDate = Date;
    (globalThis as any).Date = class extends originalDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(fakeNow);
        else super(...args);
      }
      static override now() { return fakeNow; }
    };

    const todayFilter = dateRanges.find(r => r.label === "Today")!.fn;
    const record: UsageRecord = {
      id: "tz-test-prev",
      timeCreated: "2026-06-01T23:30:00Z",
      model: "",
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      cost: 0, reasoningTokens: 0,
    };

    const matched = todayFilter(record);
    expect(matched).toBe(false);

    (globalThis as any).Date = originalDate;
  });

  it("does not match a record from the next UTC day", () => {
    const fakeNow = new Date("2026-06-02T03:00:00Z").getTime();
    const originalDate = Date;
    (globalThis as any).Date = class extends originalDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(fakeNow);
        else super(...args);
      }
      static override now() { return fakeNow; }
    };

    const todayFilter = dateRanges.find(r => r.label === "Today")!.fn;
    const record: UsageRecord = {
      id: "tz-test-next",
      timeCreated: "2026-06-03T00:30:00Z",
      model: "",
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      cost: 0, reasoningTokens: 0,
    };

    const matched = todayFilter(record);
    expect(matched).toBe(false);

    (globalThis as any).Date = originalDate;
  });
});

describe("model comparison chart helpers", () => {
  const stats: ModelStats[] = [
    {
      model: "small-cheap",
      requests: 10,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      cacheReadTokens: 50,
      totalCost: 20_000_000,
    },
    {
      model: "large-efficient",
      requests: 2,
      inputTokens: 1_000,
      outputTokens: 500,
      reasoningTokens: 500,
      cacheReadTokens: 0,
      totalCost: 30_000_000,
    },
    {
      model: "reasoning-heavy",
      requests: 4,
      inputTokens: 100,
      outputTokens: 100,
      reasoningTokens: 1_200,
      cacheReadTokens: 0,
      totalCost: 80_000_000,
    },
  ];

  it("ranks cost per request independently from total cost", () => {
    const rows = buildCostPerRequestRows(stats, "costPerRequest", "desc");

    expect(rows.map(r => r.model)).toEqual(["reasoning-heavy", "large-efficient", "small-cheap"]);
    expect(rows.map(r => r.value)).toEqual([0.2, 0.15, 0.02]);
  });

  it("uses the selected cost/request rank metric as the row value", () => {
    const rows = buildCostPerRequestRows(stats, "totalCost", "desc");

    expect(rows.map(r => r.model)).toEqual(["reasoning-heavy", "large-efficient", "small-cheap"]);
    expect(rows.map(r => r.value)).toEqual([0.8, 0.3, 0.2]);
  });

  it("can rank cost per request rows in ascending order", () => {
    const rows = buildCostPerRequestRows(stats, "requests", "asc");

    expect(rows.map(r => r.model)).toEqual(["large-efficient", "reasoning-heavy", "small-cheap"]);
    expect(rows.map(r => r.value)).toEqual([2, 4, 10]);
  });

  it("can rank average tokens per request by a specific token component", () => {
    const rows = buildTokensPerRequestRows(stats, "reasoning", "desc");

    expect(rows.map(r => r.model)).toEqual(["reasoning-heavy", "large-efficient", "small-cheap"]);
    expect(rows.map(r => r.totalAvg)).toEqual([350, 1000, 20]);
    expect(rows.map(r => r.reasoningAvg)).toEqual([300, 250, 0]);
  });

  it("uses the selected token/request rank metric as the row value", () => {
    const rows = buildTokensPerRequestRows(stats, "input", "desc");

    expect(rows.map(r => r.model)).toEqual(["large-efficient", "reasoning-heavy", "small-cheap"]);
    expect(rows.map(r => r.value)).toEqual([500, 25, 10]);
  });

  it("builds token mix rows in percent mode sorted by token share", () => {
    const rows = buildTokenMixRows(stats, "reasoningShare", "desc", "percent");

    expect(rows.map(r => r.model)).toEqual(["reasoning-heavy", "large-efficient", "small-cheap"]);
    expect(rows[0].segments.map(s => s.value)).toEqual([7.142857, 7.142857, 85.714286, 0]);
    expect(rows[1].segments.map(s => s.value)).toEqual([50, 25, 25, 0]);
  });

  it("builds token mix rows in absolute mode sorted by total token volume", () => {
    const rows = buildTokenMixRows(stats, "totalTokens", "desc", "absolute");

    expect(rows.map(r => r.model)).toEqual(["large-efficient", "reasoning-heavy", "small-cheap"]);
    expect(rows[0].segments.map(s => s.value)).toEqual([1000, 500, 500, 0]);
  });

  it("handles zero requests and zero tokens without infinities or NaN", () => {
    const empty: ModelStats = {
      model: "empty",
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      totalCost: 1,
    };

    const costRow = buildCostPerRequestRows([empty], "costPerRequest", "desc")[0];
    const tokenRow = buildTokensPerRequestRows([empty], "total", "desc")[0];
    const mixRow = buildTokenMixRows([empty], "totalTokens", "desc", "percent")[0];

    expect(costRow.costPerRequest).toBe(0);
    expect(costRow.pricePerMillion).toBe(0);
    expect(tokenRow.totalAvg).toBe(0);
    expect(mixRow.segments.map(s => s.value)).toEqual([0, 0, 0, 0]);
  });
});
