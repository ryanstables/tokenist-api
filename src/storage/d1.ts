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
} from './interfaces';

export interface D1StoreOptions {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
  pricingStore?: PricingStore;
}

export function createD1UsageStore(db: D1Database, options: D1StoreOptions = {}): UsageStore {
  return {
    async getUsage(endUserId: string, periodKey = 'default'): Promise<EndUserUsage | undefined> {
      const row = await db
        .prepare('SELECT * FROM usage WHERE end_user_id = ? AND period_key = ?')
        .bind(endUserId, periodKey)
        .first<{
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cost_usd: number;
          last_updated: string;
        }>();

      if (!row) return undefined;

      return {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        costUsd: row.cost_usd,
        lastUpdated: new Date(row.last_updated),
      };
    },

    async updateUsage(
      endUserId: string,
      model: string,
      inputTokens: number,
      outputTokens: number,
      periodKey = 'default'
    ): Promise<EndUserUsage> {
      const existing = await db
        .prepare('SELECT * FROM usage WHERE end_user_id = ? AND period_key = ?')
        .bind(endUserId, periodKey)
        .first<{
          input_tokens: number;
          output_tokens: number;
        }>();

      const newInput = (existing?.input_tokens ?? 0) + inputTokens;
      const newOutput = (existing?.output_tokens ?? 0) + outputTokens;
      const newTotal = newInput + newOutput;
      const newCost = options.pricingStore
        ? await options.pricingStore.calculateCost(model, newInput, newOutput)
        : fallbackCalculateCost(model, newInput, newOutput);
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO usage (end_user_id, period_key, input_tokens, output_tokens, total_tokens, cost_usd, last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (end_user_id, period_key) DO UPDATE SET
             input_tokens = excluded.input_tokens,
             output_tokens = excluded.output_tokens,
             total_tokens = excluded.total_tokens,
             cost_usd = excluded.cost_usd,
             last_updated = excluded.last_updated`
        )
        .bind(endUserId, periodKey, newInput, newOutput, newTotal, newCost, now)
        .run();

      return {
        inputTokens: newInput,
        outputTokens: newOutput,
        totalTokens: newTotal,
        costUsd: newCost,
        lastUpdated: new Date(now),
      };
    },

    async getThreshold(endUserId: string): Promise<EndUserThreshold> {
      const row = await db
        .prepare('SELECT * FROM thresholds WHERE end_user_id = ?')
        .bind(endUserId)
        .first<{ max_cost_usd: number | null; max_total_tokens: number | null }>();

      if (row) {
        return {
          maxCostUsd: row.max_cost_usd ?? undefined,
          maxTotalTokens: row.max_total_tokens ?? undefined,
        };
      }

      return {
        maxCostUsd:
          options.defaultMaxCostUsd && options.defaultMaxCostUsd > 0
            ? options.defaultMaxCostUsd
            : undefined,
        maxTotalTokens:
          options.defaultMaxTotalTokens && options.defaultMaxTotalTokens > 0
            ? options.defaultMaxTotalTokens
            : undefined,
      };
    },

    async setThreshold(endUserId: string, threshold: EndUserThreshold): Promise<void> {
      await db
        .prepare(
          `INSERT INTO thresholds (end_user_id, max_cost_usd, max_total_tokens)
           VALUES (?, ?, ?)
           ON CONFLICT (end_user_id) DO UPDATE SET
             max_cost_usd = excluded.max_cost_usd,
             max_total_tokens = excluded.max_total_tokens`
        )
        .bind(endUserId, threshold.maxCostUsd ?? null, threshold.maxTotalTokens ?? null)
        .run();
    },

    async getAllEndUsers(): Promise<Map<string, EndUserUsage>> {
      const { results } = await db
        .prepare('SELECT * FROM usage WHERE period_key = ?')
        .bind('default')
        .all<{
          end_user_id: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cost_usd: number;
          last_updated: string;
        }>();

      const map = new Map<string, EndUserUsage>();
      for (const row of results) {
        map.set(row.end_user_id, {
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          totalTokens: row.total_tokens,
          costUsd: row.cost_usd,
          lastUpdated: new Date(row.last_updated),
        });
      }
      return map;
    },
  };
}

export function createD1Blocklist(db: D1Database): Blocklist {
  return {
    async isBlocked(endUserId: string): Promise<boolean> {
      const entry = await this.getBlockEntry(endUserId);
      return !!entry;
    },

    async getBlockEntry(endUserId: string): Promise<BlockEntry | undefined> {
      const row = await db
        .prepare('SELECT * FROM blocklist WHERE end_user_id = ?')
        .bind(endUserId)
        .first<{
          end_user_id: string;
          reason: string | null;
          blocked_at: string;
          expires_at: string | null;
        }>();

      if (!row) return undefined;

      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        await db.prepare('DELETE FROM blocklist WHERE end_user_id = ?').bind(endUserId).run();
        return undefined;
      }

      return {
        endUserId: row.end_user_id,
        reason: row.reason ?? undefined,
        blockedAt: new Date(row.blocked_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      };
    },

    async block(endUserId: string, reason?: string, expiresAt?: Date): Promise<void> {
      await db
        .prepare(
          `INSERT INTO blocklist (end_user_id, reason, blocked_at, expires_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (end_user_id) DO UPDATE SET
             reason = excluded.reason,
             blocked_at = excluded.blocked_at,
             expires_at = excluded.expires_at`
        )
        .bind(
          endUserId,
          reason ?? null,
          new Date().toISOString(),
          expiresAt ? expiresAt.toISOString() : null
        )
        .run();
    },

    async unblock(endUserId: string): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM blocklist WHERE end_user_id = ?')
        .bind(endUserId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async getAll(): Promise<BlockEntry[]> {
      const now = new Date();
      const { results } = await db
        .prepare('SELECT * FROM blocklist')
        .all<{
          end_user_id: string;
          reason: string | null;
          blocked_at: string;
          expires_at: string | null;
        }>();

      const entries: BlockEntry[] = [];
      for (const row of results) {
        if (row.expires_at && new Date(row.expires_at) < now) {
          await db.prepare('DELETE FROM blocklist WHERE end_user_id = ?').bind(row.end_user_id).run();
          continue;
        }
        entries.push({
          endUserId: row.end_user_id,
          reason: row.reason ?? undefined,
          blockedAt: new Date(row.blocked_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        });
      }
      return entries;
    },
  };
}

export function createD1UserStore(db: D1Database): UserStore {
  function rowToRecord(row: {
    user_id: string;
    org_id: string | null;
    email: string | null;
    password_hash: string | null;
    display_name: string | null;
    threshold_max_cost_usd: number | null;
    threshold_max_total_tokens: number | null;
    usage_window: string | null;
    created_at: string;
    updated_at: string;
  }): StoredUserRecord {
    const record: StoredUserRecord = {
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
    if (row.org_id) record.orgId = row.org_id;
    if (row.email) record.email = row.email;
    if (row.password_hash) record.passwordHash = row.password_hash;
    if (row.display_name) record.displayName = row.display_name;
    if (row.usage_window) record.usageWindow = row.usage_window;
    if (row.threshold_max_cost_usd !== null || row.threshold_max_total_tokens !== null) {
      record.threshold = {
        maxCostUsd: row.threshold_max_cost_usd ?? undefined,
        maxTotalTokens: row.threshold_max_total_tokens ?? undefined,
      };
    }
    return record;
  }

  type UserRow = {
    user_id: string;
    org_id: string | null;
    email: string | null;
    password_hash: string | null;
    display_name: string | null;
    threshold_max_cost_usd: number | null;
    threshold_max_total_tokens: number | null;
    usage_window: string | null;
    created_at: string;
    updated_at: string;
  };

  return {
    async findByUserId(userId: string): Promise<StoredUserRecord | undefined> {
      const row = await db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .bind(userId)
        .first<UserRow>();
      return row ? rowToRecord(row) : undefined;
    },

    async findByEmail(email: string): Promise<StoredUserRecord | undefined> {
      const row = await db
        .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
        .bind(email)
        .first<UserRow>();
      return row ? rowToRecord(row) : undefined;
    },

    async listByOrg(orgId: string): Promise<StoredUserRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM users WHERE org_id = ?')
        .bind(orgId)
        .all<UserRow>();
      return results.map(rowToRecord);
    },

    async create(user: StoredUserRecord): Promise<StoredUserRecord> {
      await db
        .prepare(
          `INSERT INTO users (user_id, org_id, email, password_hash, display_name,
             threshold_max_cost_usd, threshold_max_total_tokens, usage_window,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          user.userId,
          user.orgId ?? null,
          user.email ?? null,
          user.passwordHash ?? null,
          user.displayName ?? null,
          user.threshold?.maxCostUsd ?? null,
          user.threshold?.maxTotalTokens ?? null,
          user.usageWindow ?? null,
          user.createdAt.toISOString(),
          user.updatedAt.toISOString()
        )
        .run();
      return user;
    },

    async update(
      userId: string,
      fields: Partial<StoredUserRecord>
    ): Promise<StoredUserRecord | undefined> {
      const existing = await this.findByUserId(userId);
      if (!existing) return undefined;

      const updated = { ...existing, ...fields, updatedAt: new Date() };
      await db
        .prepare(
          `UPDATE users SET
             org_id = ?, email = ?, password_hash = ?, display_name = ?,
             threshold_max_cost_usd = ?, threshold_max_total_tokens = ?,
             usage_window = ?, updated_at = ?
           WHERE user_id = ?`
        )
        .bind(
          updated.orgId ?? null,
          updated.email ?? null,
          updated.passwordHash ?? null,
          updated.displayName ?? null,
          updated.threshold?.maxCostUsd ?? null,
          updated.threshold?.maxTotalTokens ?? null,
          updated.usageWindow ?? null,
          updated.updatedAt.toISOString(),
          userId
        )
        .run();
      return updated;
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

export function createD1ApiKeyStore(db: D1Database): ApiKeyStore {
  type ApiKeyRow = {
    id: string;
    user_id: string;
    name: string;
    key_hash: string;
    created_at: string;
  };

  const isPlainApiKey = (value: string): boolean => value.startsWith('ug_');

  function rowToKey(row: ApiKeyRow): StoredApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      apiKey: isPlainApiKey(row.key_hash) ? row.key_hash : null,
      createdAt: new Date(row.created_at),
    };
  }

  return {
    async create(
      userId: string,
      name: string
    ): Promise<{ key: StoredApiKey; plainKey: string }> {
      const plainKey = generateApiKey();
      const id = crypto.randomUUID();
      const now = new Date();

      await db
        .prepare(
          'INSERT INTO api_keys (id, user_id, name, key_hash, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(id, userId, name, plainKey, now.toISOString())
        .run();

      const key: StoredApiKey = { id, userId, name, apiKey: plainKey, createdAt: now };
      return { key, plainKey };
    },

    async listByUserId(userId: string): Promise<StoredApiKey[]> {
      const { results } = await db
        .prepare('SELECT * FROM api_keys WHERE user_id = ?')
        .bind(userId)
        .all<ApiKeyRow>();
      return results.map(rowToKey);
    },

    async delete(userId: string, keyId: string): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
        .bind(keyId, userId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async findUserIdByApiKey(apiKey: string): Promise<string | undefined> {
      const keyHash = await sha256Hex(apiKey);
      const row = await db
        .prepare('SELECT user_id FROM api_keys WHERE key_hash IN (?, ?) LIMIT 1')
        .bind(apiKey, keyHash)
        .first<{ user_id: string }>();
      return row?.user_id;
    },
  };
}

export function createD1RequestLogStore(db: D1Database): RequestLogStore {
  type LogRow = {
    id: string;
    end_user_id: string;
    org_id: string | null;
    end_user_email: string | null;
    end_user_name: string | null;
    conversation_id: string;
    model: string;
    request_body: string;
    response_body: string | null;
    status: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cached_input_tokens: number | null;
    text_input_tokens: number | null;
    audio_input_tokens: number | null;
    image_input_tokens: number | null;
    text_output_tokens: number | null;
    audio_output_tokens: number | null;
    reasoning_tokens: number | null;
    cost_usd: number | null;
    latency_ms: number | null;
    created_at: string;
  };

  function rowToLog(row: LogRow): StoredRequestLog {
    return {
      id: row.id,
      endUserId: row.end_user_id,
      orgId: row.org_id,
      endUserEmail: row.end_user_email,
      endUserName: row.end_user_name,
      conversationId: row.conversation_id,
      model: row.model,
      requestBody: row.request_body,
      responseBody: row.response_body,
      status: row.status,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      cachedInputTokens: row.cached_input_tokens,
      textInputTokens: row.text_input_tokens,
      audioInputTokens: row.audio_input_tokens,
      imageInputTokens: row.image_input_tokens,
      textOutputTokens: row.text_output_tokens,
      audioOutputTokens: row.audio_output_tokens,
      reasoningTokens: row.reasoning_tokens,
      costUsd: row.cost_usd,
      latencyMs: row.latency_ms,
      createdAt: new Date(row.created_at),
    };
  }

  return {
    async create(log: StoredRequestLog): Promise<StoredRequestLog> {
      await db
        .prepare(
          `INSERT INTO request_logs (id, end_user_id, org_id, end_user_email, end_user_name, conversation_id, model, request_body, response_body, status, prompt_tokens, completion_tokens, total_tokens, cached_input_tokens, text_input_tokens, audio_input_tokens, image_input_tokens, text_output_tokens, audio_output_tokens, reasoning_tokens, cost_usd, latency_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          log.id,
          log.endUserId,
          log.orgId ?? null,
          log.endUserEmail ?? null,
          log.endUserName ?? null,
          log.conversationId,
          log.model,
          log.requestBody,
          log.responseBody ?? null,
          log.status,
          log.promptTokens ?? null,
          log.completionTokens ?? null,
          log.totalTokens ?? null,
          log.cachedInputTokens ?? null,
          log.textInputTokens ?? null,
          log.audioInputTokens ?? null,
          log.imageInputTokens ?? null,
          log.textOutputTokens ?? null,
          log.audioOutputTokens ?? null,
          log.reasoningTokens ?? null,
          log.costUsd ?? null,
          log.latencyMs ?? null,
          log.createdAt.toISOString()
        )
        .run();
      return log;
    },

    async listByOrgId(
      orgId: string,
      opts: { limit: number; offset: number }
    ): Promise<{ logs: StoredRequestLog[]; total: number }> {
      const countRow = await db
        .prepare('SELECT COUNT(*) as cnt FROM request_logs WHERE org_id = ?')
        .bind(orgId)
        .first<{ cnt: number }>();
      const total = countRow?.cnt ?? 0;

      const { results } = await db
        .prepare(
          'SELECT * FROM request_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
        .bind(orgId, opts.limit, opts.offset)
        .all<LogRow>();

      return { logs: results.map(rowToLog), total };
    },

    async listEndUsersByOrgId(orgId: string): Promise<OrgLogEndUser[]> {
      const { results } = await db
        .prepare(
          'SELECT end_user_id, end_user_email, end_user_name FROM request_logs WHERE org_id = ? ORDER BY created_at DESC'
        )
        .bind(orgId)
        .all<{ end_user_id: string; end_user_email: string | null; end_user_name: string | null }>();
      const seen = new Set<string>();
      const endUsers: OrgLogEndUser[] = [];
      for (const row of results) {
        if (seen.has(row.end_user_id)) continue;
        seen.add(row.end_user_id);
        endUsers.push({
          endUserId: row.end_user_id,
          endUserEmail: row.end_user_email,
          endUserName: row.end_user_name,
        });
      }
      return endUsers;
    },

    async listByOrgIdAndEndUserId(
      orgId: string,
      endUserId: string,
      opts: { limit: number; offset: number }
    ): Promise<{ logs: StoredRequestLog[]; total: number }> {
      const countRow = await db
        .prepare('SELECT COUNT(*) as cnt FROM request_logs WHERE org_id = ? AND end_user_id = ?')
        .bind(orgId, endUserId)
        .first<{ cnt: number }>();
      const total = countRow?.cnt ?? 0;

      const { results } = await db
        .prepare(
          'SELECT * FROM request_logs WHERE org_id = ? AND end_user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
        .bind(orgId, endUserId, opts.limit, opts.offset)
        .all<LogRow>();

      return { logs: results.map(rowToLog), total };
    },

    async getById(id: string): Promise<StoredRequestLog | undefined> {
      const row = await db
        .prepare('SELECT * FROM request_logs WHERE id = ?')
        .bind(id)
        .first<LogRow>();
      return row ? rowToLog(row) : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Fallback: simple cost calculation when no PricingStore is available
// ---------------------------------------------------------------------------

function fallbackCalculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Default to gpt-4o-realtime-preview text rates
  const inputPer1K = 5 / 1000;
  const outputPer1K = 20 / 1000;
  return (inputTokens / 1000) * inputPer1K + (outputTokens / 1000) * outputPer1K;
}

// ---------------------------------------------------------------------------
// D1 PricingStore
// ---------------------------------------------------------------------------

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

export function createD1PricingStore(db: D1Database): PricingStore {
  // In-memory cache: populated on first access, keyed by model_id
  let pricingCache: Map<string, ModelTokenPricing[]> | null = null;
  let aliasCache: Map<string, string> | null = null;
  let modelCache: ModelRecord[] | null = null;

  async function ensureCache(): Promise<void> {
    if (pricingCache) return;

    const [pricingResults, aliasResults, modelResults] = await Promise.all([
      db.prepare('SELECT * FROM model_pricing').all<{
        model_id: string;
        token_type: string;
        processing_tier: string;
        price_per_million: number;
      }>(),
      db.prepare('SELECT * FROM model_aliases').all<{
        alias: string;
        model_id: string;
      }>(),
      db.prepare('SELECT * FROM models').all<{
        model_id: string;
        display_name: string;
        category: string;
        is_available: number;
      }>(),
    ]);

    pricingCache = new Map();
    for (const row of pricingResults.results) {
      const entries = pricingCache.get(row.model_id) ?? [];
      entries.push({
        modelId: row.model_id,
        tokenType: row.token_type,
        processingTier: row.processing_tier,
        pricePerMillion: row.price_per_million,
      });
      pricingCache.set(row.model_id, entries);
    }

    aliasCache = new Map();
    for (const row of aliasResults.results) {
      aliasCache.set(row.alias, row.model_id);
    }

    modelCache = modelResults.results.map((row) => ({
      modelId: row.model_id,
      displayName: row.display_name,
      category: row.category,
      isAvailable: row.is_available === 1,
    }));
  }

  return {
    async resolveModelId(model: string): Promise<string> {
      await ensureCache();
      // 1. Exact match in pricing table
      if (pricingCache!.has(model)) return model;
      // 2. Check alias table
      const aliased = aliasCache!.get(model);
      if (aliased) return aliased;
      // 3. Strip date suffix (e.g., gpt-4o-mini-realtime-preview-2024-12-17 → gpt-4o-mini-realtime-preview)
      const stripped = model.replace(DATE_SUFFIX_RE, '');
      if (stripped !== model && pricingCache!.has(stripped)) return stripped;
      // 4. Check alias for stripped version
      const strippedAlias = aliasCache!.get(stripped);
      if (strippedAlias) return strippedAlias;
      // Return original model (will use default pricing)
      return model;
    },

    async getModelTokenTypes(modelId: string, processingTier = 'standard'): Promise<ModelTokenPricing[]> {
      await ensureCache();
      const resolved = await this.resolveModelId(modelId);
      const entries = pricingCache!.get(resolved) ?? [];
      return entries.filter((e) => e.processingTier === processingTier);
    },

    async getPricing(model: string, processingTier = 'standard'): Promise<ModelPricing> {
      await ensureCache();
      const resolved = await this.resolveModelId(model);
      const entries = pricingCache!.get(resolved);

      if (!entries || entries.length === 0) {
        // Default pricing aligned with gpt-4o-realtime-preview text rates
        return {
          inputPer1K: 5 / 1000,
          outputPer1K: 20 / 1000,
          audioPer1K: 80 / 1000,
        };
      }

      const tierEntries = entries.filter((e) => e.processingTier === processingTier);
      // Fall back to standard if requested tier not found
      const effective = tierEntries.length > 0
        ? tierEntries
        : entries.filter((e) => e.processingTier === 'standard');

      const pricing: ModelPricing = {
        inputPer1K: 0,
        outputPer1K: 0,
      };

      for (const entry of effective) {
        const per1K = entry.pricePerMillion / 1000;
        switch (entry.tokenType) {
          case 'text-input':
            pricing.inputPer1K = per1K;
            break;
          case 'text-output':
            pricing.outputPer1K = per1K;
            break;
          case 'cached-text-input':
            pricing.cachedInputPer1K = per1K;
            break;
          case 'audio-input':
            pricing.audioInputPer1K = per1K;
            break;
          case 'audio-output':
            pricing.audioPer1K = per1K;
            break;
        }
      }

      return pricing;
    },

    async calculateCost(model: string, inputTokens: number, outputTokens: number, processingTier?: string): Promise<number> {
      const pricing = await this.getPricing(model, processingTier);
      const inputCost = (inputTokens / 1000) * pricing.inputPer1K;
      const outputCost = (outputTokens / 1000) * pricing.outputPer1K;
      return inputCost + outputCost;
    },

    async calculateDetailedCost(model: string, usage: DetailedTokenUsage, processingTier?: string): Promise<number> {
      const pricing = await this.getPricing(model, processingTier);
      let cost = 0;

      if (usage.cachedInputTokens && pricing.cachedInputPer1K) {
        // Cached input tokens use the discounted rate
        cost += (usage.cachedInputTokens / 1000) * pricing.cachedInputPer1K;
        // Non-cached text input tokens
        const nonCachedTextInput = (usage.textInputTokens ?? 0) - (usage.cachedInputTokens ?? 0);
        if (nonCachedTextInput > 0) {
          cost += (nonCachedTextInput / 1000) * pricing.inputPer1K;
        }
      } else if (usage.textInputTokens !== undefined) {
        cost += (usage.textInputTokens / 1000) * pricing.inputPer1K;
      } else {
        // Fallback to aggregate input tokens
        cost += (usage.inputTokens / 1000) * pricing.inputPer1K;
      }

      // Audio input tokens
      if (usage.audioInputTokens && pricing.audioInputPer1K) {
        cost += (usage.audioInputTokens / 1000) * pricing.audioInputPer1K;
      }

      // Text output tokens
      if (usage.textOutputTokens !== undefined) {
        cost += (usage.textOutputTokens / 1000) * pricing.outputPer1K;
      } else {
        cost += (usage.outputTokens / 1000) * pricing.outputPer1K;
      }

      // Audio output tokens
      if (usage.audioOutputTokens && pricing.audioPer1K) {
        cost += (usage.audioOutputTokens / 1000) * pricing.audioPer1K;
      }

      // Reasoning tokens are billed as output tokens (already included in outputTokens aggregate)
      // but if we have granular breakdown, they're already counted in textOutputTokens

      return cost;
    },

    async listModels(): Promise<ModelRecord[]> {
      await ensureCache();
      return modelCache!;
    },

    async listModelsByCategory(category: string): Promise<ModelRecord[]> {
      await ensureCache();
      return modelCache!.filter((m) => m.category === category);
    },
  };
}
