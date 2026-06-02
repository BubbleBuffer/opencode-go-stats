import type { UsageRecord, CacheEntry } from "../core/types";

export function loadCache(key: string): CacheEntry {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { records: [], at: 0, complete: false };
    const data = JSON.parse(raw);
    // Validate cache shape: must be object with records array
    if (!data || typeof data !== "object" || !Array.isArray(data.records)) {
      return { records: [], at: 0, complete: false };
    }
    // Validate each record has required fields
    const validRecords: UsageRecord[] = [];
    for (const r of data.records) {
      if (!r || typeof r !== "object") continue;
      if (typeof r.id !== "string" || !r.id) continue;
      if (typeof r.timeCreated !== "string") continue;
      if (typeof r.model !== "string") continue;
      if (typeof r.inputTokens !== "number") continue;
      if (typeof r.outputTokens !== "number") continue;
      if (typeof r.cacheReadTokens !== "number") continue;
      if (typeof r.cacheCreationTokens !== "number") continue;
      if (typeof r.cost !== "number") continue;
      if (typeof r.reasoningTokens !== "number") continue;
      validRecords.push({
        id: r.id,
        timeCreated: r.timeCreated,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheCreationTokens: r.cacheCreationTokens,
        cost: r.cost,
        reasoningTokens: r.reasoningTokens,
        sessionID: typeof r.sessionID === "string" ? r.sessionID : undefined,
      });
    }
    const strippedRecords = validRecords.length < data.records.length;

    return {
      records: validRecords,
      at: typeof data.at === "number" && data.at > 0 ? data.at : 0,
      complete: !strippedRecords && typeof data.complete === "boolean" ? data.complete : false,
    };
  } catch (_) {
    return { records: [], at: 0, complete: false };
  }
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
    const ta = safeTime(a.timeCreated);
    const tb = safeTime(b.timeCreated);
    return tb - ta;
  });
  return merged;
}

function safeTime(value: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}
