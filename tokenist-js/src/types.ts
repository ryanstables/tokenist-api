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

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  orgId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  displayName?: string;
  orgId?: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  /** Only returned when the key is first created. */
  apiKey?: string;
  createdAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  apiKey: string;
}

export interface UserUsageResponse {
  usage: EndUserUsage;
  threshold: EndUserThreshold;
}

// ─── Usage & Thresholds ──────────────────────────────────────────────────────

export interface EndUserUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastUpdated: string;
}

export interface EndUserThreshold {
  maxCostUsd?: number;
  maxTotalTokens?: number;
}

// ─── Admin – Users ───────────────────────────────────────────────────────────

export interface EndUserRecord {
  endUserId: string;
  orgId?: string;
  usage: EndUserUsage;
  threshold: EndUserThreshold;
  blocked: boolean;
}

export interface BlockUserRequest {
  reason?: string;
  expiresAt?: string;
}

export interface BlockEntry {
  endUserId: string;
  reason?: string;
  blockedAt: string;
  expiresAt?: string;
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

export interface OrgSummary {
  orgId: string;
  period: UsagePeriod;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  userCount: number;
}

export interface OrgEndUser {
  endUserId: string;
  email?: string;
  name?: string;
  usage: EndUserUsage;
}

// ─── Admin – Logs ────────────────────────────────────────────────────────────

export interface RequestLog {
  id: string;
  endUserId: string;
  orgId?: string;
  endUserEmail?: string;
  endUserName?: string;
  conversationId: string;
  model: string;
  feature?: string;
  requestBody: string;
  responseBody?: string;
  status: "success" | "error";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  textInputTokens?: number;
  audioInputTokens?: number;
  imageInputTokens?: number;
  textOutputTokens?: number;
  audioOutputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  latencyMs?: number;
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
  orgId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
}

// ─── Admin – Rules ───────────────────────────────────────────────────────────

export type SubjectType = "user" | "org" | "global";
export type RestrictionType = "token_limit" | "cost_limit" | "model_allowlist" | "feature_allowlist";

export interface Rule {
  id: string;
  orgId: string;
  policyId?: string;
  subjectType: SubjectType;
  subjectId?: string;
  restrictionType: RestrictionType;
  value: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleRequest {
  policyId?: string;
  subjectType: SubjectType;
  subjectId?: string;
  restrictionType: RestrictionType;
  value: unknown;
  enabled?: boolean;
}

export interface UpdateRuleRequest {
  policyId?: string;
  subjectType?: SubjectType;
  subjectId?: string;
  restrictionType?: RestrictionType;
  value?: unknown;
  enabled?: boolean;
}

export interface ListRulesOptions {
  subjectType?: SubjectType;
  restrictionType?: RestrictionType;
  enabled?: boolean;
}

export interface RuleHistoryEntry {
  id: string;
  ruleId: string;
  changedBy?: string;
  previousValue: unknown;
  newValue: unknown;
  changedAt: string;
}

export interface RuleTrigger {
  id: string;
  ruleId: string;
  endUserId: string;
  triggeredAt: string;
  context?: Record<string, unknown>;
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

export interface SdkCheckResponse {
  allowed: boolean;
  usage: EndUserUsage;
  remaining: {
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
  latencyMs?: number;
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
