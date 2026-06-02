export interface UsageRecord {
  id?: string;
  timeCreated?: string;
  sessionID?: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWrite1hTokens?: number;
  cacheWrite5mTokens?: number;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  reasoningCost?: number;
  cacheReadCost?: number;
  [key: string]: any;
}

export interface ModelPrices {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWrite1hTokens?: number;
  cacheWrite5mTokens?: number;
  [key: string]: number | undefined;
}

export interface ModelStats {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface StatsResult {
  modelPrices: Record<string, ModelPrices>;
  modelStats: Record<string, ModelStats>;
  totalTokens: number;
  totalCostUSD: number;
}

export interface CacheEntry {
  records: UsageRecord[];
  ts: number;
  complete: boolean;
}
