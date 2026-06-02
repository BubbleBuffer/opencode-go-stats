"use strict";
(() => {
  // src/parse.ts
  function serialize(prefix) {
    const ts = Date.now();
    const postfix = "e" + Math.random().toString(36).slice(2, 10);
    const instance = prefix + ":" + ts + ":" + postfix;
    return { instance, ts, postfix };
  }
  async function fetchPage(wsId, fnId, pageIndex) {
    const { instance } = serialize("server-fn");
    const payload = {
      t: { t: 9, i: 0, l: 2, a: [{ t: 1, s: wsId }, { t: 0, s: pageIndex }], o: 0 },
      f: 31,
      m: []
    };
    const res = await fetch("/_server", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-Id": fnId,
        "X-Server-Instance": instance
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text2 = await res.text();
    const dataMatch = text2.match(/\$R\[0\]=(\[.*\])\s*\)/s);
    if (!dataMatch) return [];
    try {
      const refs2 = parseRefs(text2);
      const arrayStr = dataMatch[1];
      const recordRx = /\{[^}]+\}/g;
      const records = [];
      let m2;
      while ((m2 = recordRx.exec(arrayStr)) !== null) {
        try {
          const obj = parseRecordObj(m2[0], refs2);
          if (obj.id) records.push(obj);
        } catch (_) {
        }
      }
      return records;
    } catch (_) {
      return [];
    }
  }
  function parseRefs(text) {
    const refs = {};
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
        try {
          refs[idx] = eval("(" + val + ")");
        } catch (_) {
        }
      } else if (val.startsWith('"')) {
        refs[idx] = val.slice(1, -1);
      }
    }
    return refs;
  }
  function parseRecordObj(str, refs2) {
    const obj = {};
    const propRx = /(\w+):(\$R\[(\d+)\]|"[^"]*"|null|\d+)/g;
    let m2;
    while ((m2 = propRx.exec(str)) !== null) {
      const key = m2[1];
      let val2;
      if (m2[2] === "null") val2 = null;
      else if (m2[2].startsWith('"')) val2 = m2[2].slice(1, -1);
      else if (/^\d+$/.test(m2[2])) val2 = parseInt(m2[2], 10);
      else if (m2[3] !== void 0) val2 = refs2[parseInt(m2[3], 10)];
      obj[key] = val2;
    }
    return obj;
  }

  // src/pricing.ts
  function solveLinearSystem(A, b) {
    const n = b.length;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++)
        if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
      if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-12) return null;
      for (let row = col + 1; row < n; row++) {
        const f = aug[row][col] / aug[col][col];
        for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = aug[i][n];
      for (let j = i + 1; j < n; j++) s -= aug[i][j] * x[j];
      x[i] = s / aug[i][i];
    }
    return x;
  }
  function estimateModelPrices(records) {
    const fields = ["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens", "cacheWrite1hTokens", "cacheWrite5mTokens"];
    const active = fields.filter((f) => records.some((r) => (r[f] || 0) > 0));
    if (active.length === 0) return null;
    const paid = records.filter((r) => r.cost > 0);
    if (paid.length < active.length) return null;
    const n = active.length;
    const ATA = Array.from({ length: n }, () => new Array(n).fill(0));
    const ATb = new Array(n).fill(0);
    for (const r of paid) {
      const costUSD = r.cost / 1e8;
      const x = active.map((f) => (r[f] || 0) / 1e6);
      for (let i = 0; i < n; i++) {
        ATb[i] += x[i] * costUSD;
        for (let j = 0; j < n; j++) ATA[i][j] += x[i] * x[j];
      }
    }
    const sol = solveLinearSystem(ATA, ATb);
    if (!sol) return null;
    const result = {};
    for (let i = 0; i < n; i++) result[active[i]] = Math.max(0, sol[i]);
    return result;
  }

  // src/stats.ts
  function computeStats(records) {
    const models = [...new Set(records.map((r) => r.model || "unknown"))];
    const modelPrices = {};
    for (const model of models) {
      const recs = records.filter((r) => r.model === model);
      const prices = estimateModelPrices(recs);
      if (prices) modelPrices[model] = prices;
    }
    const modelStats = {};
    for (const r of records) {
      const model = r.model || "unknown";
      if (!modelStats[model]) {
        modelStats[model] = {
          model,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0
        };
      }
      const s = modelStats[model];
      s.requests++;
      s.inputTokens += r.inputTokens || 0;
      s.outputTokens += r.outputTokens || 0;
      s.reasoningTokens += r.reasoningTokens || 0;
      s.cacheReadTokens += r.cacheReadTokens || 0;
      s.totalCost += r.cost || 0;
    }
    const total = Object.values(modelStats).reduce((acc, s) => {
      acc.inputTokens += s.inputTokens;
      acc.outputTokens += s.outputTokens;
      acc.reasoningTokens += s.reasoningTokens;
      acc.cacheReadTokens += s.cacheReadTokens;
      acc.totalCost += s.totalCost;
      return acc;
    }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });
    const totalTokens = total.inputTokens + total.outputTokens + total.reasoningTokens + total.cacheReadTokens;
    const totalCostUSD = total.totalCost / 1e8;
    return { modelPrices, modelStats, totalTokens, totalCostUSD };
  }

  // src/cache.ts
  function loadCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {
    }
    return { records: [], ts: 0, complete: false };
  }
  function saveCache(key, records, complete) {
    localStorage.setItem(key, JSON.stringify({
      records,
      ts: Date.now(),
      complete
    }));
  }
  function mergeAndSort(newRecords, cached) {
    const merged = [...newRecords, ...cached];
    merged.sort((a, b) => {
      const ta = a.timeCreated ? Date.parse(a.timeCreated) : 0;
      const tb = b.timeCreated ? Date.parse(b.timeCreated) : 0;
      return tb - ta;
    });
    return merged;
  }

  // src/console.ts
  var WS_ID = window.location.pathname.split("/")[2];
  var FN_ID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c";
  var CACHE_KEY = `opencode_stats_v2_${WS_ID}`;
  (async () => {
    console.group("\u{1F4CA} OpenCode Go Usage Stats");
    console.log("Workspace:", WS_ID);
    console.log("Fetching all usage pages...");
    const cached = loadCache(CACHE_KEY);
    const cachedIds = new Set(cached.records.map((r) => r.id));
    const wasComplete = cached.complete === true;
    if (cached.records.length) {
      console.log(
        "Loaded %d cached records from %s %s",
        cached.records.length,
        new Date(cached.ts).toLocaleString(),
        wasComplete ? "(complete)" : "(incomplete)"
      );
    }
    const allRecords = [];
    let page = 0;
    let emptyCount = 0;
    let reachedEnd = false;
    while (true) {
      console.log("  Fetching page %d ...", page);
      const records = await fetchPage(WS_ID, FN_ID, page);
      if (records.length === 0) {
        emptyCount++;
        if (emptyCount >= 2) {
          reachedEnd = true;
          break;
        }
        page++;
        continue;
      }
      emptyCount = 0;
      const newRecords = records.filter((r) => !cachedIds.has(r.id));
      if (wasComplete && newRecords.length === 0) {
        console.log("    Page %d already fully cached \u2014 caught up!", page);
        break;
      }
      allRecords.push(...newRecords);
      console.log("    Got %d new records (total new: %d)", newRecords.length, allRecords.length);
      page++;
    }
    const merged = mergeAndSort(allRecords, cached.records);
    saveCache(CACHE_KEY, merged, wasComplete || reachedEnd);
    allRecords.length = 0;
    allRecords.push(...merged);
    console.log("Total records:", allRecords.length);
    if (allRecords.length === 0) {
      console.log("No usage data found.");
      console.groupEnd();
      return;
    }
    const { modelPrices, modelStats, totalTokens, totalCostUSD } = computeStats(allRecords);
    if (Object.keys(modelPrices).length > 0) {
      console.log("\n--- \u{1F52C} Estimated Pricing ($/1M tokens) ---");
      console.table(Object.entries(modelPrices).map(([model, p]) => ({
        Model: model,
        "In $/1M": p.inputTokens ? "$" + p.inputTokens.toFixed(4) : "-",
        "Out $/1M": p.outputTokens ? "$" + p.outputTokens.toFixed(4) : "-",
        "Cache Rd $/1M": p.cacheReadTokens ? "$" + p.cacheReadTokens.toFixed(4) : "-"
      })));
    }
    console.log("\n--- \u{1F4C8} Per-Model Summary ---");
    const modelRows = Object.values(modelStats).map((s) => {
      const tot = s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens;
      const costUSD = s.totalCost / 1e8;
      const ppm = tot > 0 ? "$" + (costUSD / (tot / 1e6)).toFixed(4) : "N/A";
      const ep = modelPrices[s.model];
      const row = {
        Model: s.model,
        Requests: s.requests,
        "Input Tok": s.inputTokens.toLocaleString(),
        "Output Tok": s.outputTokens.toLocaleString(),
        "Reason Tok": s.reasoningTokens.toLocaleString(),
        "Cache Read": s.cacheReadTokens.toLocaleString(),
        "Total Tok": tot.toLocaleString(),
        "Cost (USD)": "$" + costUSD.toFixed(6),
        "$/1M Tok": ppm
      };
      if (ep) {
        if (ep.inputTokens) row["In $/1M"] = "$" + ep.inputTokens.toFixed(4);
        if (ep.outputTokens) row["Out $/1M"] = "$" + ep.outputTokens.toFixed(4);
        if (ep.cacheReadTokens) row["Cache Rd $/1M"] = "$" + ep.cacheReadTokens.toFixed(4);
      }
      return row;
    });
    console.table(modelRows);
    const total = Object.values(modelStats).reduce((acc, s) => {
      acc.inputTokens += s.inputTokens;
      acc.outputTokens += s.outputTokens;
      acc.reasoningTokens += s.reasoningTokens;
      acc.cacheReadTokens += s.cacheReadTokens;
      acc.totalCost += s.totalCost;
      return acc;
    }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });
    const overallPPM = totalTokens > 0 ? "$" + (totalCostUSD / (totalTokens / 1e6)).toFixed(4) : "N/A";
    console.log("\n--- \u{1F3C1} Grand Total ---");
    console.log({
      "Total Requests": total.inputTokens > 0 ? "[see per-model]" : "0",
      "Total Input Tokens": total.inputTokens.toLocaleString(),
      "Total Output Tokens": total.outputTokens.toLocaleString(),
      "Total Reasoning Tokens": total.reasoningTokens.toLocaleString(),
      "Total Cache Read Tokens": total.cacheReadTokens.toLocaleString(),
      "Total Tokens": totalTokens.toLocaleString(),
      "Total Cost": "$" + totalCostUSD.toFixed(6),
      "Overall $/1M Tokens": overallPPM
    });
    const sessionStats = {};
    for (const r of allRecords) {
      const key = `${r.model} / ${r.sessionID?.slice(-8) || "?"}`;
      if (!sessionStats[key]) {
        sessionStats[key] = {
          model: r.model,
          session: r.sessionID?.slice(-8),
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          requests: 0,
          totalCost: 0
        };
      }
      const s = sessionStats[key];
      s.requests++;
      s.inputTokens += r.inputTokens || 0;
      s.outputTokens += r.outputTokens || 0;
      s.reasoningTokens += r.reasoningTokens || 0;
      s.totalCost += r.cost || 0;
    }
    console.log("\n--- \u{1F4CA} Top Sessions by Cost ---");
    console.table(
      Object.values(sessionStats).sort((a, b) => b.totalCost - a.totalCost).slice(0, 20).map((s) => ({
        "Model/Session": s.model + " / " + s.session,
        Requests: s.requests,
        "Input Tok": s.inputTokens.toLocaleString(),
        "Output Tok": s.outputTokens.toLocaleString(),
        "Reason Tok": s.reasoningTokens.toLocaleString(),
        "Total Cost": "$" + (s.totalCost / 1e8).toFixed(6)
      }))
    );
    console.log("\n\u2705 Done!");
    console.groupEnd();
    window.__opencodeStats = {
      records: allRecords,
      modelStats,
      sessionStats,
      total,
      modelPrices
    };
    console.log("Data also available at window.__opencodeStats");
  })();
})();
void 0;
