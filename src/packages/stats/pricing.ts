import type { UsageRecord, ModelPrices, PricingTokenField } from "../core/types";
import { COST_SCALE, TPM_SCALE } from "../core/constants";

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
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

export function estimateModelPrices(records: UsageRecord[]): ModelPrices | null {
  const fields: PricingTokenField[] = ["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens"];
  const active = fields.filter(f => records.some(r => (r[f] || 0) > 0));
  if (active.length === 0) return null;
  const paid = records.filter(r => r.cost > 0);
  if (paid.length < active.length) return null;

  const n = active.length;
  const ATA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const ATb: number[] = new Array(n).fill(0);

  for (const r of paid) {
    const costUSD = r.cost / COST_SCALE;
    const x = active.map(f => (r[f] || 0) / TPM_SCALE);
    for (let i = 0; i < n; i++) {
      ATb[i] += x[i] * costUSD;
      for (let j = 0; j < n; j++) ATA[i][j] += x[i] * x[j];
    }
  }

  const sol = solveLinearSystem(ATA, ATb);
  if (!sol) return null;
  const result: ModelPrices = {};
  for (let i = 0; i < n; i++) result[active[i]] = Math.max(0, sol[i]);
  return result;
}
