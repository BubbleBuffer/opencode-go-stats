import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPipeline } from "../packages/pipeline/pipeline";
import * as cache from "../packages/cache/cache";
import * as parse from "../packages/api/parse";
import { FN_ID } from "../packages/core/constants";
import type { UsageRecord, CacheEntry } from "./types";

function makeRecord(id: string, model = "test-model"): UsageRecord {
  return {
    id,
    timeCreated: new Date().toISOString(),
    model,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cost: 1000,
    reasoningTokens: 0,
    sessionID: undefined,
  };
}

describe("runPipeline", () => {
  let loadCacheSpy: ReturnType<typeof vi.spyOn>;
  let saveCacheSpy: ReturnType<typeof vi.spyOn>;
  let fetchAllPagesSpy: ReturnType<typeof vi.spyOn>;
  let mergeAndSortSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loadCacheSpy = vi.spyOn(cache, "loadCache");
    saveCacheSpy = vi.spyOn(cache, "saveCache");
    fetchAllPagesSpy = vi.spyOn(parse, "fetchAllPages");
    mergeAndSortSpy = vi.spyOn(cache, "mergeAndSort");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached records without fetching when cache is complete", async () => {
    const cachedRecords: UsageRecord[] = [makeRecord("cached-1"), makeRecord("cached-2")];
    loadCacheSpy.mockReturnValue({ records: cachedRecords, at: Date.now(), complete: true });

    const result = await runPipeline("ws-1", "test-cache-key");

    expect(result).toEqual(cachedRecords);
    expect(loadCacheSpy).toHaveBeenCalledWith("test-cache-key");
    expect(fetchAllPagesSpy).not.toHaveBeenCalled();
    expect(saveCacheSpy).not.toHaveBeenCalled();
    expect(mergeAndSortSpy).not.toHaveBeenCalled();
  });

  it("fetches, merges, dedupes, and saves when cache is incomplete and reachedEnd is true", async () => {
    const cachedRecords: UsageRecord[] = [makeRecord("cached-1")];
    loadCacheSpy.mockReturnValue({ records: cachedRecords, at: 0, complete: false });

    const fetchedRecords: UsageRecord[] = [makeRecord("fetched-1"), makeRecord("fetched-2")];
    fetchAllPagesSpy.mockResolvedValue({ records: fetchedRecords, reachedEnd: true });

    mergeAndSortSpy.mockReturnValue([fetchedRecords[0], fetchedRecords[1], cachedRecords[0]]);

    const result = await runPipeline("ws-1", "test-cache-key");

    expect(loadCacheSpy).toHaveBeenCalledWith("test-cache-key");
    expect(fetchAllPagesSpy).toHaveBeenCalledWith("ws-1", FN_ID, new Set(["cached-1"]), false);
    expect(mergeAndSortSpy).toHaveBeenCalledWith(fetchedRecords, cachedRecords);
    expect(saveCacheSpy).toHaveBeenCalledWith(
      "test-cache-key",
      [fetchedRecords[0], fetchedRecords[1], cachedRecords[0]],
      true,
    );
    expect(result).toEqual([fetchedRecords[0], fetchedRecords[1], cachedRecords[0]]);
  });

  it("does not call saveCache with complete=true when reachedEnd is false", async () => {
    const cachedRecords: UsageRecord[] = [makeRecord("cached-1")];
    loadCacheSpy.mockReturnValue({ records: cachedRecords, at: 0, complete: false });

    const fetchedRecords: UsageRecord[] = [makeRecord("fetched-1")];
    fetchAllPagesSpy.mockResolvedValue({ records: fetchedRecords, reachedEnd: false });

    mergeAndSortSpy.mockReturnValue([fetchedRecords[0], cachedRecords[0]]);

    await runPipeline("ws-1", "test-cache-key");

    expect(saveCacheSpy).toHaveBeenCalledWith(
      "test-cache-key",
      [fetchedRecords[0], cachedRecords[0]],
      false,
    );
  });

  it("deduplicates records by id after merge", async () => {
    const cachedRecords: UsageRecord[] = [makeRecord("shared-id", "model-a")];
    loadCacheSpy.mockReturnValue({ records: cachedRecords, at: 0, complete: false });

    const fetchedRecords: UsageRecord[] = [makeRecord("shared-id", "model-b"), makeRecord("unique-id", "model-a")];
    fetchAllPagesSpy.mockResolvedValue({ records: fetchedRecords, reachedEnd: true });

    mergeAndSortSpy.mockReturnValue([fetchedRecords[0], fetchedRecords[1], cachedRecords[0]]);

    const result = await runPipeline("ws-1", "test-cache-key");

    expect(result).toEqual([fetchedRecords[0], fetchedRecords[1]]);
    expect(saveCacheSpy).toHaveBeenCalledWith("test-cache-key", result, true);
  });
});
