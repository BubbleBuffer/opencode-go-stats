import type { UsageRecord, CacheEntry } from "./types";

export function loadCache(key: string): CacheEntry {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as CacheEntry;
  } catch (_) {}
  return { records: [], at: 0, complete: false };
}

export function saveCache(key: string, records: UsageRecord[], complete: boolean): boolean {
  const data: CacheEntry = { records, complete, at: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      console.warn("[oc-stats] localStorage quota exceeded, trimming oldest records");
      const k = Math.ceil(records.length * 0.8);
      if (k < records.length) {
        return saveCache(key, records.slice(records.length - k), complete);
      }
      console.error("[oc-stats] unable to save cache even after trimming");
      return false;
    }
    console.error("[oc-stats] saveCache failed:", e);
    return false;
  }
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
