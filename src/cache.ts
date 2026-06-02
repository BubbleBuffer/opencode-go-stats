import type { UsageRecord, CacheEntry } from "./types";

export function loadCache(key: string): CacheEntry {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as CacheEntry;
  } catch (_) {}
  return { records: [], ts: 0, complete: false };
}

export function saveCache(key: string, records: UsageRecord[], complete: boolean) {
  localStorage.setItem(key, JSON.stringify({
    records,
    ts: Date.now(),
    complete,
  }));
}

export function mergeAndSort(newRecords: UsageRecord[], cached: UsageRecord[]): UsageRecord[] {
  const merged = [...newRecords, ...cached];
  merged.sort((a, b) => {
    const ta = a.timeCreated ? Date.parse(a.timeCreated) : 0;
    const tb = b.timeCreated ? Date.parse(b.timeCreated) : 0;
    return tb - ta;
  });
  return merged;
}
