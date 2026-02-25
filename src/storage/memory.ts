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
  DetailedTokenUsage,
  SlackSettings,
  SlackSettingsStore,
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
      _periodKey?: string,
      requestCost?: number
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
      const newCost = requestCost !== undefined
        ? currentUsage.costUsd + requestCost
        : options.pricingStore
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

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  const hashIndex = new Map<string, string>(); // sha256(plainKey) -> keyId

  return {
    async create(
      userId: string,
      name: string
    ): Promise<{ key: StoredApiKey; plainKey: string }> {
      const plainKey = generateApiKey();
      const id = crypto.randomUUID();
      const keyHash = await sha256Hex(plainKey);
      const keyHint = plainKey.slice(0, 12);
      const key: StoredApiKey = {
        id,
        userId,
        name,
        keyHint,
        createdAt: new Date(),
      };
      keys.set(id, key);
      hashIndex.set(keyHash, id);
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
      for (const [hash, id] of hashIndex.entries()) {
        if (id === keyId) {
          hashIndex.delete(hash);
          break;
        }
      }
      return keys.delete(keyId);
    },

    async findUserIdByApiKey(apiKey: string): Promise<string | undefined> {
      const keyHash = await sha256Hex(apiKey);
      const keyId = hashIndex.get(keyHash);
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
      opts: { limit: number; offset: number; from?: string; to?: string }
    ): Promise<{ logs: StoredRequestLog[]; total: number }> {
      const fromMs = opts.from ? new Date(opts.from + 'T00:00:00.000Z').getTime() : null;
      const toMs = opts.to ? new Date(opts.to + 'T23:59:59.999Z').getTime() : null;
      const filtered = logs
        .filter((l) => {
          if (l.orgId !== orgId || l.endUserId !== endUserId) return false;
          const t = l.createdAt.getTime();
          if (fromMs !== null && t < fromMs) return false;
          if (toMs !== null && t > toMs) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        logs: filtered.slice(opts.offset, opts.offset + opts.limit),
        total: filtered.length,
      };
    },

    async getById(id: string): Promise<StoredRequestLog | undefined> {
      return logs.find((l) => l.id === id);
    },

    async getUnanalyzed(limit: number): Promise<StoredRequestLog[]> {
      return logs
        .filter((l) => l.analysisLabels == null)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit);
    },

    async setAnalysisLabels(id: string, labels: string[]): Promise<void> {
      const log = logs.find((l) => l.id === id);
      if (log) log.analysisLabels = labels;
    },

    async getSentimentSummary(
      orgId: string,
      opts?: { from?: string; to?: string }
    ): Promise<{
      labelCounts: Record<string, number>;
      totalAnalyzed: number;
      totalPending: number;
      dailyTrend: Array<{ date: string; counts: Record<string, number> }>;
    }> {
      const from = opts?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = opts?.to ?? new Date().toISOString().slice(0, 10);

      const orgLogs = Array.from(logs.values()).filter((l) => {
        if (l.orgId !== orgId) return false;
        const day = l.createdAt.toISOString().slice(0, 10);
        return day >= from && day <= to;
      });

      const labelCounts: Record<string, number> = {};
      const dailyMap: Record<string, Record<string, number>> = {};
      let totalPending = 0;

      for (const log of orgLogs) {
        if (log.analysisLabels === null || log.analysisLabels === undefined) {
          totalPending++;
          continue;
        }
        const day = log.createdAt.toISOString().slice(0, 10);
        for (const label of log.analysisLabels) {
          labelCounts[label] = (labelCounts[label] ?? 0) + 1;
          if (!dailyMap[day]) dailyMap[day] = {};
          dailyMap[day][label] = (dailyMap[day][label] ?? 0) + 1;
        }
      }

      const analyzed = orgLogs.filter((l) => l.analysisLabels !== null && l.analysisLabels !== undefined);

      const dailyTrend = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, counts }));

      return { labelCounts, totalAnalyzed: analyzed.length, totalPending, dailyTrend };
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
      if (pricing.audioInputPer1K !== undefined) {
        types.push({ modelId: resolved, tokenType: 'audio-input', processingTier, pricePerMillion: pricing.audioInputPer1K * 1000 });
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

    async calculateDetailedCost(model: string, usage: DetailedTokenUsage, _processingTier?: string): Promise<number> {
      const resolved = await this.resolveModelId(model);
      const pricing = staticGetPricing(resolved);
      let cost = 0;

      if (usage.cachedInputTokens && pricing.cachedInputPer1K) {
        cost += (usage.cachedInputTokens / 1000) * pricing.cachedInputPer1K;
        const nonCachedTextInput = (usage.textInputTokens ?? 0) - (usage.cachedInputTokens ?? 0);
        if (nonCachedTextInput > 0) {
          cost += (nonCachedTextInput / 1000) * pricing.inputPer1K;
        }
      } else if (usage.textInputTokens !== undefined) {
        cost += (usage.textInputTokens / 1000) * pricing.inputPer1K;
      } else {
        cost += (usage.inputTokens / 1000) * pricing.inputPer1K;
      }

      if (usage.audioInputTokens && pricing.audioInputPer1K) {
        cost += (usage.audioInputTokens / 1000) * pricing.audioInputPer1K;
      }

      if (usage.textOutputTokens !== undefined) {
        cost += (usage.textOutputTokens / 1000) * pricing.outputPer1K;
      } else {
        cost += (usage.outputTokens / 1000) * pricing.outputPer1K;
      }

      if (usage.audioOutputTokens && pricing.audioPer1K) {
        cost += (usage.audioOutputTokens / 1000) * pricing.audioPer1K;
      }

      return cost;
    },

    async listModels(): Promise<ModelRecord[]> {
      return [];
    },

    async listModelsByCategory(_category: string): Promise<ModelRecord[]> {
      return [];
    },
  };
}

export function createInMemorySlackSettingsStore(): SlackSettingsStore {
  const store = new Map<string, SlackSettings>();

  return {
    async get(orgId: string): Promise<SlackSettings | undefined> {
      return store.get(orgId);
    },

    async upsert(settings: Pick<SlackSettings, 'orgId' | 'webhookUrl' | 'timezone' | 'enabled'>): Promise<SlackSettings> {
      const now = new Date();
      const existing = store.get(settings.orgId);
      const record: SlackSettings = {
        ...settings,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      store.set(settings.orgId, record);
      return record;
    },

    async delete(orgId: string): Promise<boolean> {
      return store.delete(orgId);
    },

    async listEnabled(): Promise<SlackSettings[]> {
      return Array.from(store.values()).filter((s) => s.enabled);
    },
  };
}
