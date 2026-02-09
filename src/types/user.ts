/** Time window for usage accumulation. */
export type UsageWindow = 'daily' | 'monthly' | 'rolling_24h';

export interface UserIdentity {
  userId: string;
  orgId?: string;
}

export interface UserUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastUpdated: Date;
}

export interface UserThreshold {
  maxCostUsd?: number;
  maxTotalTokens?: number;
}

export interface ConnectionContext {
  connectionId: string;
  userId: string;
  orgId?: string;
  model: string;
  connectedAt: Date;
}

/** Time-period key for usage aggregation (e.g. daily:2025-02-02, monthly:2025-02). */
export type UsagePeriodKey = string;

/** One period in a user's usage history (tokens/cost for that period). */
export interface UsageHistoryEntry {
  periodKey: string;
  /** Human-readable label (e.g. "2025-02-02" for daily, "Feb 2025" for monthly). */
  periodLabel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastUpdated: Date;
}
