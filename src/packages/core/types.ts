/** Raw record from the server API before validation. Fields may be missing/null. */
export interface RawApiRecord {
  id?: string;
  timeCreated?: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
  cost?: number | null;
  sessionID?: string | null;
  reasoningTokens?: number | null;
}

/** Validated usage record with required fields present. */
export interface UsageRecord {
  id: string;
  timeCreated: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;
  reasoningTokens: number;
  sessionID?: string;
}

export type PricingTokenField = "inputTokens" | "outputTokens" | "reasoningTokens" | "cacheReadTokens";

export type ModelPrices = Partial<Record<PricingTokenField, number>>;

export interface ModelStats {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface TotalBreakdown {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface StatsResult {
  modelPrices: Record<string, ModelPrices>;
  modelStats: Record<string, ModelStats>;
  total: TotalBreakdown;
  totalTokens: number;
  totalCostUSD: number;
}

export interface CacheEntry {
  records: UsageRecord[];
  at: number;
  complete: boolean;
}
