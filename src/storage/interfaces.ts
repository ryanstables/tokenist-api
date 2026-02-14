import type { UserUsage, UserThreshold } from '../types/user';

export interface BlockEntry {
  userId: string;
  reason?: string;
  blockedAt: Date;
  expiresAt?: Date;
}

export interface UsageStore {
  getUsage(userId: string, periodKey?: string): Promise<UserUsage | undefined>;
  updateUsage(
    userId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    periodKey?: string
  ): Promise<UserUsage>;
  getThreshold(userId: string): Promise<UserThreshold>;
  setThreshold(userId: string, threshold: UserThreshold): Promise<void>;
  getAllUsers(): Promise<Map<string, UserUsage>>;
}

export interface Blocklist {
  isBlocked(userId: string): Promise<boolean>;
  getBlockEntry(userId: string): Promise<BlockEntry | undefined>;
  block(userId: string, reason?: string, expiresAt?: Date): Promise<void>;
  unblock(userId: string): Promise<boolean>;
  getAll(): Promise<BlockEntry[]>;
}

export interface StoredUserRecord {
  userId: string;
  orgId?: string | null;
  email?: string;
  passwordHash?: string;
  displayName?: string;
  threshold?: UserThreshold;
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
  userId: string;
  orgId?: string | null;
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

export interface RequestLogStore {
  create(log: StoredRequestLog): Promise<StoredRequestLog>;
  listByOrgId(orgId: string, opts: { limit: number; offset: number }): Promise<{ logs: StoredRequestLog[]; total: number }>;
  getById(id: string): Promise<StoredRequestLog | undefined>;
}
