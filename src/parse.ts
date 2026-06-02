import type { UsageRecord } from "./types";

export function serialize(prefix: string) {
  const ts = Date.now();
  const postfix = "e" + Math.random().toString(36).slice(2, 10);
  const instance = prefix + ":" + ts + ":" + postfix;
  return { instance, ts, postfix };
}

export async function fetchAllPages(
  wsId: string,
  fnId: string,
  cachedIds: Set<string>,
  wasComplete: boolean,
  batchSize = 8,
): Promise<{ records: UsageRecord[]; reachedEnd: boolean }> {
  const allRecords: UsageRecord[] = [];
  let page = 0;
  let consecutiveEmpties = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  const MAX_PAGES = 10000;
  while (page < MAX_PAGES) {
    const batchPages: number[] = [];
    for (let i = 0; i < batchSize && page + i < MAX_PAGES; i++) batchPages.push(page + i);

    const results = await Promise.all(
      batchPages.map(p =>
        fetchPage(wsId, fnId, p).catch(e => {
          console.warn("[oc-stats] fetch error on page", p, ":", e instanceof Error ? e.message : e);
          return { records: [] as UsageRecord[], error: true };
        })
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if ("error" in result && result.error) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error("[oc-stats] too many consecutive fetch errors, stopping pagination");
          return { records: allRecords, reachedEnd: false };
        }
        continue;
      }

      consecutiveErrors = 0;
      const records = result.records;

      if (records.length === 0) {
        consecutiveEmpties++;
        if (consecutiveEmpties >= 2) return { records: allRecords, reachedEnd: true };
      } else {
        consecutiveEmpties = 0;
        const newRecords = records.filter(r => !cachedIds.has(r.id!));
        for (const r of newRecords) {
          if (r.id) cachedIds.add(r.id);
        }
        if (wasComplete && newRecords.length === 0 && i === 0 && page === 0) {
          return { records: allRecords, reachedEnd: false };
        }
        allRecords.push(...newRecords);
      }
    }

    page += batchSize;
  }
  return { records: allRecords, reachedEnd: false };
}

export async function fetchPage(wsId: string, fnId: string, pageIndex: number): Promise<{ records: UsageRecord[]; error?: boolean }> {
  const { instance } = serialize("server-fn");
  const payload = {
    t: { t: 9, i: 0, l: 2, a: [{ t: 1, s: wsId }, { t: 0, s: pageIndex }], o: 0 },
    f: 31, m: [],
  };
  const res = await fetch("/_server", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Server-Id": fnId,
      "X-Server-Instance": instance,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const dataMatch = text.match(/\$R\[0\]=(\[.*\])\s*\)/s);
  if (!dataMatch) {
    console.warn("[oc-stats] page %d: no data match in response", pageIndex);
    return { records: [] };
  }
  try {
    const refs = parseRefs(text);
    const arrayStr = dataMatch[1];
    const recordRx = /\{[^}]+\}/g;
    const records: UsageRecord[] = [];
    let m;
    while ((m = recordRx.exec(arrayStr)) !== null) {
      try {
        const obj = parseRecordObj(m[0], refs);
        if (obj.id) records.push(obj);
      } catch (e) {
        console.warn("[oc-stats] page %d: failed to parse record", pageIndex, e);
      }
    }
    return { records };
  } catch (e) {
    console.warn("[oc-stats] page %d: full parse failure", pageIndex, e);
    return { records: [] };
  }
}

function parseRefs(text: string): Record<number, any> {
  const refs: Record<number, any> = {};
  const refRx = /\$R\[(\d+)\]=(new Date\("[^"]+"\)|null|[+-]?\d+(?:\.\d+)?|"[^"]*")/g;
  let m;
  while ((m = refRx.exec(text)) !== null) {
    const idx = parseInt(m[1], 10);
    let val = m[2];
    if (val === "null") refs[idx] = null;
    else if (/^[+-]?\d+$/.test(val)) refs[idx] = parseInt(val, 10);
    else if (/^[+-]?\d+\.\d+$/.test(val)) refs[idx] = parseFloat(val);
    else if (val.startsWith("new Date(")) {
      const dateMatch = val.match(/"([^"]+)"/);
      if (dateMatch) refs[idx] = new Date(dateMatch[1]);
    } else if (val.startsWith('"')) {
      refs[idx] = val.slice(1, -1);
    } else {
      console.warn("[oc-stats] unhandled ref value type at idx", idx, ":", val);
    }
  }
  return refs;
}

function parseRecordObj(str: string, refs: Record<number, any>): Record<string, any> {
  const obj: Record<string, any> = {};
  const propRx = /(\w+):(\$R\[(\d+)\]|"[^"]*"|null|[+-]?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = propRx.exec(str)) !== null) {
    const key = m[1];
    let val: any;
    if (m[2] === "null") val = null;
    else if (m[2].startsWith('"')) val = m[2].slice(1, -1);
    else if (/^[+-]?\d+$/.test(m[2])) val = parseInt(m[2], 10);
    else if (/^[+-]?\d+\.\d+$/.test(m[2])) val = parseFloat(m[2]);
    else if (m[3] !== undefined) val = refs[parseInt(m[3], 10)];
    obj[key] = val;
  }
  return obj;
}

export { parseRefs, parseRecordObj };
