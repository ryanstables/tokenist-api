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
    periodKey?: string
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
  apiKey: string | null;
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
  requestBody: string;
  responseBody?: string | null;
  status: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
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
    opts: { limit: number; offset: number }
  ): Promise<{ logs: StoredRequestLog[]; total: number }>;
  getById(id: string): Promise<StoredRequestLog | undefined>;
}
