import type { UserUsage, UserThreshold } from '../types/user';
import type {
  UsageStore,
  Blocklist,
  BlockEntry,
  UserStore,
  StoredUserRecord,
  ApiKeyStore,
  StoredApiKey,
  RequestLogStore,
  StoredRequestLog,
} from './interfaces';
import { calculateCost } from '../usage/pricing';

interface StoredUserData {
  usage: UserUsage;
  threshold?: UserThreshold;
}

export interface InMemoryStoreOptions {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
}

export function createInMemoryUsageStore(options: InMemoryStoreOptions = {}): UsageStore {
  const cache = new Map<string, StoredUserData>();

  return {
    async getUsage(userId: string): Promise<UserUsage | undefined> {
      return cache.get(userId)?.usage;
    },

    async updateUsage(
      userId: string,
      model: string,
      inputTokens: number,
      outputTokens: number
    ): Promise<UserUsage> {
      const existing = cache.get(userId);
      const currentUsage = existing?.usage || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        lastUpdated: new Date(),
      };

      const newInputTokens = currentUsage.inputTokens + inputTokens;
      const newOutputTokens = currentUsage.outputTokens + outputTokens;
      const newTotalTokens = newInputTokens + newOutputTokens;
      const newCost = calculateCost(model, newInputTokens, newOutputTokens);

      const newUsage: UserUsage = {
        inputTokens: newInputTokens,
        outputTokens: newOutputTokens,
        totalTokens: newTotalTokens,
        costUsd: newCost,
        lastUpdated: new Date(),
      };

      cache.set(userId, {
        usage: newUsage,
        threshold: existing?.threshold,
      });

      return newUsage;
    },

    async getThreshold(userId: string): Promise<UserThreshold> {
      const stored = cache.get(userId);
      return (
        stored?.threshold || {
          maxCostUsd:
            options.defaultMaxCostUsd && options.defaultMaxCostUsd > 0
              ? options.defaultMaxCostUsd
              : undefined,
          maxTotalTokens:
            options.defaultMaxTotalTokens && options.defaultMaxTotalTokens > 0
              ? options.defaultMaxTotalTokens
              : undefined,
        }
      );
    },

    async setThreshold(userId: string, threshold: UserThreshold): Promise<void> {
      const existing = cache.get(userId);
      cache.set(userId, {
        usage: existing?.usage || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          lastUpdated: new Date(),
        },
        threshold,
      });
    },

    async getAllUsers(): Promise<Map<string, UserUsage>> {
      const result = new Map<string, UserUsage>();
      for (const [key, value] of cache.entries()) {
        result.set(key, value.usage);
      }
      return result;
    },
  };
}

export function createInMemoryBlocklist(): Blocklist {
  const cache = new Map<string, BlockEntry>();

  return {
    async isBlocked(userId: string): Promise<boolean> {
      const entry = cache.get(userId);
      if (!entry) return false;
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        cache.delete(userId);
        return false;
      }
      return true;
    },

    async getBlockEntry(userId: string): Promise<BlockEntry | undefined> {
      const entry = cache.get(userId);
      if (!entry) return undefined;
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        cache.delete(userId);
        return undefined;
      }
      return entry;
    },

    async block(userId: string, reason?: string, expiresAt?: Date): Promise<void> {
      cache.set(userId, {
        userId,
        reason,
        blockedAt: new Date(),
        expiresAt,
      });
    },

    async unblock(userId: string): Promise<boolean> {
      return cache.delete(userId);
    },

    async getAll(): Promise<BlockEntry[]> {
      const now = new Date();
      const entries: BlockEntry[] = [];
      for (const [, entry] of cache.entries()) {
        if (entry.expiresAt && entry.expiresAt < now) {
          cache.delete(entry.userId);
          continue;
        }
        entries.push(entry);
      }
      return entries;
    },
  };
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ug_${hex}`;
}

export function createInMemoryUserStore(): UserStore {
  const users = new Map<string, StoredUserRecord>();
  const emailIndex = new Map<string, string>();

  return {
    async findByUserId(userId: string): Promise<StoredUserRecord | undefined> {
      return users.get(userId);
    },

    async findByEmail(email: string): Promise<StoredUserRecord | undefined> {
      const userId = emailIndex.get(email.toLowerCase());
      return userId ? users.get(userId) : undefined;
    },

    async listByOrg(orgId: string): Promise<StoredUserRecord[]> {
      const result: StoredUserRecord[] = [];
      for (const user of users.values()) {
        if (user.orgId === orgId) {
          result.push(user);
        }
      }
      return result;
    },

    async create(user: StoredUserRecord): Promise<StoredUserRecord> {
      if (users.has(user.userId)) {
        throw new Error('User already exists');
      }
      if (user.email) {
        const lower = user.email.toLowerCase();
        if (emailIndex.has(lower)) {
          throw new Error('Email already registered');
        }
        emailIndex.set(lower, user.userId);
      }
      users.set(user.userId, user);
      return user;
    },

    async update(
      userId: string,
      fields: Partial<StoredUserRecord>
    ): Promise<StoredUserRecord | undefined> {
      const existing = users.get(userId);
      if (!existing) return undefined;
      const updated = { ...existing, ...fields, updatedAt: new Date() };
      users.set(userId, updated);
      return updated;
    },
  };
}

export function createInMemoryApiKeyStore(): ApiKeyStore {
  const keys = new Map<string, StoredApiKey>();
  const apiKeyIndex = new Map<string, string>(); // apiKey -> keyId

  return {
    async create(
      userId: string,
      name: string
    ): Promise<{ key: StoredApiKey; plainKey: string }> {
      const plainKey = generateApiKey();
      const id = crypto.randomUUID();
      const key: StoredApiKey = {
        id,
        userId,
        name,
        apiKey: plainKey,
        createdAt: new Date(),
      };
      keys.set(id, key);
      apiKeyIndex.set(plainKey, id);
      return { key, plainKey };
    },

    async listByUserId(userId: string): Promise<StoredApiKey[]> {
      const result: StoredApiKey[] = [];
      for (const key of keys.values()) {
        if (key.userId === userId) result.push(key);
      }
      return result;
    },

    async delete(userId: string, keyId: string): Promise<boolean> {
      const key = keys.get(keyId);
      if (!key || key.userId !== userId) return false;
      if (key.apiKey) {
        apiKeyIndex.delete(key.apiKey);
      }
      return keys.delete(keyId);
    },

    async findUserIdByApiKey(apiKey: string): Promise<string | undefined> {
      const keyId = apiKeyIndex.get(apiKey);
      if (!keyId) return undefined;
      return keys.get(keyId)?.userId;
    },
  };
}

export function createInMemoryRequestLogStore(): RequestLogStore {
  const logs: StoredRequestLog[] = [];

  return {
    async create(log: StoredRequestLog): Promise<StoredRequestLog> {
      logs.push(log);
      return log;
    },

    async listByOrgId(
      orgId: string,
      opts: { limit: number; offset: number }
    ): Promise<{ logs: StoredRequestLog[]; total: number }> {
      const filtered = logs
        .filter((l) => l.orgId === orgId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        logs: filtered.slice(opts.offset, opts.offset + opts.limit),
        total: filtered.length,
      };
    },

    async getById(id: string): Promise<StoredRequestLog | undefined> {
      return logs.find((l) => l.id === id);
    },
  };
}
