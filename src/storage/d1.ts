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

export interface D1StoreOptions {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
}

export function createD1UsageStore(db: D1Database, options: D1StoreOptions = {}): UsageStore {
  return {
    async getUsage(userId: string, periodKey = 'default'): Promise<UserUsage | undefined> {
      const row = await db
        .prepare('SELECT * FROM usage WHERE user_id = ? AND period_key = ?')
        .bind(userId, periodKey)
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
      userId: string,
      model: string,
      inputTokens: number,
      outputTokens: number,
      periodKey = 'default'
    ): Promise<UserUsage> {
      const existing = await db
        .prepare('SELECT * FROM usage WHERE user_id = ? AND period_key = ?')
        .bind(userId, periodKey)
        .first<{
          input_tokens: number;
          output_tokens: number;
        }>();

      const newInput = (existing?.input_tokens ?? 0) + inputTokens;
      const newOutput = (existing?.output_tokens ?? 0) + outputTokens;
      const newTotal = newInput + newOutput;
      const newCost = calculateCost(model, newInput, newOutput);
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO usage (user_id, period_key, input_tokens, output_tokens, total_tokens, cost_usd, last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, period_key) DO UPDATE SET
             input_tokens = excluded.input_tokens,
             output_tokens = excluded.output_tokens,
             total_tokens = excluded.total_tokens,
             cost_usd = excluded.cost_usd,
             last_updated = excluded.last_updated`
        )
        .bind(userId, periodKey, newInput, newOutput, newTotal, newCost, now)
        .run();

      return {
        inputTokens: newInput,
        outputTokens: newOutput,
        totalTokens: newTotal,
        costUsd: newCost,
        lastUpdated: new Date(now),
      };
    },

    async getThreshold(userId: string): Promise<UserThreshold> {
      const row = await db
        .prepare('SELECT * FROM thresholds WHERE user_id = ?')
        .bind(userId)
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

    async setThreshold(userId: string, threshold: UserThreshold): Promise<void> {
      await db
        .prepare(
          `INSERT INTO thresholds (user_id, max_cost_usd, max_total_tokens)
           VALUES (?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             max_cost_usd = excluded.max_cost_usd,
             max_total_tokens = excluded.max_total_tokens`
        )
        .bind(userId, threshold.maxCostUsd ?? null, threshold.maxTotalTokens ?? null)
        .run();
    },

    async getAllUsers(): Promise<Map<string, UserUsage>> {
      const { results } = await db
        .prepare('SELECT * FROM usage WHERE period_key = ?')
        .bind('default')
        .all<{
          user_id: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cost_usd: number;
          last_updated: string;
        }>();

      const map = new Map<string, UserUsage>();
      for (const row of results) {
        map.set(row.user_id, {
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
    async isBlocked(userId: string): Promise<boolean> {
      const entry = await this.getBlockEntry(userId);
      return !!entry;
    },

    async getBlockEntry(userId: string): Promise<BlockEntry | undefined> {
      const row = await db
        .prepare('SELECT * FROM blocklist WHERE user_id = ?')
        .bind(userId)
        .first<{
          user_id: string;
          reason: string | null;
          blocked_at: string;
          expires_at: string | null;
        }>();

      if (!row) return undefined;

      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        await db.prepare('DELETE FROM blocklist WHERE user_id = ?').bind(userId).run();
        return undefined;
      }

      return {
        userId: row.user_id,
        reason: row.reason ?? undefined,
        blockedAt: new Date(row.blocked_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      };
    },

    async block(userId: string, reason?: string, expiresAt?: Date): Promise<void> {
      await db
        .prepare(
          `INSERT INTO blocklist (user_id, reason, blocked_at, expires_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             reason = excluded.reason,
             blocked_at = excluded.blocked_at,
             expires_at = excluded.expires_at`
        )
        .bind(
          userId,
          reason ?? null,
          new Date().toISOString(),
          expiresAt ? expiresAt.toISOString() : null
        )
        .run();
    },

    async unblock(userId: string): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM blocklist WHERE user_id = ?')
        .bind(userId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async getAll(): Promise<BlockEntry[]> {
      const now = new Date();
      const { results } = await db
        .prepare('SELECT * FROM blocklist')
        .all<{
          user_id: string;
          reason: string | null;
          blocked_at: string;
          expires_at: string | null;
        }>();

      const entries: BlockEntry[] = [];
      for (const row of results) {
        if (row.expires_at && new Date(row.expires_at) < now) {
          await db.prepare('DELETE FROM blocklist WHERE user_id = ?').bind(row.user_id).run();
          continue;
        }
        entries.push({
          userId: row.user_id,
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
    user_id: string;
    org_id: string | null;
    model: string;
    request_body: string;
    response_body: string | null;
    status: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
    created_at: string;
  };

  function rowToLog(row: LogRow): StoredRequestLog {
    return {
      id: row.id,
      userId: row.user_id,
      orgId: row.org_id,
      model: row.model,
      requestBody: row.request_body,
      responseBody: row.response_body,
      status: row.status,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      latencyMs: row.latency_ms,
      createdAt: new Date(row.created_at),
    };
  }

  return {
    async create(log: StoredRequestLog): Promise<StoredRequestLog> {
      await db
        .prepare(
          `INSERT INTO request_logs (id, user_id, org_id, model, request_body, response_body, status, prompt_tokens, completion_tokens, total_tokens, latency_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          log.id,
          log.userId,
          log.orgId ?? null,
          log.model,
          log.requestBody,
          log.responseBody ?? null,
          log.status,
          log.promptTokens ?? null,
          log.completionTokens ?? null,
          log.totalTokens ?? null,
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

    async getById(id: string): Promise<StoredRequestLog | undefined> {
      const row = await db
        .prepare('SELECT * FROM request_logs WHERE id = ?')
        .bind(id)
        .first<LogRow>();
      return row ? rowToLog(row) : undefined;
    },
  };
}
