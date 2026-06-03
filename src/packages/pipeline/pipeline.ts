import { fetchAllPages } from "../api/parse";
import { loadCache, saveCache, mergeAndSort } from "../cache/cache";
import type { UsageRecord } from "../core/types";
import { FN_ID } from "../core/constants";

export async function runPipeline(
  wsId: string,
  cacheKey: string,
): Promise<UsageRecord[]> {
  const cache = loadCache(cacheKey);
  const { records: cached, complete: wasComplete } = cache;

  const cachedIds = new Set<string>();
  for (const r of cached) {
    if (r.id) cachedIds.add(r.id);
  }

  const { records: fetched, reachedEnd } = await fetchAllPages(
    wsId, FN_ID, cachedIds, wasComplete,
  );

  const merged = mergeAndSort(fetched, cached);

  const seen = new Set<string>();
  const deduped = merged.filter(r => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  saveCache(cacheKey, deduped, wasComplete || reachedEnd);
  return deduped;
}
