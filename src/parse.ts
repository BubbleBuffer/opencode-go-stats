import type { UsageRecord } from "./types";

export function serialize(prefix: string) {
  const ts = Date.now();
  const postfix = "e" + Math.random().toString(36).slice(2, 10);
  const instance = prefix + ":" + ts + ":" + postfix;
  return { instance, ts, postfix };
}

export async function fetchPage(wsId: string, fnId: string, pageIndex: number): Promise<UsageRecord[]> {
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
  if (!dataMatch) return [];
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
      } catch (_) {}
    }
    return records;
  } catch (_) {
    return [];
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
    else if (val === "!0") refs[idx] = true;
    else if (val === "!1") refs[idx] = false;
    else if (/^\d+$/.test(val)) refs[idx] = parseInt(val, 10);
    else if (val.startsWith("new Date(")) {
      const dateMatch = val.match(/"([^"]+)"/);
      if (dateMatch) refs[idx] = new Date(dateMatch[1]);
    } else if (val.startsWith("{")) {
      try { refs[idx] = eval("(" + val + ")"); } catch (_) {}
    } else if (val.startsWith('"')) {
      refs[idx] = val.slice(1, -1);
    }
  }
  return refs;
}

function parseRecordObj(str: string, refs: Record<number, any>): Record<string, any> {
  const obj: Record<string, any> = {};
  const propRx = /(\w+):(\$R\[(\d+)\]|"[^"]*"|null|\d+)/g;
  let m;
  while ((m = propRx.exec(str)) !== null) {
    const key = m[1];
    let val: any;
    if (m[2] === "null") val = null;
    else if (m[2].startsWith('"')) val = m[2].slice(1, -1);
    else if (/^\d+$/.test(m[2])) val = parseInt(m[2], 10);
    else if (m[3] !== undefined) val = refs[parseInt(m[3], 10)];
    obj[key] = val;
  }
  return obj;
}
