// Copy-paste into browser console on:
//   https://opencode.ai/workspace/{workspaceID}/usage


(async () => {
  const WS_ID = window.location.pathname.split("/")[2];
  const USAGE_FN_ID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c";

  function serialize(prefix) {
    const ts = Date.now();
    const postfix = "e" + Math.random().toString(36).slice(2, 10);
    const instance = prefix + ":" + ts + ":" + postfix;
    return { instance, ts, postfix };
  }

  async function fetchPage(pageIndex) {
    const { instance } = serialize("server-fn");

    const payload = {
      t: {
        t: 9,
        i: 0,
        l: 2,
        a: [
          { t: 1, s: WS_ID },
          { t: 0, s: pageIndex },
        ],
        o: 0,
      },
      f: 31,
      m: [],
    };

    const res = await fetch("/_server", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-Id": USAGE_FN_ID,
        "X-Server-Instance": instance,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();

    const dataMatch = text.match(/\$R\[0\]=(\[.*\])\s*\)/s);
    if (!dataMatch) {
      console.warn("Could not parse page", pageIndex, "- response:", text.slice(0, 200));
      return [];
    }

    try {
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
          refs[idx] = new Date(val.match(/"([^"]+)"/)[1]);
        } else if (val.startsWith("{")) {
          try { refs[idx] = eval("(" + val + ")"); } catch(e) {}
        } else if (val.startsWith('"')) {
          refs[idx] = val.slice(1, -1);
        }
      }

      const arrayStr = dataMatch[1];
      const recordRx = /\{[^}]+\}/g;
      const records = [];

      while ((m = recordRx.exec(arrayStr)) !== null) {
        try {
          const obj = parseRecordObj(m[0], refs);
          if (obj.id) records.push(obj);
        } catch(e) {}
      }

      return records;
    } catch (e) {
      console.warn("Parse error on page", pageIndex, e);
      return [];
    }
  }

  function parseRecordObj(str, refs) {
    const obj = {};
    const propRx = /(\w+):(\$R\[(\d+)\]|"[^"]*"|null|\d+)/g;
    let m;
    while ((m = propRx.exec(str)) !== null) {
      const key = m[1];
      let val;
      if (m[2] === "null") val = null;
      else if (m[2].startsWith('"')) val = m[2].slice(1, -1);
      else if (/^\d+$/.test(m[2])) val = parseInt(m[2], 10);
      else if (m[3] !== undefined) {
        val = refs[parseInt(m[3], 10)];
      }
      obj[key] = val;
    }
    return obj;
  }

  function formatCost(cost) {
    return "$" + (cost / 1e8).toFixed(6);
  }

  function formatUSD(amount) {
    return "$" + amount.toFixed(6);
  }

  function solveLinearSystem(A, b) {
    const n = b.length;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
      }
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
    const fields = ['inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWrite1hTokens', 'cacheWrite5mTokens'];
    const active = fields.filter(f => records.some(r => (r[f] || 0) > 0));
    if (active.length === 0) return null;
    const paid = records.filter(r => r.cost > 0);
    if (paid.length < active.length) return null;

    const n = active.length;
    const ATA = Array.from({ length: n }, () => new Array(n).fill(0));
    const ATb = new Array(n).fill(0);

    for (const r of paid) {
      const costUSD = r.cost / 1e8;
      const x = active.map(f => (r[f] || 0) / 1_000_000);
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

  console.group("📊 OpenCode Go Usage Stats");
  console.log("Workspace:", WS_ID);
  console.log("Fetching all usage pages...");

  const allRecords = [];
  let page = 0;
  let emptyCount = 0;
  let reachedEnd = false;

  const CACHE_KEY = `opencode_stats_${WS_ID}`;
  let cached = { records: [], ts: 0, complete: false };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch (e) {}
  const cachedIds = new Set(cached.records.map(r => r.id));
  const wasComplete = cached.complete === true;
  if (cached.records.length) {
    console.log("Loaded", cached.records.length, "cached records from", new Date(cached.ts).toLocaleString(),
      wasComplete ? "(complete)" : "(incomplete)");
  }

  while (true) {
    console.log("  Fetching page", page, "...");
    const records = await fetchPage(page);

    if (records.length === 0) {
      emptyCount++;
      if (emptyCount >= 2) { reachedEnd = true; break; }
      page++;
      continue;
    }
    emptyCount = 0;

    const newRecords = records.filter(r => !cachedIds.has(r.id));
    if (wasComplete && newRecords.length === 0) {
      console.log("    Page", page, "already fully cached — caught up!");
      break;
    }
    allRecords.push(...newRecords);
    console.log("    Got", newRecords.length, "new records (total new:", allRecords.length, ")");
    page++;
  }

  const merged = [...allRecords, ...cached.records];
  merged.sort((a, b) => new Date(b.timeCreated) - new Date(a.timeCreated));
  localStorage.setItem(CACHE_KEY, JSON.stringify({ records: merged, ts: Date.now(), complete: wasComplete || reachedEnd }));

  allRecords.length = 0;
  allRecords.push(...merged);

  console.log("Total records:", allRecords.length);

  const modelPrices = {};
  const models = [...new Set(allRecords.map(r => r.model))];
  for (const model of models) {
    const recs = allRecords.filter(r => r.model === model);
    const prices = estimateModelPrices(recs);
    if (prices) modelPrices[model] = prices;
  }

  if (Object.keys(modelPrices).length > 0) {
    console.log("\n--- 🔬 Estimated Pricing ($/1M tokens) ---");
    console.table(Object.entries(modelPrices).map(([model, p]) => ({
      Model: model,
      "In $/1M": p.inputTokens ? "$" + p.inputTokens.toFixed(4) : "-",
      "Out $/1M": p.outputTokens ? "$" + p.outputTokens.toFixed(4) : "-",
      "Cache Rd $/1M": p.cacheReadTokens ? "$" + p.cacheReadTokens.toFixed(4) : "-",
    })));
  }

  const modelStats = {};

  for (const r of allRecords) {
    const model = r.model || "unknown";
    if (!modelStats[model]) {
      modelStats[model] = {
        model,
        provider: r.provider,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        reasoningCost: 0,
        cacheReadCost: 0,
      };
    }
    const s = modelStats[model];
    s.requests++;
    s.inputTokens += r.inputTokens || 0;
    s.outputTokens += r.outputTokens || 0;
    s.reasoningTokens += r.reasoningTokens || 0;
    s.cacheReadTokens += r.cacheReadTokens || 0;
    s.totalCost += r.cost || 0;
    s.inputCost += r.inputCost || 0;
    s.outputCost += r.outputCost || 0;
    s.reasoningCost += r.reasoningCost || 0;
    s.cacheReadCost += r.cacheReadCost || 0;
  }

  console.log("\n--- 📈 Per-Model Summary ---");
  const modelRows = Object.values(modelStats).map(s => {
    const totalTokens = s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens;
    const costUSD = s.totalCost / 1e8;
    const pricePer1M = totalTokens > 0 ? (costUSD / (totalTokens / 1_000_000)).toFixed(4) : "N/A";
    const row = {
      Model: s.model,
      Requests: s.requests,
      "Input Tok": s.inputTokens.toLocaleString(),
      "Output Tok": s.outputTokens.toLocaleString(),
      "Reason Tok": s.reasoningTokens.toLocaleString(),
      "Cache Read": s.cacheReadTokens.toLocaleString(),
      "Total Tok": totalTokens.toLocaleString(),
      "Cost (USD)": formatUSD(costUSD),
      "$/1M Tok": "$" + pricePer1M,
    };
    const ep = modelPrices[s.model];
    if (ep) {
      if (ep.inputTokens) row["In $/1M"] = "$" + ep.inputTokens.toFixed(4);
      if (ep.outputTokens) row["Out $/1M"] = "$" + ep.outputTokens.toFixed(4);
      if (ep.cacheReadTokens) row["Cache Rd $/1M"] = "$" + ep.cacheReadTokens.toFixed(4);
    }
    return row;
  });
  console.table(modelRows);

  const total = Object.values(modelStats).reduce((acc, s) => {
    acc.requests += s.requests;
    acc.inputTokens += s.inputTokens;
    acc.outputTokens += s.outputTokens;
    acc.reasoningTokens += s.reasoningTokens;
    acc.cacheReadTokens += s.cacheReadTokens;
    acc.totalCost += s.totalCost;
    return acc;
  }, { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });

  const totalTokens = total.inputTokens + total.outputTokens + total.reasoningTokens + total.cacheReadTokens;
  const totalCostUSD = total.totalCost / 1e8;
  const overallPricePer1M = totalTokens > 0 ? (totalCostUSD / (totalTokens / 1_000_000)).toFixed(4) : "N/A";

  console.log("\n--- 🏁 Grand Total ---");
  console.log({
    "Total Requests": total.requests.toLocaleString(),
    "Total Input Tokens": total.inputTokens.toLocaleString(),
    "Total Output Tokens": total.outputTokens.toLocaleString(),
    "Total Reasoning Tokens": total.reasoningTokens.toLocaleString(),
    "Total Cache Read Tokens": total.cacheReadTokens.toLocaleString(),
    "Total Tokens (input+output+reasoning)": totalTokens.toLocaleString(),
    "Total Cost": formatUSD(totalCostUSD),
    "Overall $/1M Tokens": "$" + overallPricePer1M,
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
        totalCost: 0,
      };
    }
    const s = sessionStats[key];
    s.requests++;
    s.inputTokens += r.inputTokens || 0;
    s.outputTokens += r.outputTokens || 0;
    s.reasoningTokens += r.reasoningTokens || 0;
    s.totalCost += r.cost || 0;
  }

  console.log("\n--- 📊 Top Sessions by Cost ---");
  console.table(
    Object.values(sessionStats)
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 20)
      .map(s => ({
        "Model/Session": s.model + " / " + s.session,
        Requests: s.requests,
        "Input Tok": s.inputTokens.toLocaleString(),
        "Output Tok": s.outputTokens.toLocaleString(),
        "Reason Tok": s.reasoningTokens.toLocaleString(),
        "Total Cost": formatCost(s.totalCost),
      }))
  );

  console.log("\n✅ Done! All data collected and analyzed.");
  console.groupEnd();

  window.__opencodeStats = {
    records: allRecords,
    modelStats,
    sessionStats,
    total,
  };
  console.log("Data also available at window.__opencodeStats");
})();
