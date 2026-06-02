(async () => {
  if (document.getElementById("opencode-stats-root")) return;

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
      t: { t: 9, i: 0, l: 2, a: [{ t: 1, s: WS_ID }, { t: 0, s: pageIndex }], o: 0 },
      f: 31, m: [],
    };
    const res = await fetch("/_server", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Server-Id": USAGE_FN_ID, "X-Server-Instance": instance },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
    const dataMatch = text.match(/\$R\[0\]=(\[.*\])\s*\)/s);
    if (!dataMatch) return [];
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
        else if (val.startsWith("new Date(")) refs[idx] = new Date(val.match(/"([^"]+)"/)[1]);
        else if (val.startsWith("{")) { try { refs[idx] = eval("(" + val + ")"); } catch(e) {} }
        else if (val.startsWith('"')) refs[idx] = val.slice(1, -1);
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
    } catch (e) { return []; }
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
      else if (m[3] !== undefined) val = refs[parseInt(m[3], 10)];
      obj[key] = val;
    }
    return obj;
  }

  function formatUSD(amount) { return "$" + amount.toFixed(6); }

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

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = v;
      else if (k.startsWith("data-")) e.setAttribute(k, v);
      else e[k] = v;
    }
    if (children) for (const c of children) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return e;
  }

  function buildSection(title, desc, rows, cols) {
    const section = el("section", { id: "opencode-stats-section" });
    const titleDiv = el("div", { id: "opencode-stats-title" }, [
      el("h2", { text: title }),
      el("p", { text: desc }),
    ]);
    section.appendChild(titleDiv);

    const tableWrap = el("div", { id: "opencode-stats-table-wrap" });
    const table = el("table", { id: "opencode-stats-table" });
    const thead = el("thead");
    const headerRow = el("tr");
    for (const col of cols) headerRow.appendChild(el("th", { text: col }));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const row of rows) {
      const tr = el("tr");
      for (const cell of row) {
        const td = el("td");
        if (typeof cell === "string") td.textContent = cell;
        else if (cell && typeof cell === "object" && cell.nodeType) tr.appendChild(cell);
        else td.textContent = String(cell ?? "");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
    return section;
  }

  function showLoading() {
    const root = el("section", { id: "opencode-stats-root" });
    const title = el("div", { id: "opencode-stats-title" }, [
      el("h2", { text: "Stats" }),
      el("p", { text: "Loading usage data..." }),
    ]);
    root.appendChild(title);
    return root;
  }

  // -- Inject styles --
  const style = el("style");
  style.id = "opencode-stats-css";
  style.textContent = `
    #opencode-stats-root {
      display: flex; flex-direction: column; gap: var(--space-8);
      margin-top: var(--space-8);
    }
    #opencode-stats-section {
      display: flex; flex-direction: column; gap: var(--space-8);
    }
    #opencode-stats-section:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
      padding-bottom: var(--space-16);
    }
    #opencode-stats-title {
      display: flex; flex-direction: column; gap: var(--space-1);
    }
    #opencode-stats-title h2 {
      font-size: var(--font-size-md); font-weight: 600; line-height: 1.2;
      letter-spacing: -0.03125rem; margin: 0; color: var(--color-text);
    }
    #opencode-stats-title p {
      line-height: 1.5; font-size: var(--font-size-md);
      color: var(--color-text-muted);
    }
    #opencode-stats-table-wrap { overflow-x: auto; }
    #opencode-stats-table {
      width: 100%; border-collapse: collapse; font-size: var(--font-size-sm);
      font-family: var(--font-mono);
    }
    #opencode-stats-table thead {
      border-bottom: 1px solid var(--color-border);
    }
    #opencode-stats-table th {
      padding: var(--space-3) var(--space-4); text-align: left;
      font-weight: normal; color: var(--color-text-muted); text-transform: uppercase;
    }
    #opencode-stats-table td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-muted);
      color: var(--color-text-muted);
    }
    #opencode-stats-table tbody tr:last-child td { border-bottom: none; }
  `;
  document.head.appendChild(style);

  // -- Find injection point --
  const sections = document.querySelector('[data-slot="sections"]');
  if (!sections) return;
  const root = showLoading();
  const usageSection = sections.querySelector('[data-slot="usage-table"]')?.closest('section');
  if (usageSection) sections.insertBefore(root, usageSection);
  else sections.appendChild(root);

  // -- Fetch & cache --
  const CACHE_KEY = `opencode_ext_stats_v2_${WS_ID}`;
  let cached = { records: [], ts: 0, complete: false };
  try { const raw = localStorage.getItem(CACHE_KEY); if (raw) cached = JSON.parse(raw); } catch(e) {}
  const cachedIds = new Set(cached.records.map(r => r.id));
  const wasComplete = cached.complete === true;

  const allRecords = [];
  let page = 0, emptyCount = 0, reachedEnd = false;

  while (true) {
    const records = await fetchPage(page);
    if (records.length === 0) { emptyCount++; if (emptyCount >= 2) { reachedEnd = true; break; } page++; continue; }
    emptyCount = 0;
    const newRecords = records.filter(r => !cachedIds.has(r.id));
    if (wasComplete && newRecords.length === 0) break;
    allRecords.push(...newRecords);
    page++;
  }

  const merged = [...allRecords, ...cached.records];
  merged.sort((a, b) => Date.parse(b.timeCreated || '') - Date.parse(a.timeCreated || ''));
  localStorage.setItem(CACHE_KEY, JSON.stringify({ records: merged, ts: Date.now(), complete: wasComplete || reachedEnd }));
  allRecords.length = 0;
  allRecords.push(...merged);

  console.log("Total records:", allRecords.length);

  if (allRecords.length === 0) {
    root.querySelector("p").textContent = "No usage data found.";
    return;
  }

  function computeStats(records) {
    const modelPrices = {};
    for (const model of [...new Set(records.map(r => r.model))]) {
      const recs = records.filter(r => r.model === model);
      const prices = estimateModelPrices(recs);
      if (prices) modelPrices[model] = prices;
    }
    const modelStats = {};
    for (const r of records) {
      const model = r.model || "unknown";
      if (!modelStats[model]) modelStats[model] = { model, requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 };
      const s = modelStats[model];
      s.requests++;
      s.inputTokens += r.inputTokens || 0;
      s.outputTokens += r.outputTokens || 0;
      s.reasoningTokens += r.reasoningTokens || 0;
      s.cacheReadTokens += r.cacheReadTokens || 0;
      s.totalCost += r.cost || 0;
    }
    const total = Object.values(modelStats).reduce((acc, s) => {
      acc.inputTokens += s.inputTokens; acc.outputTokens += s.outputTokens;
      acc.reasoningTokens += s.reasoningTokens; acc.cacheReadTokens += s.cacheReadTokens;
      acc.totalCost += s.totalCost; return acc;
    }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalCost: 0 });
    const totalTokens = total.inputTokens + total.outputTokens + total.reasoningTokens + total.cacheReadTokens;
    const totalCostUSD = total.totalCost / 1e8;
    return { modelPrices, modelStats, totalTokens, totalCostUSD };
  }

  function buildPricingTable(modelPrices) {
    const cols = ["Model", "In $/1M", "Out $/1M", "Cache Rd $/1M"];
    const rows = Object.entries(modelPrices).map(([model, p]) => [
      model, p.inputTokens ? "$" + p.inputTokens.toFixed(4) : "-",
      p.outputTokens ? "$" + p.outputTokens.toFixed(4) : "-",
      p.cacheReadTokens ? "$" + p.cacheReadTokens.toFixed(4) : "-",
    ]);
    return buildSection("Estimated Pricing", "$ per 1M tokens fitted from usage records", rows, cols);
  }

  function buildSummaryTable(modelStats, modelPrices, totalTokens, totalCostUSD) {
    const cols = ["Model", "Requests", "Input Tok", "Output Tok", "Reason Tok", "Cache Read", "Cost (USD)", "$/1M Tok"];
    const rows = Object.values(modelStats).map(s => {
      const tot = s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens;
      const costUSD = s.totalCost / 1e8;
      const ppm = tot > 0 ? "$" + (costUSD / (tot / 1_000_000)).toFixed(4) : "N/A";
      const ep = modelPrices[s.model];
      const row = [s.model, String(s.requests), s.inputTokens.toLocaleString(), s.outputTokens.toLocaleString(),
        s.reasoningTokens.toLocaleString(), s.cacheReadTokens.toLocaleString(), formatUSD(costUSD), ppm];
      if (ep) {
        if (ep.inputTokens) row.push("$" + ep.inputTokens.toFixed(4));
        if (ep.outputTokens) row.push("$" + ep.outputTokens.toFixed(4));
        if (ep.cacheReadTokens) row.push("$" + ep.cacheReadTokens.toFixed(4));
      }
      return row;
    });
    const fullCols = [...cols];
    const sample = Object.values(modelStats)[0];
    if (sample) {
      const ep = modelPrices[sample.model];
      if (ep?.inputTokens) fullCols.push("In $/1M");
      if (ep?.outputTokens) fullCols.push("Out $/1M");
      if (ep?.cacheReadTokens) fullCols.push("Cache Rd $/1M");
    }
    return buildSection("Per-Model Summary", totalTokens.toLocaleString() + " total tokens — " + formatUSD(totalCostUSD) + " total cost", rows, fullCols);
  }

  const dateRanges = [
    { label: 'All', fn: r => !!r.timeCreated },
    { label: 'Today', fn: r => new Date(r.timeCreated).toDateString() === new Date().toDateString() },
    { label: '7d', fn: r => Date.now() - new Date(r.timeCreated).getTime() < 7 * 864e5 },
    { label: '30d', fn: r => Date.now() - new Date(r.timeCreated).getTime() < 30 * 864e5 },
    { label: '90d', fn: r => Date.now() - new Date(r.timeCreated).getTime() < 90 * 864e5 },
    { label: '1y', fn: r => Date.now() - new Date(r.timeCreated).getTime() < 365 * 864e5 },
  ];

  let activeRange = 0, currentStats = null, filterBtns = null;
  function applyFilter(rangeIdx) {
    activeRange = rangeIdx;
    const records = allRecords.filter(dateRanges[rangeIdx].fn);
    currentStats = computeStats(records);
    const { modelPrices, modelStats, totalTokens, totalCostUSD } = currentStats;
    root.innerHTML = '';
    root.id = 'opencode-stats-root';
    root.appendChild(buildPricingTable(modelPrices));
    root.appendChild(buildSummaryTable(modelStats, modelPrices, totalTokens, totalCostUSD));
    if (filterBtns) for (const btn of filterBtns) btn.classList.toggle('active', dateRanges.indexOf(btn.__range) === rangeIdx);
  }

  applyFilter(0);

  // -- Charts --
  const Chart = await new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { console.warn('[oc-stats] failed to load Chart.js from CDN'); resolve(null); };
    document.head.appendChild(s);
  });
  if (Chart) {
    const filterBar = el("div", { id: "oc-filter-bar" });
    const fStyle = el("style");
    fStyle.textContent = `
      #oc-filter-bar { display: flex; gap: var(--space-1); margin-bottom: var(--space-3); }
      #oc-filter-bar button { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); color: var(--color-text-muted); cursor: pointer; padding: var(--space-1) var(--space-2-5); font-size: var(--font-size-xs); font-family: var(--font-sans); }
      #oc-filter-bar button:hover { color: var(--color-text); border-color: var(--color-accent); }
      #oc-filter-bar button.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
    `;
    document.head.appendChild(fStyle);
    filterBtns = dateRanges.map(r => {
      const btn = el("button", { text: r.label });
      btn.__range = r;
      btn.addEventListener('click', () => { applyFilter(dateRanges.indexOf(r)); if (chartInst) showChart(chartIdx); });
      filterBar.appendChild(btn);
      return btn;
    });
    applyFilter(0);

    const COLORS = ['#007aff','#ff9f0a','#30d158','#ff375f','#5e5ce6','#64d2ff','#ffd60a','#bf5af2','#ff6482','#32d74b'];

    const navStyle = el("style");
    navStyle.textContent = `
      #oc-chart-nav { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
      #oc-chart-nav button { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); color: var(--color-text); cursor: pointer; padding: var(--space-1-5) var(--space-3); font-size: var(--font-size-sm); }
      #oc-chart-nav button:hover { border-color: var(--color-accent); }
      #oc-chart-nav button:disabled { opacity: 0.3; cursor: default; }
      #oc-chart-label { flex: 1; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); font-family: var(--font-sans); }
    `;
    document.head.appendChild(navStyle);

    const nav = el("div", { id: "oc-chart-nav" });
    const prevBtn = el("button", { text: "←" });
    const nextBtn = el("button", { text: "→" });
    const label = el("span", { id: "oc-chart-label" });
    nav.appendChild(prevBtn);
    nav.appendChild(label);
    nav.appendChild(nextBtn);

    const canvas = document.createElement('canvas');
    canvas.id = 'oc-chart-canvas';
    const chartWrap = el("div");
    chartWrap.style.cssText = 'height:400px;position:relative';
    chartWrap.appendChild(canvas);

    const chartSection = el("div", { id: "opencode-stats-section" });
    chartSection.appendChild(filterBar);
    chartSection.appendChild(nav);
    chartSection.appendChild(chartWrap);
    root.appendChild(chartSection);

    const pageChart = document.querySelector('[data-slot="chart-container"]');
    if (pageChart) pageChart.style.display = 'none';

    let chartIdx = 0, chartInst = null;

    const charts = [
      { name: 'Cost by Model', render: () => {
        const { modelStats, modelPrices } = currentStats;
        const byModel = Object.entries(modelStats).sort((a,b) => b[1].totalCost - a[1].totalCost);
        const ep = modelPrices;
        return new Chart(canvas, { type: 'bar', data: {
          labels: byModel.map(([m]) => m),
          datasets: [
            { label: 'Input', data: byModel.map(([m,s]) => +((s.inputTokens / 1e6) * (ep[m]?.inputTokens || 0)).toFixed(6)), backgroundColor: COLORS[0] },
            { label: 'Output', data: byModel.map(([m,s]) => +((s.outputTokens / 1e6) * (ep[m]?.outputTokens || 0)).toFixed(6)), backgroundColor: COLORS[1] },
            { label: 'Cache Rd', data: byModel.map(([m,s]) => +((s.cacheReadTokens / 1e6) * (ep[m]?.cacheReadTokens || 0)).toFixed(6)), backgroundColor: COLORS[3] },
            { label: 'Actual', data: byModel.map(([,s]) => +(s.totalCost / 1e8).toFixed(6)), type: 'line', borderColor: COLORS[4], borderWidth: 2, pointRadius: 4, pointBackgroundColor: COLORS[4], fill: false, tension: 0.1 },
          ]
        }, options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { position: 'bottom', labels: { color: '#a1a1a6', font: { family: 'IBM Plex Mono', size: 11 } } },
            tooltip: { callbacks: { label: ctx => {
              const [m, s] = byModel[ctx.dataIndex];
              if (ctx.dataset.label === 'Actual') return 'Actual: $' + (+ctx.raw).toFixed(4) + ' | ' + s.requests + ' reqs | ' + (s.inputTokens + s.outputTokens).toLocaleString() + ' tok';
              return ctx.dataset.label + ': $' + (+ctx.raw).toFixed(4);
            }}}},
          scales: { x: { stacked: true, ticks: { color: '#6e6e73', callback: v => '$' + v }, grid: { color: '#2c2c2e' } }, y: { stacked: true, ticks: { color: '#a1a1a6', font: { size: 10 } }, grid: { display: false } } }
        }});
      }},
      { name: 'Daily Cost + Cumulative', render: () => {
        const { modelStats, totalCostUSD } = currentStats;
        const models = Object.keys(modelStats);
        const daily = {};
        for (const r of allRecords.filter(dateRanges[activeRange].fn)) {
          if (!r.timeCreated) continue;
          const d = new Date(r.timeCreated).toISOString().slice(0, 10);
          if (!daily[d]) daily[d] = {};
          daily[d][r.model] = (daily[d][r.model] || 0) + (r.cost || 0) / 1e8;
        }
        const days = Object.keys(daily).sort();
        const cumLine = [];
        let c = 0;
        for (const d of days) {
          for (const m of models) c += daily[d]?.[m] || 0;
          cumLine.push(+c.toFixed(6));
        }
        return new Chart(canvas, { type: 'bar', data: {
          labels: days,
          datasets: [
            ...models.map((m, i) => ({ label: m, data: days.map(d => +(daily[d]?.[m] || 0).toFixed(6)), backgroundColor: COLORS[i % COLORS.length], stack: 'cost' })),
            { label: 'Cumulative', data: cumLine, type: 'line', borderColor: '#ffffff', backgroundColor: '#ffffff22', borderWidth: 2, fill: true, pointRadius: 0, tension: 0.1, yAxisID: 'y1', stack: 'cum' },
          ]
        }, options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#a1a1a6', font: { family: 'IBM Plex Mono', size: 11 } } },
            tooltip: { callbacks: { label: ctx => {
              if (ctx.dataset.yAxisID === 'y1') return 'Total: $' + (+ctx.raw).toFixed(2);
              const dayTotal = days.length ? models.reduce((s,m) => s + (daily[days[ctx.dataIndex]]?.[m] || 0), 0) : 0;
              return ctx.dataset.label + ': $' + (+ctx.raw).toFixed(4) + (dayTotal > 0 ? ' (' + ((+ctx.raw / dayTotal) * 100).toFixed(0) + '% of day)' : '');
            }}}},
          scales: {
            x: { stacked: true, ticks: { color: '#6e6e73', maxTicksLimit: 14, font: { size: 9 } }, grid: { display: false } },
            y: { stacked: true, position: 'left', ticks: { color: '#6e6e73', callback: v => '$' + v }, grid: { color: '#2c2c2e' } },
            y1: { position: 'right', ticks: { color: '#ffffff', callback: v => '$' + v.toFixed(2) }, grid: { display: false } },
          }
        }});
      }},
      { name: 'Cost Share', render: () => {
        const { modelStats, totalCostUSD } = currentStats;
        const sorted = Object.entries(modelStats).sort((a,b) => b[1].totalCost - a[1].totalCost);
        return new Chart(canvas, { type: 'doughnut', data: {
          labels: sorted.map(([m]) => m),
          datasets: [{ data: sorted.map(([,s]) => +(s.totalCost / 1e8).toFixed(6)), backgroundColor: COLORS, borderColor: '#0c0c0e', borderWidth: 2 }]
        }, options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#a1a1a6', font: { family: 'IBM Plex Mono', size: 11 }, padding: 12 } },
            tooltip: { callbacks: { label: ctx => {
              const [, s] = sorted[ctx.dataIndex];
              const pct = totalCostUSD > 0 ? ((ctx.raw / totalCostUSD) * 100).toFixed(1) : '0';
              const tok = (s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens).toLocaleString();
              return ctx.label + ': $' + (+ctx.raw).toFixed(4) + ' (' + pct + '%) | ' + tok + ' tok | ' + s.requests + ' reqs';
            }}}},
        }});
      }},
    ];

    function showChart(i) {
      if (chartInst) chartInst.destroy();
      try { chartInst = charts[i].render(); } catch(e) { console.warn('Chart render error:', e); }
      label.textContent = charts[i].name;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === charts.length - 1;
      chartIdx = i;
    }

    prevBtn.addEventListener('click', () => { if (chartIdx > 0) showChart(chartIdx - 1); });
    nextBtn.addEventListener('click', () => { if (chartIdx < charts.length - 1) showChart(chartIdx + 1); });
    showChart(0);
  }
})();
