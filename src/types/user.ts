/** Time window for usage accumulation. */
export type UsageWindow = 'daily' | 'monthly' | 'rolling_24h';

export interface EndUserIdentity {
  endUserId: string;
  orgId?: string;
  email?: string;
  name?: string;
}

export interface EndUserUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastUpdated: Date;
}

export interface EndUserThreshold {
  maxCostUsd?: number;
  maxTotalTokens?: number;
}

export interface ConnectionContext {
  connectionId: string;
  endUserId: string;
  orgId?: string;
  email?: string;
  name?: string;
  conversationId: string;
  model: string;
  connectedAt: Date;
}

/** Time-period key for usage aggregation (e.g. daily:2025-02-02, monthly:2025-02). */
export type UsagePeriodKey = string;

/** One period in an end user's usage history (tokens/cost for that period). */
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
