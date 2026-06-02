import { fetchAllPages } from "./parse";
import { loadCache, saveCache, mergeAndSort } from "./cache";
import type { UsageRecord } from "./types";

export async function runPipeline(
  wsId: string,
  cacheKey: string,
  fnId: string,
): Promise<UsageRecord[]> {
  const { records: cached, complete: wasComplete } = loadCache(cacheKey);
  const cachedIds = new Set<string>();
  for (const r of cached) {
    if (r.id) cachedIds.add(r.id);
  }

  const { records: fetched, reachedEnd } = await fetchAllPages(
    wsId, fnId, cachedIds, wasComplete,
  );

  const merged = mergeAndSort(cached, fetched);

  const seen = new Set<string>();
  const deduped = merged.filter(r => {
    if (seen.has(r.id!)) return false;
    seen.add(r.id!);
    return true;
  });

  saveCache(cacheKey, deduped, wasComplete || reachedEnd);
  return deduped;
}
