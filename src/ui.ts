import type { ModelPrices, ModelStats, StatsResult } from "./types";
import { COST_SCALE, TPM_SCALE } from "./constants";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, any>, children?: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = String(v);
      else if (k.startsWith("data-")) e.setAttribute(k, v);
      else (e as any)[k] = v;
    }
  }
  if (children) {
    for (const c of children) {
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return e;
}

export function buildSection(title: string, desc: string, rows: (string | Node)[][], cols: string[]): HTMLElement {
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
      else if (cell && typeof cell === "object" && (cell as any).nodeType) td.appendChild(cell as Node);
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

export function showLoading(): HTMLElement {
  const root = el("section", { id: "opencode-stats-root" });
  const title = el("div", { id: "opencode-stats-title" }, [
    el("h2", { text: "Stats" }),
    el("p", { text: "Loading usage data..." }),
  ]);
  root.appendChild(title);
  return root;
}

export function injectBaseStyles() {
  const style = el("style");
  style.id = "opencode-stats-css";
  style.textContent = `
    #opencode-stats-root {
      display: flex; flex-direction: column; gap: var(--space-8);
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
}

export function formatUSD(value: number, precision?: number): string {
  if (precision === undefined) {
    precision = 6;
  }
  return "$" + value.toFixed(precision);
}

export function buildPricingTable(modelPrices: Record<string, ModelPrices>): HTMLElement {
  const cols = ["Model", "In $/1M", "Out $/1M", "Cache Rd $/1M"];
  const rows = Object.entries(modelPrices).map(([model, p]) => [
    model,
    p.inputTokens ? "$" + p.inputTokens.toFixed(4) : "-",
    p.outputTokens ? "$" + p.outputTokens.toFixed(4) : "-",
    p.cacheReadTokens ? "$" + p.cacheReadTokens.toFixed(4) : "-",
  ]);
  return buildSection("Estimated Pricing", "$ per 1M tokens fitted from usage records", rows, cols);
}

export function buildSummaryTable(
  modelStats: Record<string, ModelStats>,
  modelPrices: Record<string, ModelPrices>,
  totalTokens: number,
  totalCostUSD: number,
): HTMLElement {
  const cols = ["Model", "Requests", "Input Tok", "Output Tok", "Reason Tok", "Cache Read", "Cost (USD)", "$/1M Tok"];
  const rows = Object.values(modelStats).map(s => {
    const tot = s.inputTokens + s.outputTokens + s.reasoningTokens + s.cacheReadTokens;
    const costUSD = s.totalCost / COST_SCALE;
    const ppm = tot > 0 ? "$" + (costUSD / (tot / TPM_SCALE)).toFixed(4) : "N/A";
    const ep = modelPrices[s.model];
    const row: (string | Node)[] = [
      s.model,
      String(s.requests),
      s.inputTokens.toLocaleString(),
      s.outputTokens.toLocaleString(),
      s.reasoningTokens.toLocaleString(),
      s.cacheReadTokens.toLocaleString(),
      formatUSD(costUSD),
      ppm,
    ];
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
  return buildSection(
    "Per-Model Summary",
    totalTokens.toLocaleString() + " total tokens — " + formatUSD(totalCostUSD) + " total cost",
    rows,
    fullCols,
  );
}
