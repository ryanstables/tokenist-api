// ─── Client Configuration ────────────────────────────────────────────────────

export interface TokenistClientOptions {
  /** API key used to authenticate requests (passed as Bearer token). */
  apiKey: string;
  /** Base URL of your Tokenist deployment, e.g. "https://tokenist.example.com". */
  baseUrl: string;
}

// ─── Common ──────────────────────────────────────────────────────────────────

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

// ─── Usage & Thresholds ──────────────────────────────────────────────────────

export interface EndUserUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastUpdated: string | null;
}

export interface EndUserThreshold {
  maxCostUsd?: number;
  maxTotalTokens?: number;
}

// ─── Admin – Users ───────────────────────────────────────────────────────────

export interface EndUserRecord {
  /** The API returns `userId`, not `endUserId`. */
  userId: string;
  usage: EndUserUsage;
  threshold: EndUserThreshold;
  blocked: boolean;
}

export interface ListUsersResponse {
  users: EndUserRecord[];
}

export interface UserDetailsResponse {
  userId: string;
  usage: EndUserUsage;
  threshold: EndUserThreshold;
  blocked: boolean;
  blockEntry: BlockEntry | null;
}

export interface BlockUserRequest {
  reason?: string;
  expiresAt?: string;
}

export interface BlockEntry {
  /** The API returns `userId`, not `endUserId`. */
  userId: string;
  reason?: string;
  blockedAt: string;
  expiresAt?: string | null;
}

export interface ListBlockedResponse {
  blocked: BlockEntry[];
}

export interface ListOrgBlockedResponse {
  blocked: BlockEntry[];
  count: number;
}

export interface SetThresholdRequest {
  maxCostUsd?: number;
  maxTotalTokens?: number;
}

// ─── Admin – Orgs ────────────────────────────────────────────────────────────

export type UsagePeriod = "daily" | "monthly" | "rolling_24h";

export interface OrgSummaryOptions {
  period?: UsagePeriod;
}

export interface OrgSummaryUser {
  userId: string;
  displayName: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    lastUpdated: string | null;
  };
}

export interface OrgSummary {
  orgId: string;
  period: UsagePeriod;
  /** Human-readable label for the period, e.g. "Feb 2026" or "2026-02-21". */
  periodLabel: string;
  /** Total cost across all users in the period (field is `totalCost`, not `totalCostUsd`). */
  totalCost: number;
  userCount: number;
  users: OrgSummaryUser[];
  featureFilter: string | null;
}

export interface OrgEndUser {
  /** The API returns `id`, not `endUserId`. */
  id: string;
  /** Display name derived from user name, email, or id. */
  displayName: string;
  email: string | null;
}

// ─── Admin – Logs ────────────────────────────────────────────────────────────

export interface RequestLogTokenDetails {
  cachedInputTokens: number | null;
  textInputTokens: number | null;
  audioInputTokens: number | null;
  imageInputTokens: number | null;
  textOutputTokens: number | null;
  audioOutputTokens: number | null;
  reasoningTokens: number | null;
}

export interface RequestLog {
  id: string;
  /** The API serialises `endUserId` as `userId`. */
  userId: string;
  orgId: string | null;
  /** The API serialises `endUserEmail` as `userEmail`. */
  userEmail: string | null;
  /** The API serialises `endUserName` as `userName`. */
  userName: string | null;
  conversationId: string;
  model: string;
  feature: string | null;
  requestBody: string;
  responseBody: string | null;
  status: "success" | "error";
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** Granular token breakdown, nested under `tokenDetails`. */
  tokenDetails: RequestLogTokenDetails;
  costUsd: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface ListLogsOptions extends PaginationOptions {}

export interface ListLogsResponse {
  logs: RequestLog[];
  total: number;
}

// ─── Admin – Policies ────────────────────────────────────────────────────────

export interface Policy {
  id: string;
  name: string;
  description: string;
  source: "openai_moderation" | "custom";
  createdAt: string;
}

export interface CreatePolicyRequest {
  name: string;
  /** Required — the API returns 400 when description is omitted. */
  description: string;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
}

// ─── Admin – Rules ───────────────────────────────────────────────────────────

/** Subject types used by the rules engine. */
export type SubjectType = "user" | "group" | "feature";

/** Restriction/action types applied when a rule triggers. */
export type RestrictionType = "warning" | "rate_limit" | "throttle" | "block";

export interface RuleSubject {
  type: SubjectType;
  ids: string[];
}

export interface RuleNotifications {
  webhookUrl?: string;
  injectResponse?: boolean;
  responseMessage?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  subject: RuleSubject;
  trigger: Record<string, unknown> & { type: string };
  restriction: Record<string, unknown> & { type: RestrictionType };
  notifications: RuleNotifications;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastTriggeredAt?: string | null;
}

export interface ListRulesResponse {
  rules: Rule[];
  total: number;
}

export interface CreateRuleRequest {
  name: string;
  enabled?: boolean;
  subject: RuleSubject;
  trigger: Record<string, unknown> & { type: string };
  restriction: Record<string, unknown> & { type: RestrictionType };
  notifications: RuleNotifications;
}

export interface UpdateRuleRequest {
  name?: string;
  enabled?: boolean;
  subject?: RuleSubject;
  trigger?: Record<string, unknown> & { type: string };
  restriction?: Record<string, unknown> & { type: RestrictionType };
  notifications?: RuleNotifications;
}

export interface ListRulesOptions {
  subjectType?: SubjectType;
  restrictionType?: RestrictionType;
  enabled?: boolean;
}

export interface RuleHistoryEntry {
  id: string;
  ruleId: string;
  action: "created" | "updated" | "enabled" | "disabled" | "deleted";
  changes?: Record<string, { from: unknown; to: unknown }>;
  /** ISO timestamp of when the change occurred (field is `timestamp`, not `changedAt`). */
  timestamp: string;
  userId?: string;
}

export interface ListRuleHistoryResponse {
  entries: RuleHistoryEntry[];
  total: number;
}

export interface RuleTrigger {
  id: string;
  ruleId: string;
  /** The API returns `subjectId`, not `endUserId`. */
  subjectId: string;
  subjectType: SubjectType;
  triggerContext: string;
  actionTaken: string;
  /** ISO timestamp (field is `timestamp`, not `triggeredAt`). */
  timestamp: string;
}

export interface ListRuleTriggersResponse {
  events: RuleTrigger[];
  total: number;
}

// ─── SDK ─────────────────────────────────────────────────────────────────────

export type RequestType = "realtime" | "chat" | "embeddings";

export interface SdkCheckRequest {
  userId: string;
  model: string;
  requestType: RequestType;
  estimatedTokens?: number;
  feature?: string;
}

/** Usage summary returned by /sdk/check — `tokens` (not `totalTokens`). */
export interface SdkCheckUsage {
  tokens: number;
  costUsd: number;
}

export interface SdkCheckResponse {
  allowed: boolean;
  /** Present when `allowed` is false. */
  reason?: string;
  usage: SdkCheckUsage;
  /** Present when `allowed` is true. */
  remaining?: {
    tokens: number;
    costUsd: number;
  };
}

export interface SdkRecordRequest {
  userId: string;
  model: string;
  requestType: RequestType;
  inputTokens: number;
  outputTokens: number;
  /** Required — the API schema has no `.optional()` on this field. */
  latencyMs: number;
  success: boolean;
  feature?: string;
}

export interface SdkLogRequest {
  model: string;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  latencyMs?: number;
  status?: "success" | "error";
  conversationId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  feature?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface TokenistErrorBody {
  error: string;
  message?: string;
  status?: number;
}
