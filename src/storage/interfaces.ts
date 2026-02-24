import type { EndUserUsage, EndUserThreshold } from '../types/user';

export interface BlockEntry {
  endUserId: string;
  reason?: string;
  blockedAt: Date;
  expiresAt?: Date;
}

export interface UsageStore {
  getUsage(endUserId: string, periodKey?: string): Promise<EndUserUsage | undefined>;
  updateUsage(
    endUserId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    periodKey?: string,
    requestCost?: number
  ): Promise<EndUserUsage>;
  getThreshold(endUserId: string): Promise<EndUserThreshold>;
  setThreshold(endUserId: string, threshold: EndUserThreshold): Promise<void>;
  getAllEndUsers(): Promise<Map<string, EndUserUsage>>;
}

export interface Blocklist {
  isBlocked(endUserId: string): Promise<boolean>;
  getBlockEntry(endUserId: string): Promise<BlockEntry | undefined>;
  block(endUserId: string, reason?: string, expiresAt?: Date): Promise<void>;
  unblock(endUserId: string): Promise<boolean>;
  getAll(): Promise<BlockEntry[]>;
}

export interface StoredUserRecord {
  userId: string;
  orgId?: string | null;
  email?: string;
  passwordHash?: string;
  displayName?: string;
  threshold?: EndUserThreshold;
  usageWindow?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStore {
  findByUserId(userId: string): Promise<StoredUserRecord | undefined>;
  findByEmail(email: string): Promise<StoredUserRecord | undefined>;
  listByOrg(orgId: string): Promise<StoredUserRecord[]>;
  create(user: StoredUserRecord): Promise<StoredUserRecord>;
  update(userId: string, fields: Partial<StoredUserRecord>): Promise<StoredUserRecord | undefined>;
}

export interface StoredApiKey {
  id: string;
  userId: string;
  name: string;
  keyHint: string;
  createdAt: Date;
}

export interface ApiKeyStore {
  create(userId: string, name: string): Promise<{ key: StoredApiKey; plainKey: string }>;
  listByUserId(userId: string): Promise<StoredApiKey[]>;
  delete(userId: string, keyId: string): Promise<boolean>;
  findUserIdByApiKey(apiKey: string): Promise<string | undefined>;
}

export interface StoredRequestLog {
  id: string;
  endUserId: string;
  orgId?: string | null;
  endUserEmail?: string | null;
  endUserName?: string | null;
  conversationId: string;
  model: string;
  feature?: string | null;
  requestBody: string;
  responseBody?: string | null;
  status: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  // Granular input token breakdown
  cachedInputTokens?: number | null;
  textInputTokens?: number | null;
  audioInputTokens?: number | null;
  imageInputTokens?: number | null;
  // Granular output token breakdown
  textOutputTokens?: number | null;
  audioOutputTokens?: number | null;
  reasoningTokens?: number | null;
  // Per-request cost
  costUsd?: number | null;
  latencyMs?: number | null;
  createdAt: Date;
}

export interface OrgLogEndUser {
  endUserId: string;
  endUserEmail?: string | null;
  endUserName?: string | null;
}

export interface RequestLogStore {
  create(log: StoredRequestLog): Promise<StoredRequestLog>;
  listByOrgId(orgId: string, opts: { limit: number; offset: number }): Promise<{ logs: StoredRequestLog[]; total: number }>;
  listEndUsersByOrgId(orgId: string): Promise<OrgLogEndUser[]>;
  listByOrgIdAndEndUserId(
    orgId: string,
    endUserId: string,
    opts: { limit: number; offset: number; from?: string; to?: string }
  ): Promise<{ logs: StoredRequestLog[]; total: number }>;
  getById(id: string): Promise<StoredRequestLog | undefined>;
}

export interface ModelRecord {
  modelId: string;
  displayName: string;
  category: string;
  isAvailable: boolean;
}

export interface ModelTokenPricing {
  modelId: string;
  tokenType: string;
  processingTier: string;
  pricePerMillion: number;
}

export interface ModelPricing {
  inputPer1K: number;
  outputPer1K: number;
  audioPer1K?: number;
  cachedInputPer1K?: number;
  audioInputPer1K?: number;
}

export interface DetailedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  textInputTokens?: number;
  audioInputTokens?: number;
  imageInputTokens?: number;
  textOutputTokens?: number;
  audioOutputTokens?: number;
  reasoningTokens?: number;
}

export interface PricingStore {
  resolveModelId(model: string): Promise<string>;
  getModelTokenTypes(modelId: string, processingTier?: string): Promise<ModelTokenPricing[]>;
  getPricing(model: string, processingTier?: string): Promise<ModelPricing>;
  calculateCost(model: string, inputTokens: number, outputTokens: number, processingTier?: string): Promise<number>;
  calculateDetailedCost(model: string, usage: DetailedTokenUsage, processingTier?: string): Promise<number>;
  listModels(): Promise<ModelRecord[]>;
  listModelsByCategory(category: string): Promise<ModelRecord[]>;
}

export interface SlackSettings {
  orgId: string;
  webhookUrl: string;
  timezone: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackSettingsStore {
  get(orgId: string): Promise<SlackSettings | undefined>;
  upsert(settings: Pick<SlackSettings, 'orgId' | 'webhookUrl' | 'timezone' | 'enabled'>): Promise<SlackSettings>;
  delete(orgId: string): Promise<boolean>;
  listEnabled(): Promise<SlackSettings[]>;
}
