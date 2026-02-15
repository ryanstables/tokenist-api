import type { EndUserUsage, EndUserThreshold } from '../types/user';
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
  OrgLogEndUser,
  PricingStore,
  ModelRecord,
  ModelTokenPricing,
  ModelPricing,
} from './interfaces';
import { calculateCost as staticCalculateCost } from '../usage/pricing';

interface StoredEndUserData {
  usage: EndUserUsage;
  threshold?: EndUserThreshold;
}

export interface InMemoryStoreOptions {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
  pricingStore?: PricingStore;
}

export function createInMemoryUsageStore(options: InMemoryStoreOptions = {}): UsageStore {
  const cache = new Map<string, StoredEndUserData>();

  return {
    async getUsage(endUserId: string, _periodKey?: string): Promise<EndUserUsage | undefined> {
      return cache.get(endUserId)?.usage;
    },

    async updateUsage(
      endUserId: string,
      model: string,
      inputTokens: number,
      outputTokens: number,
      _periodKey?: string
    ): Promise<EndUserUsage> {
      const existing = cache.get(endUserId);
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
      const newCost = options.pricingStore
        ? await options.pricingStore.calculateCost(model, newInputTokens, newOutputTokens)
        : staticCalculateCost(model, newInputTokens, newOutputTokens);

      const newUsage: EndUserUsage = {
        inputTokens: newInputTokens,
        outputTokens: newOutputTokens,
        totalTokens: newTotalTokens,
        costUsd: newCost,
        lastUpdated: new Date(),
      };

      cache.set(endUserId, {
        usage: newUsage,
        threshold: existing?.threshold,
      });

      return newUsage;
    },

    async getThreshold(endUserId: string): Promise<EndUserThreshold> {
      const stored = cache.get(endUserId);
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

    async setThreshold(endUserId: string, threshold: EndUserThreshold): Promise<void> {
      const existing = cache.get(endUserId);
      cache.set(endUserId, {
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

    async getAllEndUsers(): Promise<Map<string, EndUserUsage>> {
      const result = new Map<string, EndUserUsage>();
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
    async isBlocked(endUserId: string): Promise<boolean> {
      const entry = cache.get(endUserId);
      if (!entry) return false;
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        cache.delete(endUserId);
        return false;
      }
      return true;
    },

    async getBlockEntry(endUserId: string): Promise<BlockEntry | undefined> {
      const entry = cache.get(endUserId);
      if (!entry) return undefined;
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        cache.delete(endUserId);
        return undefined;
      }
      return entry;
    },

    async block(endUserId: string, reason?: string, expiresAt?: Date): Promise<void> {
      cache.set(endUserId, {
        endUserId,
        reason,
        blockedAt: new Date(),
        expiresAt,
      });
    },

    async unblock(endUserId: string): Promise<boolean> {
      return cache.delete(endUserId);
    },

    async getAll(): Promise<BlockEntry[]> {
      const now = new Date();
      const entries: BlockEntry[] = [];
      for (const [, entry] of cache.entries()) {
        if (entry.expiresAt && entry.expiresAt < now) {
          cache.delete(entry.endUserId);
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

    async listEndUsersByOrgId(orgId: string): Promise<OrgLogEndUser[]> {
      const seen = new Set<string>();
      const endUsers: OrgLogEndUser[] = [];
      const byOrg = logs
        .filter((l) => l.orgId === orgId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      for (const log of byOrg) {
        if (seen.has(log.endUserId)) continue;
        seen.add(log.endUserId);
        endUsers.push({
          endUserId: log.endUserId,
          endUserEmail: log.endUserEmail,
          endUserName: log.endUserName,
        });
      }
      return endUsers;
    },

    async listByOrgIdAndEndUserId(
      orgId: string,
      endUserId: string,
      opts: { limit: number; offset: number }
    ): Promise<{ logs: StoredRequestLog[]; total: number }> {
      const filtered = logs
        .filter((l) => l.orgId === orgId && l.endUserId === endUserId)
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

// ---------------------------------------------------------------------------
// In-memory PricingStore (wraps the static PRICING data from pricing.ts)
// ---------------------------------------------------------------------------

import { getPricing as staticGetPricing } from '../usage/pricing';

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

export function createInMemoryPricingStore(): PricingStore {
  return {
    async resolveModelId(model: string): Promise<string> {
      // Strip date suffix for in-memory store
      return model.replace(DATE_SUFFIX_RE, '');
    },

    async getModelTokenTypes(modelId: string, processingTier = 'standard'): Promise<ModelTokenPricing[]> {
      const resolved = await this.resolveModelId(modelId);
      const pricing = staticGetPricing(resolved);
      const types: ModelTokenPricing[] = [];
      if (pricing.inputPer1K > 0) {
        types.push({ modelId: resolved, tokenType: 'text-input', processingTier, pricePerMillion: pricing.inputPer1K * 1000 });
      }
      if (pricing.outputPer1K > 0) {
        types.push({ modelId: resolved, tokenType: 'text-output', processingTier, pricePerMillion: pricing.outputPer1K * 1000 });
      }
      if (pricing.cachedInputPer1K !== undefined) {
        types.push({ modelId: resolved, tokenType: 'cached-text-input', processingTier, pricePerMillion: pricing.cachedInputPer1K * 1000 });
      }
      if (pricing.audioPer1K !== undefined) {
        types.push({ modelId: resolved, tokenType: 'audio-output', processingTier, pricePerMillion: pricing.audioPer1K * 1000 });
      }
      return types;
    },

    async getPricing(model: string, _processingTier?: string): Promise<ModelPricing> {
      const resolved = await this.resolveModelId(model);
      return staticGetPricing(resolved);
    },

    async calculateCost(model: string, inputTokens: number, outputTokens: number, _processingTier?: string): Promise<number> {
      const resolved = await this.resolveModelId(model);
      return staticCalculateCost(resolved, inputTokens, outputTokens);
    },

    async listModels(): Promise<ModelRecord[]> {
      return [];
    },

    async listModelsByCategory(_category: string): Promise<ModelRecord[]> {
      return [];
    },
  };
}
