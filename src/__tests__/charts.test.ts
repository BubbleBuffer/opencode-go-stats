import { afterEach, describe, it, expect } from "vitest";
import { dateRanges, finiteDate, loadChartJS } from "../packages/ui/charts";
import type { UsageRecord } from "../packages/core/types";

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

describe("loadChartJS", () => {
  it("sets SRI and CORS attributes on the CDN script", async () => {
    let script: any;
    (globalThis as any).window = {};
    (globalThis as any).document = {
      createElement: () => {
        script = { remove() {} };
        return script;
      },
      head: {
        appendChild: (node: any) => {
          setTimeout(() => node.onerror(new Error("stop after attribute capture")), 0);
        },
      },
    };

    await expect(loadChartJS()).rejects.toBeInstanceOf(Error);

    expect(script.src).toBe("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js");
    expect(script.integrity).toBe("sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g");
    expect(script.crossOrigin).toBe("anonymous");
  });
});
