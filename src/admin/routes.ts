import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from '../logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore, StoredRequestLog, PricingStore, SlackSettingsStore, SentimentLabelStore } from '../storage/interfaces';
import type { EndUserUsage } from '../types/user';
import type { JWTPayload } from '../auth/jwt';
import { generateToken } from '../auth/jwt';
import { hashPassword, verifyPassword } from '../auth/password';
import { createAuthMiddleware, createApiKeyMiddleware } from './middleware';
import { getPeriodKey, getRolling24hPeriodKeys } from '../storage/period';
import { calculateCost as staticCalculateCost } from '../usage/pricing';
import { handleSentimentAnalysis } from '../sentiment/analyzer';

type Env = {
  Variables: {
    user: JWTPayload;
    apiKeyUserId: string;
  };
};

export interface AdminRouteDeps {
  usageStore: UsageStore;
  blocklist: Blocklist;
  userStore?: UserStore;
  apiKeyStore?: ApiKeyStore;
  requestLogStore?: RequestLogStore;
  pricingStore?: PricingStore;
  slackSettingsStore?: SlackSettingsStore;
  sentimentLabelStore?: SentimentLabelStore;
  logger: Logger;
  jwtSecret: string;
  jwtExpiresIn?: string;
  openaiApiKey?: string;
  devMode?: boolean;
}

const blockRequestSchema = z.object({
  reason: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const thresholdRequestSchema = z.object({
  maxCostUsd: z.number().nonnegative().optional(),
  maxTotalTokens: z.number().int().nonnegative().optional(),
});

const sdkCheckSchema = z.object({
  userId: z.string().min(1),
  model: z.string().min(1),
  estimatedTokens: z.number().int().nonnegative().optional(),
  requestType: z.enum(['realtime', 'chat', 'embeddings']),
  feature: z.string().min(1).optional(),
});

const sdkLogSchema = z.object({
  model: z.string().min(1),
  request: z.record(z.unknown()),
  response: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  conversationId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
  feature: z.string().min(1).optional(),
});

const sdkRecordSchema = z.object({
  userId: z.string().min(1),
  model: z.string().min(1),
  requestType: z.enum(['realtime', 'chat', 'embeddings']),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  success: z.boolean(),
  timestamp: z.string().datetime().optional(),
  feature: z.string().min(1).optional(),
});

const sentimentLabelCreateSchema = z.object({
  name: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64),
  description: z.string().min(1).max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().min(0).max(999),
});

const sentimentLabelUpdateSchema = sentimentLabelCreateSchema.partial();

type RuleRecord = {
  id: string;
  name: string;
  enabled: boolean;
  subject: { type: 'user' | 'group' | 'feature'; ids: string[] };
  trigger: Record<string, unknown> & { type: string };
  restriction: Record<string, unknown> & { type: 'warning' | 'rate_limit' | 'throttle' | 'block' };
  notifications: {
    webhookUrl?: string;
    injectResponse?: boolean;
    responseMessage?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastTriggeredAt?: string | null;
};

type PolicyRecord = {
  id: string;
  name: string;
  description: string;
  source: 'openai_moderation' | 'custom';
  createdAt: string;
};

type RuleHistoryRecord = {
  id: string;
  ruleId: string;
  action: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted';
  changes?: Record<string, { from: unknown; to: unknown }>;
  timestamp: string;
  userId?: string;
};

type RuleTriggerRecord = {
  id: string;
  ruleId: string;
  subjectId: string;
  subjectType: 'user' | 'group' | 'feature';
  triggerContext: string;
  actionTaken: string;
  timestamp: string;
};

const rulesByOrg = new Map<string, Map<string, RuleRecord>>();
const policiesByOrg = new Map<string, Map<string, PolicyRecord>>();
const ruleHistoryByOrg = new Map<string, Map<string, RuleHistoryRecord[]>>();
const ruleTriggersByOrg = new Map<string, Map<string, RuleTriggerRecord[]>>();

export function createAdminRoutes(deps: AdminRouteDeps) {
  const { usageStore, blocklist, userStore, apiKeyStore, requestLogStore, pricingStore, slackSettingsStore, sentimentLabelStore, logger, jwtSecret, jwtExpiresIn, openaiApiKey, devMode } = deps;
  const app = new Hono<Env>();

  const buildPeriodLabel = (period: string): string => {
    const now = new Date();
    if (period === 'monthly') {
      return now.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }
    if (period === 'daily') {
      return now.toISOString().slice(0, 10);
    }
    if (period === 'rolling_24h') {
      return 'Last 24 hours';
    }
    return period;
  };

  const getRulesForOrg = (orgId: string): Map<string, RuleRecord> => {
    let rules = rulesByOrg.get(orgId);
    if (!rules) {
      rules = new Map<string, RuleRecord>();
      rulesByOrg.set(orgId, rules);
    }
    return rules;
  };

  const getPoliciesForOrg = (orgId: string): Map<string, PolicyRecord> => {
    let policies = policiesByOrg.get(orgId);
    if (!policies) {
      policies = new Map<string, PolicyRecord>();
      policiesByOrg.set(orgId, policies);
    }
    return policies;
  };

  const getRuleHistoryForOrg = (orgId: string): Map<string, RuleHistoryRecord[]> => {
    let history = ruleHistoryByOrg.get(orgId);
    if (!history) {
      history = new Map<string, RuleHistoryRecord[]>();
      ruleHistoryByOrg.set(orgId, history);
    }
    return history;
  };

  const getRuleTriggersForOrg = (orgId: string): Map<string, RuleTriggerRecord[]> => {
    let triggers = ruleTriggersByOrg.get(orgId);
    if (!triggers) {
      triggers = new Map<string, RuleTriggerRecord[]>();
      ruleTriggersByOrg.set(orgId, triggers);
    }
    return triggers;
  };

  const addRuleHistory = (
    orgId: string,
    ruleId: string,
    action: RuleHistoryRecord['action'],
    changes?: RuleHistoryRecord['changes']
  ) => {
    const history = getRuleHistoryForOrg(orgId);
    const entries = history.get(ruleId) ?? [];
    entries.unshift({
      id: crypto.randomUUID(),
      ruleId,
      action,
      changes,
      timestamp: new Date().toISOString(),
    });
    history.set(ruleId, entries);
  };

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Get end user usage
  app.get('/admin/users/:userId/usage', async (c) => {
    const endUserId = c.req.param('userId');

    const usage = await usageStore.getUsage(endUserId);
    const threshold = await usageStore.getThreshold(endUserId);
    const blockEntry = await blocklist.getBlockEntry(endUserId);

    const usagePayload = usage
      ? {
          ...usage,
          lastUpdated: usage.lastUpdated?.toISOString() ?? null,
        }
      : {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          lastUpdated: null as string | null,
        };

    return c.json({
      userId: endUserId,
      usage: usagePayload,
      threshold,
      blocked: !!blockEntry,
      blockEntry: blockEntry || null,
    });
  });

  // List all end users with usage
  app.get('/admin/users', async (c) => {
    const allEndUsers = await usageStore.getAllEndUsers();

    const users = await Promise.all(
      Array.from(allEndUsers.entries()).map(async ([endUserId, usage]) => {
        const blockEntry = await blocklist.getBlockEntry(endUserId);
        const threshold = await usageStore.getThreshold(endUserId);
        return {
          userId: endUserId,
          usage,
          threshold,
          blocked: !!blockEntry,
        };
      })
    );

    return c.json({ users });
  });

  // Organization summary for dashboard: end users (API consumers) and their usage, not dashboard users.
  if (userStore || requestLogStore) {
    app.get('/admin/orgs/:orgId/summary', async (c) => {
      const orgId = c.req.param('orgId');
      const period = (c.req.query('period') ?? 'monthly') as 'daily' | 'monthly' | 'rolling_24h';
      const userIdsParam = c.req.query('userIds'); // optional filter: end user ids
      const feature = c.req.query('feature') ?? null;
      const fromParam = c.req.query('from'); // YYYY-MM-DD
      const toParam = c.req.query('to');     // YYYY-MM-DD
      const scopedEndUserIds = new Set(
        (userIdsParam ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      );

      const orgEndUsers = requestLogStore
        ? await requestLogStore.listEndUsersByOrgId(orgId)
        : [];
      const endUsersInScope =
        scopedEndUserIds.size > 0
          ? orgEndUsers.filter((u) => scopedEndUserIds.has(u.endUserId))
          : orgEndUsers;

      const now = new Date();

      // Determine period keys and label — prefer explicit from/to date range over period buckets
      let periodKeys: string[];
      let resolvedPeriodLabel: string;

      if (fromParam && toParam) {
        // Generate daily keys for each day in the range
        periodKeys = [];
        const startDate = new Date(fromParam + 'T00:00:00Z');
        const endDate = new Date(toParam + 'T23:59:59Z');
        const cur = new Date(startDate);
        while (cur <= endDate && periodKeys.length < 366) {
          periodKeys.push(getPeriodKey('daily', cur));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        const fmtDate = (d: Date) =>
          d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
        resolvedPeriodLabel =
          fromParam.slice(0, 7) === toParam.slice(0, 7)
            ? `${parseInt(fromParam.slice(8), 10)} – ${parseInt(toParam.slice(8), 10)} ${new Date(toParam + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
            : `${fmtDate(new Date(fromParam + 'T00:00:00Z'))} – ${fmtDate(new Date(toParam + 'T00:00:00Z'))}`;
      } else {
        periodKeys = period === 'rolling_24h' ? getRolling24hPeriodKeys(now) : [getPeriodKey(period, now)];
        resolvedPeriodLabel = buildPeriodLabel(period);
      }

      const users = await Promise.all(
        endUsersInScope.map(async (endUser) => {
          const endUserId = endUser.endUserId;
          let usage: EndUserUsage | undefined;
          if (periodKeys.length === 1) {
            usage = await usageStore.getUsage(endUserId, periodKeys[0]);
          } else {
            let inputTokens = 0;
            let outputTokens = 0;
            let totalTokens = 0;
            let costUsd = 0;
            let lastUpdated: Date | null = null;
            for (const key of periodKeys) {
              const u = await usageStore.getUsage(endUserId, key);
              if (u) {
                inputTokens += u.inputTokens;
                outputTokens += u.outputTokens;
                totalTokens += u.totalTokens;
                costUsd += u.costUsd;
                if (u.lastUpdated && (!lastUpdated || u.lastUpdated > lastUpdated))
                  lastUpdated = u.lastUpdated;
              }
            }
            usage =
              lastUpdated !== null
                ? {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    costUsd,
                    lastUpdated,
                  }
                : undefined;
          }
          // Fallback to 'default' period key when SDK/log or SDK/record wrote usage there (no period-specific key).
          // Skip this fallback when an explicit date range is requested — the 'default' key holds all-time data
          // and would override the date filter, making every range show the same totals.
          if (!fromParam && !toParam && (!usage || (usage.inputTokens === 0 && usage.outputTokens === 0 && usage.totalTokens === 0))) {
            const defaultUsage = await usageStore.getUsage(endUserId, 'default');
            if (defaultUsage) usage = defaultUsage;
          }
          // Fallback: aggregate from request_logs when usage store has no data (e.g. logs created before we recorded usage)
          if ((!usage || (usage.inputTokens === 0 && usage.outputTokens === 0 && usage.totalTokens === 0)) && requestLogStore) {
            const { logs: userLogs } = await requestLogStore.listByOrgIdAndEndUserId(orgId, endUserId, {
              limit: 2000,
              offset: 0,
              from: fromParam,
              to: toParam,
            });
            let inputTokens = 0;
            let outputTokens = 0;
            let costUsd = 0;
            for (const log of userLogs) {
              const inT = log.promptTokens ?? 0;
              const outT = log.completionTokens ?? 0;
              inputTokens += inT;
              outputTokens += outT;
              costUsd += pricingStore
                ? await pricingStore.calculateCost(log.model, inT, outT)
                : staticCalculateCost(log.model, inT, outT);
            }
            if (inputTokens > 0 || outputTokens > 0) {
              usage = {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                costUsd,
                lastUpdated: new Date(),
              };
            }
          }
          return {
            userId: endUserId,
            displayName: endUser.endUserName ?? endUser.endUserEmail ?? endUserId,
            usage: {
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              totalTokens: usage?.totalTokens ?? 0,
              costUsd: usage?.costUsd ?? 0,
              lastUpdated: usage?.lastUpdated?.toISOString() ?? null,
            },
          };
        })
      );

      const totalCost = users.reduce((sum, user) => sum + user.usage.costUsd, 0);

      return c.json({
        orgId,
        period,
        periodLabel: resolvedPeriodLabel,
        totalCost,
        userCount: users.length,
        users,
        featureFilter: feature,
      });
    });

    // List end users (tracked users that appear in logs). Dashboard uses this for the Users page.
    app.get('/admin/orgs/:orgId/users', async (c) => {
      const orgId = c.req.param('orgId');
      if (requestLogStore) {
        const fromLogs = await requestLogStore.listEndUsersByOrgId(orgId);
        return c.json(
          fromLogs.map((u) => ({
            id: u.endUserId,
            displayName: u.endUserName ?? u.endUserEmail ?? u.endUserId,
            email: u.endUserEmail ?? null,
          }))
        );
      }
      // No request log store: return empty (no end users to show)
      return c.json([]);
    });

    // List blocked end users that belong to this org (appear in org's logs).
    app.get('/admin/orgs/:orgId/blocked', async (c) => {
      const orgId = c.req.param('orgId');
      const allBlocked = await blocklist.getAll();
      if (!requestLogStore) {
        return c.json({ blocked: [], count: 0 });
      }
      const orgEndUsers = await requestLogStore.listEndUsersByOrgId(orgId);
      const orgEndUserIds = new Set(orgEndUsers.map((u) => u.endUserId));
      const blockedInOrg = allBlocked.filter((e) => orgEndUserIds.has(e.endUserId));
      return c.json({
        blocked: blockedInOrg.map((e) => ({
          userId: e.endUserId,
          reason: e.reason,
          blockedAt: e.blockedAt,
          expiresAt: e.expiresAt,
        })),
        count: blockedInOrg.length,
      });
    });

    app.get('/admin/orgs/:orgId/groups', (c) => c.json([]));

    app.get('/admin/orgs/:orgId/features', (c) =>
      c.json([{ id: 'realtime_api', name: 'Realtime API' }])
    );

    app.get('/admin/orgs/:orgId/policies', (c) => {
      const orgId = c.req.param('orgId');
      const policies = Array.from(getPoliciesForOrg(orgId).values());
      return c.json(policies);
    });

    app.post('/admin/orgs/:orgId/policies', async (c) => {
      const orgId = c.req.param('orgId');
      const body = (await c.req.json().catch(() => ({}))) as Partial<PolicyRecord>;
      if (!body.name || !body.description) {
        return c.json({ error: 'name and description are required' }, 400);
      }
      const policy: PolicyRecord = {
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description,
        source: body.source === 'openai_moderation' ? 'openai_moderation' : 'custom',
        createdAt: new Date().toISOString(),
      };
      getPoliciesForOrg(orgId).set(policy.id, policy);
      return c.json(policy, 201);
    });

    app.put('/admin/orgs/:orgId/policies/:policyId', async (c) => {
      const orgId = c.req.param('orgId');
      const policyId = c.req.param('policyId');
      const policies = getPoliciesForOrg(orgId);
      const existing = policies.get(policyId);
      if (!existing) {
        return c.json({ error: 'Policy not found' }, 404);
      }
      const body = (await c.req.json().catch(() => ({}))) as Partial<PolicyRecord>;
      const updated: PolicyRecord = {
        ...existing,
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
      };
      policies.set(policyId, updated);
      return c.json(updated);
    });

    app.delete('/admin/orgs/:orgId/policies/:policyId', (c) => {
      const orgId = c.req.param('orgId');
      const policyId = c.req.param('policyId');
      const deleted = getPoliciesForOrg(orgId).delete(policyId);
      if (!deleted) {
        return c.json({ error: 'Policy not found' }, 404);
      }
      return c.json({ success: true });
    });

    app.get('/admin/orgs/:orgId/rules', async (c) => {
      const orgId = c.req.param('orgId');
      const subjectType = c.req.query('subjectType');
      const restrictionType = c.req.query('restrictionType');
      const enabledParam = c.req.query('enabled');
      const limitParam = c.req.query('limit');
      const offsetParam = c.req.query('offset');
      const enabledFilter =
        enabledParam === undefined ? undefined : enabledParam.toLowerCase() === 'true';
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

      const allRules = Array.from(getRulesForOrg(orgId).values());
      const filtered = allRules.filter((rule) => {
        if (subjectType && rule.subject.type !== subjectType) return false;
        if (restrictionType && rule.restriction.type !== restrictionType) return false;
        if (enabledFilter !== undefined && rule.enabled !== enabledFilter) return false;
        return true;
      });
      const paged = limit ? filtered.slice(offset, offset + limit) : filtered.slice(offset);

      return c.json({ rules: paged, total: filtered.length });
    });

    app.post('/admin/orgs/:orgId/rules', async (c) => {
      const orgId = c.req.param('orgId');
      const body = (await c.req.json().catch(() => ({}))) as Partial<RuleRecord>;
      if (
        !body.name ||
        !body.subject ||
        !body.trigger ||
        !body.restriction ||
        !body.notifications
      ) {
        return c.json({ error: 'Invalid rule payload' }, 400);
      }
      const now = new Date().toISOString();
      const rule: RuleRecord = {
        id: crypto.randomUUID(),
        name: body.name,
        enabled: body.enabled ?? true,
        subject: body.subject as RuleRecord['subject'],
        trigger: body.trigger as RuleRecord['trigger'],
        restriction: body.restriction as RuleRecord['restriction'],
        notifications: body.notifications as RuleRecord['notifications'],
        createdAt: now,
        updatedAt: now,
        createdBy: body.createdBy,
        lastTriggeredAt: null,
      };
      getRulesForOrg(orgId).set(rule.id, rule);
      addRuleHistory(orgId, rule.id, 'created');
      return c.json(rule, 201);
    });

    app.get('/admin/orgs/:orgId/rules/:ruleId', (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const rule = getRulesForOrg(orgId).get(ruleId);
      if (!rule) {
        return c.json({ error: 'Rule not found' }, 404);
      }
      return c.json(rule);
    });

    app.put('/admin/orgs/:orgId/rules/:ruleId', async (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const rules = getRulesForOrg(orgId);
      const existing = rules.get(ruleId);
      if (!existing) {
        return c.json({ error: 'Rule not found' }, 404);
      }
      const body = (await c.req.json().catch(() => ({}))) as Partial<RuleRecord>;
      const updated: RuleRecord = {
        ...existing,
        ...body,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      rules.set(ruleId, updated);
      addRuleHistory(orgId, ruleId, 'updated');
      return c.json(updated);
    });

    app.patch('/admin/orgs/:orgId/rules/:ruleId/toggle', async (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const rules = getRulesForOrg(orgId);
      const existing = rules.get(ruleId);
      if (!existing) {
        return c.json({ error: 'Rule not found' }, 404);
      }
      const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
      if (body.enabled === undefined) {
        return c.json({ error: 'enabled is required' }, 400);
      }
      const updated: RuleRecord = {
        ...existing,
        enabled: body.enabled,
        updatedAt: new Date().toISOString(),
      };
      rules.set(ruleId, updated);
      addRuleHistory(orgId, ruleId, body.enabled ? 'enabled' : 'disabled');
      return c.json(updated);
    });

    app.delete('/admin/orgs/:orgId/rules/:ruleId', (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const rules = getRulesForOrg(orgId);
      const deleted = rules.delete(ruleId);
      if (!deleted) {
        return c.json({ error: 'Rule not found' }, 404);
      }
      addRuleHistory(orgId, ruleId, 'deleted');
      return c.json({ success: true });
    });

    app.get('/admin/orgs/:orgId/rules/:ruleId/history', (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const limitParam = c.req.query('limit');
      const offsetParam = c.req.query('offset');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;
      const entries = getRuleHistoryForOrg(orgId).get(ruleId) ?? [];
      const paged = limit ? entries.slice(offset, offset + limit) : entries.slice(offset);
      return c.json({ entries: paged, total: entries.length });
    });

    app.get('/admin/orgs/:orgId/rules/:ruleId/triggers', (c) => {
      const orgId = c.req.param('orgId');
      const ruleId = c.req.param('ruleId');
      const limitParam = c.req.query('limit');
      const offsetParam = c.req.query('offset');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;
      const events = getRuleTriggersForOrg(orgId).get(ruleId) ?? [];
      const paged = limit ? events.slice(offset, offset + limit) : events.slice(offset);
      return c.json({ events: paged, total: events.length });
    });

    // Request logs (dashboard endpoints)
    if (requestLogStore) {
      // Helper: serialize a StoredRequestLog → external API shape (endUserId → userId etc.)
      const serializeLog = (log: StoredRequestLog) => ({
        id: log.id,
        userId: log.endUserId,
        orgId: log.orgId,
        userEmail: log.endUserEmail,
        userName: log.endUserName,
        conversationId: log.conversationId,
        model: log.model,
        feature: log.feature ?? null,
        requestBody: log.requestBody,
        responseBody: log.responseBody,
        status: log.status,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        tokenDetails: {
          cachedInputTokens: log.cachedInputTokens ?? null,
          textInputTokens: log.textInputTokens ?? null,
          audioInputTokens: log.audioInputTokens ?? null,
          imageInputTokens: log.imageInputTokens ?? null,
          textOutputTokens: log.textOutputTokens ?? null,
          audioOutputTokens: log.audioOutputTokens ?? null,
          reasoningTokens: log.reasoningTokens ?? null,
        },
        costUsd: log.costUsd ?? null,
        latencyMs: log.latencyMs,
        analysisLabels: log.analysisLabels ?? null,
        createdAt: log.createdAt.toISOString(),
      });

      app.get('/admin/orgs/:orgId/sentiment-summary', async (c) => {
        const orgId = c.req.param('orgId');
        const from = c.req.query('from');
        const to = c.req.query('to');
        const summary = await requestLogStore.getSentimentSummary(orgId, { from, to });
        return c.json(summary);
      });

      app.post('/admin/sentiment/analyze-pending', async (c) => {
        const apiKey = openaiApiKey ?? '';
        if (!apiKey) {
          return c.json({ error: 'OPENAI_API_KEY not configured' }, 500);
        }
        if (!sentimentLabelStore) {
          return c.json({ error: 'sentimentLabelStore not configured' }, 500);
        }
        let total = 0;
        let batch: number;
        do {
          batch = await handleSentimentAnalysis(requestLogStore, sentimentLabelStore, apiKey);
          total += batch;
        } while (batch > 0);
        return c.json({ processed: total });
      });

      app.get('/admin/orgs/:orgId/logs', async (c) => {
        const orgId = c.req.param('orgId');
        const limit = Number.parseInt(c.req.query('limit') ?? '25', 10);
        const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);
        const { logs, total } = await requestLogStore.listByOrgId(orgId, { limit, offset });
        return c.json({ logs: logs.map(serializeLog), total });
      });

      app.get('/admin/orgs/:orgId/logs/:logId', async (c) => {
        const logId = c.req.param('logId');
        const log = await requestLogStore.getById(logId);
        if (!log) {
          return c.json({ error: 'Log not found' }, 404);
        }
        return c.json(serializeLog(log));
      });

      app.get('/admin/orgs/:orgId/users/:userId/logs', async (c) => {
        const orgId = c.req.param('orgId');
        const endUserId = c.req.param('userId');
        const limit = Number.parseInt(c.req.query('limit') ?? '10', 10);
        const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);
        const { logs, total } = await requestLogStore.listByOrgIdAndEndUserId(orgId, endUserId, {
          limit,
          offset,
        });
        return c.json({ logs: logs.map(serializeLog), total });
      });
    }
  }

  // Sentiment label CRUD (gated on sentimentLabelStore; each handler also guards internally)
  if (sentimentLabelStore) {
    app.get('/admin/orgs/:orgId/sentiment-labels', async (c) => {
      const orgId = c.req.param('orgId');
      const labels = await sentimentLabelStore.getForOrg(orgId);
      return c.json({ labels });
    });

    app.post('/admin/orgs/:orgId/sentiment-labels', async (c) => {
      const orgId = c.req.param('orgId');
      const body = await c.req.json().catch(() => ({}));
      const result = sentimentLabelCreateSchema.safeParse(body);
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400);
      }
      const label = await sentimentLabelStore.create(orgId, result.data);
      return c.json(label, 201);
    });

    app.put('/admin/orgs/:orgId/sentiment-labels/:labelId', async (c) => {
      const orgId = c.req.param('orgId');
      const labelId = c.req.param('labelId');
      const body = await c.req.json().catch(() => ({}));
      const result = sentimentLabelUpdateSchema.safeParse(body);
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400);
      }
      const updated = await sentimentLabelStore.update(labelId, orgId, result.data);
      if (!updated) {
        return c.json({ error: 'not found' }, 404);
      }
      return c.json(updated);
    });

    app.delete('/admin/orgs/:orgId/sentiment-labels/:labelId', async (c) => {
      const orgId = c.req.param('orgId');
      const labelId = c.req.param('labelId');
      const deleted = await sentimentLabelStore.delete(labelId, orgId);
      if (!deleted) {
        return c.json({ error: 'not found' }, 404);
      }
      return c.json({ ok: true });
    });
  }

  // Block end user
  app.post('/admin/users/:userId/block', async (c) => {
    const endUserId = c.req.param('userId');
    const body = await c.req.json().catch(() => ({}));

    const result = blockRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }

    const { reason, expiresAt } = result.data;
    await blocklist.block(endUserId, reason, expiresAt ? new Date(expiresAt) : undefined);

    logger.info({ endUserId, reason, expiresAt }, 'End user blocked');

    return c.json({
      success: true,
      userId: endUserId,
      blocked: true,
      reason,
      expiresAt,
    });
  });

  // Unblock end user
  app.post('/admin/users/:userId/unblock', async (c) => {
    const endUserId = c.req.param('userId');
    const wasBlocked = await blocklist.unblock(endUserId);

    logger.info({ endUserId, wasBlocked }, 'End user unblocked');

    return c.json({ success: true, userId: endUserId, wasBlocked });
  });

  // Set end user threshold
  app.post('/admin/users/:userId/threshold', async (c) => {
    const endUserId = c.req.param('userId');
    const body = await c.req.json().catch(() => ({}));

    const result = thresholdRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }

    await usageStore.setThreshold(endUserId, result.data);
    logger.info({ endUserId, threshold: result.data }, 'End user threshold updated');

    return c.json({ success: true, userId: endUserId, threshold: result.data });
  });

  // List blocked end users
  app.get('/admin/blocked', async (c) => {
    const entries = await blocklist.getAll();
    return c.json({
      blocked: entries.map((e) => ({
        userId: e.endUserId,
        reason: e.reason,
        blockedAt: e.blockedAt,
        expiresAt: e.expiresAt,
      })),
    });
  });

  // ============================================================
  // Auth endpoints (require userStore + apiKeyStore)
  // ============================================================

  if (userStore && apiKeyStore) {
    const authMw = createAuthMiddleware(jwtSecret);

    // Register new user
    app.post('/auth/register', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
        displayName?: string;
        orgId?: string;
      };

      if (!body.email || !body.password) {
        return c.json({ error: 'Email and password are required' }, 400);
      }

      const existingUser = await userStore.findByEmail(body.email);
      if (existingUser) {
        return c.json({ error: 'Email already registered' }, 409);
      }

      const passwordHash = await hashPassword(body.password);
      const userId = crypto.randomUUID();
      const now = new Date();
      const requestedOrgId = body.orgId?.trim();
      const orgId = requestedOrgId && requestedOrgId.length > 0 ? requestedOrgId : `org_${userId}`;

      const user = await userStore.create({
        userId,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        orgId,
        createdAt: now,
        updatedAt: now,
      });

      const token = await generateToken(
        { userId: user.userId, email: user.email!, orgId: user.orgId },
        jwtSecret,
        jwtExpiresIn
      );

      return c.json(
        {
          user: {
            userId: user.userId,
            email: user.email,
            displayName: user.displayName,
            orgId: user.orgId ?? null,
          },
          token,
        },
        201
      );
    });

    // Login user
    app.post('/auth/login', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
      };

      if (!body.email || !body.password) {
        return c.json({ error: 'Email and password are required' }, 400);
      }

      const user = await userStore.findByEmail(body.email);
      if (!user || !user.passwordHash) {
        return c.json({ error: 'Invalid email or password' }, 401);
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        return c.json({ error: 'Invalid email or password' }, 401);
      }

      const token = await generateToken(
        { userId: user.userId, email: user.email!, orgId: user.orgId },
        jwtSecret,
        jwtExpiresIn
      );

      return c.json({
        user: {
          userId: user.userId,
          email: user.email,
          displayName: user.displayName,
          orgId: user.orgId ?? null,
        },
        token,
      });
    });

    // Get current user (protected)
    app.get('/auth/me', authMw, async (c) => {
      const payload = c.get('user');
      const user = await userStore.findByEmail(payload.email);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      return c.json({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        orgId: user.orgId ?? null,
      });
    });

    // List API keys (protected)
    app.get('/auth/api-keys', authMw, async (c) => {
      const payload = c.get('user');
      const keys = await apiKeyStore.listByUserId(payload.userId);
      return c.json({
        keys: keys.map((key) => ({
          id: key.id,
          name: key.name,
          keyHint: key.keyHint,
          createdAt: key.createdAt.toISOString(),
        })),
      });
    });

    // Create API key (protected)
    app.post('/auth/api-keys', authMw, async (c) => {
      const payload = c.get('user');
      const body = (await c.req.json().catch(() => ({}))) as { name?: string };

      if (!body.name || body.name.trim().length === 0 || body.name.trim().length > 100) {
        return c.json({ error: 'name is required (1-100 chars)' }, 400);
      }

      const result = await apiKeyStore.create(payload.userId, body.name.trim());
      return c.json(
        {
          id: result.key.id,
          name: result.key.name,
          apiKey: result.plainKey,
          keyHint: result.key.keyHint,
          createdAt: result.key.createdAt.toISOString(),
        },
        201
      );
    });

    // Delete API key (protected)
    app.delete('/auth/api-keys/:keyId', authMw, async (c) => {
      const payload = c.get('user');
      const keyId = c.req.param('keyId');
      const deleted = await apiKeyStore.delete(payload.userId, keyId);

      if (!deleted) {
        return c.json({ error: 'API key not found' }, 404);
      }
      return c.json({ success: true });
    });

    // Get current user usage (protected)
    app.get('/auth/usage', authMw, async (c) => {
      const payload = c.get('user');
      const usage = await usageStore.getUsage(payload.userId);
      const threshold = await usageStore.getThreshold(payload.userId);
      return c.json({
        userId: payload.userId,
        usage: usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        threshold,
      });
    });

    // ============================================================
    // Slack settings routes (protected, require orgId in JWT)
    // ============================================================

    if (slackSettingsStore) {
      // Get Slack settings for authenticated org
      app.get('/auth/slack', authMw, async (c) => {
        const payload = c.get('user');
        const orgId = payload.orgId;
        if (!orgId) return c.json({ error: 'Organization required' }, 403);
        const settings = await slackSettingsStore.get(orgId);
        if (!settings) return c.json({ error: 'Not configured' }, 404);
        return c.json({
          orgId: settings.orgId,
          webhookUrl: settings.webhookUrl,
          timezone: settings.timezone,
          enabled: settings.enabled,
          createdAt: settings.createdAt.toISOString(),
        });
      });

      // Create or update Slack settings
      app.put('/auth/slack', authMw, async (c) => {
        const payload = c.get('user');
        const orgId = payload.orgId;
        if (!orgId) return c.json({ error: 'Organization required' }, 403);
        const body = (await c.req.json().catch(() => ({}))) as {
          webhookUrl?: string;
          timezone?: string;
          enabled?: boolean;
        };
        if (!body.webhookUrl || !body.webhookUrl.startsWith('https://hooks.slack.com/')) {
          return c.json({ error: 'Valid Slack webhook URL required (must start with https://hooks.slack.com/)' }, 400);
        }
        const timezone = body.timezone ?? 'UTC';
        // Validate the timezone string
        let validatedTimezone = 'UTC';
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: timezone });
          validatedTimezone = timezone;
        } catch {
          // Invalid timezone, fall back to UTC
        }
        const enabled = body.enabled !== false;
        const settings = await slackSettingsStore.upsert({ orgId, webhookUrl: body.webhookUrl, timezone: validatedTimezone, enabled });
        return c.json({
          orgId: settings.orgId,
          webhookUrl: settings.webhookUrl,
          timezone: settings.timezone,
          enabled: settings.enabled,
          createdAt: settings.createdAt.toISOString(),
        });
      });

      // Delete Slack settings
      app.delete('/auth/slack', authMw, async (c) => {
        const payload = c.get('user');
        const orgId = payload.orgId;
        if (!orgId) return c.json({ error: 'Organization required' }, 403);
        const deleted = await slackSettingsStore.delete(orgId);
        if (!deleted) return c.json({ error: 'Not configured' }, 404);
        return c.json({ ok: true });
      });

      // Send a test message
      app.post('/auth/slack/test', authMw, async (c) => {
        const payload = c.get('user');
        const orgId = payload.orgId;
        if (!orgId) return c.json({ error: 'Organization required' }, 403);
        const settings = await slackSettingsStore.get(orgId);
        if (!settings) return c.json({ error: 'Slack not configured' }, 404);
        const testMessage = [
          '📊 *Tokenist Test Message*',
          '',
          'Your Slack integration is working! Daily reports will arrive at 8:00 AM in your configured timezone.',
          '',
          '_Powered by Tokenist_',
        ].join('\n');
        try {
          const res = await fetch(settings.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: testMessage }),
          });
          if (!res.ok) {
            return c.json({ error: `Slack returned ${res.status}` }, 502);
          }
          return c.json({ ok: true });
        } catch {
          return c.json({ error: 'Failed to reach Slack' }, 502);
        }
      });
    }
  }

  // ============================================================
  // SDK endpoints (require apiKeyStore)
  // ============================================================

  if (apiKeyStore) {
    const apiKeyMw = createApiKeyMiddleware(apiKeyStore);

    // Check if an end user is allowed to make a request
    app.post('/sdk/check', apiKeyMw, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const result = sdkCheckSchema.safeParse(body);
      if (!result.success) {
        return c.json({ error: result.error.issues }, 400);
      }

      const endUserId = result.data.userId;

      const blockEntry = await blocklist.getBlockEntry(endUserId);
      if (blockEntry) {
        const usage = await usageStore.getUsage(endUserId);
        return c.json({
          allowed: false,
          reason: `User is blocked: ${blockEntry.reason || 'No reason provided'}`,
          usage: usage
            ? { tokens: usage.totalTokens, costUsd: usage.costUsd }
            : { tokens: 0, costUsd: 0 },
        });
      }

      const usage = await usageStore.getUsage(endUserId);
      const threshold = await usageStore.getThreshold(endUserId);
      const currentTokens = usage?.totalTokens ?? 0;
      const currentCost = usage?.costUsd ?? 0;

      if (threshold.maxCostUsd !== undefined && currentCost >= threshold.maxCostUsd) {
        return c.json({
          allowed: false,
          reason: `Cost limit exceeded: $${currentCost.toFixed(4)} >= $${threshold.maxCostUsd.toFixed(2)}`,
          usage: { tokens: currentTokens, costUsd: currentCost },
        });
      }

      if (
        threshold.maxTotalTokens !== undefined &&
        threshold.maxTotalTokens > 0 &&
        currentTokens >= threshold.maxTotalTokens
      ) {
        return c.json({
          allowed: false,
          reason: `Token limit exceeded: ${currentTokens} >= ${threshold.maxTotalTokens}`,
          usage: { tokens: currentTokens, costUsd: currentCost },
        });
      }

      const remainingTokens =
        threshold.maxTotalTokens !== undefined
          ? threshold.maxTotalTokens - currentTokens
          : undefined;
      const remainingCost =
        threshold.maxCostUsd !== undefined
          ? threshold.maxCostUsd - currentCost
          : undefined;

      return c.json({
        allowed: true,
        usage: { tokens: currentTokens, costUsd: currentCost },
        remaining: {
          tokens: remainingTokens ?? 0,
          costUsd: remainingCost ?? 0,
        },
      });
    });

    // Record usage after a request completes
    app.post('/sdk/record', apiKeyMw, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const result = sdkRecordSchema.safeParse(body);
      if (!result.success) {
        return c.json({ error: result.error.issues }, 400);
      }

      const { model, inputTokens, outputTokens } = result.data;
      const endUserId = result.data.userId;
      const usage = await usageStore.updateUsage(endUserId, model, inputTokens, outputTokens);

      const threshold = await usageStore.getThreshold(endUserId);
      let blocked = false;
      if (threshold.maxCostUsd !== undefined && usage.costUsd >= threshold.maxCostUsd) {
        blocked = true;
      }
      if (
        threshold.maxTotalTokens !== undefined &&
        threshold.maxTotalTokens > 0 &&
        usage.totalTokens >= threshold.maxTotalTokens
      ) {
        blocked = true;
      }

      logger.info({ endUserId, inputTokens, outputTokens, blocked }, 'SDK usage recorded');

      return c.json({
        recorded: true,
        usage: { tokens: usage.totalTokens, costUsd: usage.costUsd },
        blocked,
      });
    });

    // Log full request/response
    if (requestLogStore && userStore) {
      app.post('/sdk/log', apiKeyMw, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const result = sdkLogSchema.safeParse(body);
        if (!result.success) {
          return c.json({ error: result.error.issues }, 400);
        }

        const platformUserId = c.get('apiKeyUserId');
        const user = await userStore.findByUserId(platformUserId);
        const orgId = user?.orgId ?? null;

        const {
          model,
          request: reqBody,
          response: resBody,
          status,
          latencyMs,
          conversationId: clientConversationId,
          userId: clientUserId,
          userEmail: clientEmail,
          userName: clientName,
          feature: clientFeature,
        } = result.data;

        // End user id: client-supplied (per end user) or fall back to API key owner
        const endUserId = clientUserId ?? platformUserId;

        // Use client-supplied conversationId or generate one
        const conversationId = clientConversationId || crypto.randomUUID();

        // Resolve end user email and name: prefer explicit values, fall back to platform user record
        const endUserEmail = clientEmail || user?.email || null;
        const endUserName = clientName || user?.displayName || null;

        // Extract token counts from response.usage if present
        // Supports both Chat Completions format (response.usage) and
        // Realtime API format (response.response.usage from response.done events)
        const rawResponse = resBody as Record<string, unknown> | undefined;
        const usage = (rawResponse?.usage ?? (rawResponse?.response as Record<string, unknown> | undefined)?.usage) as
          | {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              input_tokens?: number;
              output_tokens?: number;
              prompt_tokens_details?: {
                cached_tokens?: number;
                text_tokens?: number;
                audio_tokens?: number;
                image_tokens?: number;
              };
              completion_tokens_details?: {
                text_tokens?: number;
                audio_tokens?: number;
                reasoning_tokens?: number;
              };
              input_token_details?: {
                cached_tokens?: number;
                text_tokens?: number;
                audio_tokens?: number;
                image_tokens?: number;
              };
              output_token_details?: {
                text_tokens?: number;
                audio_tokens?: number;
                reasoning_tokens?: number;
              };
            }
          | undefined;

        const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? null;
        const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? null;
        const totalTokens = usage?.total_tokens ?? null;

        // Extract granular input token details (Chat: prompt_tokens_details, Realtime: input_token_details)
        const inputDetails = usage?.prompt_tokens_details ?? usage?.input_token_details;
        const cachedInputTokens = inputDetails?.cached_tokens ?? null;
        const textInputTokens = inputDetails?.text_tokens ?? null;
        const audioInputTokens = inputDetails?.audio_tokens ?? null;
        const imageInputTokens = inputDetails?.image_tokens ?? null;

        // Extract granular output token details (Chat: completion_tokens_details, Realtime: output_token_details)
        const outputDetails = usage?.completion_tokens_details ?? usage?.output_token_details;
        const textOutputTokens = outputDetails?.text_tokens ?? null;
        const audioOutputTokens = outputDetails?.audio_tokens ?? null;
        const reasoningTokens = outputDetails?.reasoning_tokens ?? null;

        // Calculate per-request cost using granular data when available
        const inputTokens = promptTokens ?? 0;
        const outputTokens = completionTokens ?? 0;
        let requestCost: number | null = null;
        if (inputTokens > 0 || outputTokens > 0) {
          if (pricingStore && (textInputTokens !== null || audioInputTokens !== null || audioOutputTokens !== null)) {
            requestCost = await pricingStore.calculateDetailedCost(model, {
              inputTokens,
              outputTokens,
              cachedInputTokens: cachedInputTokens ?? undefined,
              textInputTokens: textInputTokens ?? undefined,
              audioInputTokens: audioInputTokens ?? undefined,
              imageInputTokens: imageInputTokens ?? undefined,
              textOutputTokens: textOutputTokens ?? undefined,
              audioOutputTokens: audioOutputTokens ?? undefined,
              reasoningTokens: reasoningTokens ?? undefined,
            });
          } else if (pricingStore) {
            requestCost = await pricingStore.calculateCost(model, inputTokens, outputTokens);
          } else {
            requestCost = staticCalculateCost(model, inputTokens, outputTokens);
          }
        }

        const id = crypto.randomUUID();
        const log = await requestLogStore.create({
          id,
          endUserId,
          orgId,
          endUserEmail,
          endUserName,
          conversationId,
          model,
          feature: clientFeature ?? null,
          requestBody: JSON.stringify(reqBody),
          responseBody: resBody ? JSON.stringify(resBody) : null,
          status: status ?? 'success',
          promptTokens,
          completionTokens,
          totalTokens,
          cachedInputTokens,
          textInputTokens,
          audioInputTokens,
          imageInputTokens,
          textOutputTokens,
          audioOutputTokens,
          reasoningTokens,
          costUsd: requestCost,
          latencyMs: latencyMs ?? null,
          createdAt: new Date(),
        });

        // Record usage so dashboard summary and charts show tokens/cost (stored under 'default' period key)
        if (inputTokens > 0 || outputTokens > 0) {
          await usageStore.updateUsage(endUserId, model, inputTokens, outputTokens, 'default');
        }

        logger.info({ logId: log.id, endUserId, conversationId, model }, 'Request logged');

        return c.json({ id: log.id, conversationId, recorded: true }, 201);
      });
    }
  }

  // ============================================================
  // Dev seed endpoint (only available when devMode is enabled)
  // ============================================================

  if (devMode && requestLogStore && userStore) {
    const seedAuthMw = createAuthMiddleware(jwtSecret);

    app.post('/dev/seed', seedAuthMw, async (c) => {
      const payload = c.get('user');
      const orgId = payload.orgId;
      if (!orgId) {
        return c.json({ error: 'Organization required' }, 403);
      }

      const now = new Date();

      const demoUsers = [
        { endUserId: 'demo_alice', endUserEmail: 'alice@acme.com', endUserName: 'Alice Chen' },
        { endUserId: 'demo_bob', endUserEmail: 'bob@acme.com', endUserName: 'Bob Martinez' },
        { endUserId: 'demo_carol', endUserEmail: 'carol@acme.com', endUserName: 'Carol Williams' },
        { endUserId: 'demo_dave', endUserEmail: 'dave@acme.com', endUserName: 'Dave Patel' },
        { endUserId: 'demo_eve', endUserEmail: 'eve@acme.com', endUserName: 'Eve Johnson' },
      ];

      const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4o-realtime-preview'];
      const features = ['chat', 'assistant', 'search', 'summarize', 'analyze'];

      type ConvPair = { user: string; assistant: string };
      const conversations: ConvPair[] = [
        {
          user: 'How do I implement rate limiting in a Node.js API?',
          assistant: 'There are several approaches for rate limiting in Node.js. The most common is the token bucket algorithm, which you can implement with the `express-rate-limit` package:\n\n```js\nimport rateLimit from \'express-rate-limit\';\n\nconst limiter = rateLimit({\n  windowMs: 15 * 60 * 1000, // 15 minutes\n  max: 100, // limit each IP to 100 requests per window\n  standardHeaders: true,\n  legacyHeaders: false,\n});\n\napp.use(\'/api/\', limiter);\n```\n\nFor more granular per-user limiting, store counters in Redis with a TTL equal to your window.',
        },
        {
          user: 'Write a SQL query to find the top 5 customers by total revenue this month.',
          assistant: 'Here\'s a query that aggregates order totals and ranks by revenue:\n\n```sql\nSELECT\n  c.id,\n  c.name,\n  c.email,\n  SUM(o.total_amount) AS revenue\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.created_at >= DATE_TRUNC(\'month\', NOW())\n  AND o.status = \'completed\'\nGROUP BY c.id, c.name, c.email\nORDER BY revenue DESC\nLIMIT 5;\n```\n\nIf you need the previous month for comparison, replace `NOW()` with `NOW() - INTERVAL \'1 month\'`.',
        },
        {
          user: 'What are the key differences between React and Vue for a mid-sized team?',
          assistant: 'The main practical differences come down to opinion vs. convention:\n\n**React** gives you maximum flexibility—you pick your router, state manager, and form library. This is powerful but adds decision fatigue and inconsistency across teams.\n\n**Vue** ships with an official router and Pinia for state, so architectural decisions are already made. Templates are HTML-like and easier for developers coming from a backend or design background.\n\nFor a mid-sized team, Vue often wins on onboarding speed and code consistency. React wins if you need a larger hiring pool or are building something that pushes the framework to its limits.',
        },
        {
          user: 'Help me write a polite email declining a vendor meeting request.',
          assistant: 'Subject: Re: Meeting Request\n\nHi [Name],\n\nThank you for reaching out — I appreciate you thinking of us.\n\nUnfortunately, we\'re not in a position to evaluate new vendors in this area right now, so I\'ll have to decline the meeting. I wouldn\'t want to take up your time when we can\'t give your solution the attention it deserves.\n\nI\'ll keep your details on file in case our needs change down the line.\n\nBest,\n[Your name]',
        },
        {
          user: 'Explain async/await in JavaScript in plain English.',
          assistant: 'Async/await is syntax sugar over Promises that makes asynchronous code read like synchronous code.\n\nWhen you mark a function `async`, it always returns a Promise. Inside it, you can `await` any Promise — execution pauses at that line until the Promise resolves, then continues with the result.\n\n```js\nasync function getUser(id) {\n  const res = await fetch(`/api/users/${id}`);\n  const user = await res.json();\n  return user; // wrapped in a Promise automatically\n}\n```\n\nThe key mental model: `await` just means "wait for this before continuing, but don\'t block the whole thread."',
        },
        {
          user: 'How do I implement JWT authentication in an Express app?',
          assistant: 'Here\'s a minimal JWT auth setup:\n\n**1. Issue a token on login:**\n```js\nimport jwt from \'jsonwebtoken\';\n\napp.post(\'/login\', async (req, res) => {\n  const user = await verifyCredentials(req.body);\n  if (!user) return res.status(401).json({ error: \'Invalid credentials\' });\n  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: \'7d\' });\n  res.json({ token });\n});\n```\n\n**2. Protect routes with middleware:**\n```js\nfunction authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(\' \')[1];\n  if (!token) return res.status(401).json({ error: \'No token\' });\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET);\n    next();\n  } catch {\n    res.status(401).json({ error: \'Invalid token\' });\n  }\n}\n```',
        },
        {
          user: 'What regex pattern validates a standard email address?',
          assistant: 'For most practical purposes, this pattern covers valid email addresses:\n\n```\n/^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$/\n```\n\nIn JavaScript:\n```js\nfunction isValidEmail(email) {\n  return /^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$/.test(email);\n}\n```\n\nNote: The RFC 5322 spec is much more permissive than this. For production, a simple syntax check like this plus a verification email is more reliable than a perfect regex.',
        },
        {
          user: 'How should I structure a microservices architecture for a growing SaaS product?',
          assistant: 'Start with the "strangler fig" pattern — don\'t decompose from day one. A well-structured monolith is easier to reason about and deploy.\n\nWhen you do split services, organise around business domains, not technical layers. Good boundaries tend to be: auth/users, billing, notifications, core product logic.\n\n**Practical rules:**\n- Each service owns its database. No sharing tables.\n- Communicate via events for async work, REST/gRPC for synchronous calls.\n- Deploy each service independently with its own CI pipeline.\n- Use a service mesh (Istio, Linkerd) once you have 5+ services to handle observability and retries.\n\nThe most common mistake is splitting too early. If two services always deploy together, they should be one service.',
        },
        {
          user: 'I\'m getting "TypeError: Cannot read properties of undefined (reading \'map\')" in React. How do I fix it?',
          assistant: 'This error means you\'re calling `.map()` on a value that\'s `undefined` — usually because data hasn\'t loaded yet.\n\nThe fix: provide a default empty array:\n```jsx\n// Before\n{data.items.map(item => <Item key={item.id} {...item} />)}\n\n// After\n{(data?.items ?? []).map(item => <Item key={item.id} {...item} />)}\n```\n\nOr guard the render:\n```jsx\nif (!data) return <Spinner />;\n```\n\nFor async data fetching, always initialise state as `null` or `[]` and render a loading state until it resolves.',
        },
        {
          user: 'Write a Python function to read a CSV and return a list of dicts.',
          assistant: '```python\nimport csv\nfrom pathlib import Path\n\ndef read_csv(path: str | Path) -> list[dict]:\n    """Read a CSV file and return each row as a dict keyed by header."""\n    with open(path, newline="", encoding="utf-8") as f:\n        reader = csv.DictReader(f)\n        return list(reader)\n\n# Usage\nrows = read_csv("data.csv")\nprint(rows[0])  # {\'name\': \'Alice\', \'age\': \'32\', ...}\n```\n\nNote that all values come back as strings. If you need typed data, use `pandas.read_csv()` instead — it infers types automatically.',
        },
        {
          user: 'Explain the CAP theorem in simple terms.',
          assistant: 'CAP theorem says a distributed system can only guarantee two of these three properties at the same time:\n\n- **Consistency** — every read returns the most recent write\n- **Availability** — every request gets a response (even if stale)\n- **Partition tolerance** — the system keeps working if nodes can\'t talk to each other\n\nIn practice, network partitions happen, so you always need partition tolerance. That means the real trade-off is **consistency vs. availability**.\n\n- PostgreSQL, MySQL → prioritise consistency (CP)\n- Cassandra, DynamoDB → prioritise availability (AP)\n\nFor most web apps, eventual consistency (AP) is fine. You\'d only need CP for things like bank balances or inventory management.',
        },
        {
          user: 'My PostgreSQL query is slow. How do I start debugging it?',
          assistant: 'Start with `EXPLAIN ANALYZE`:\n\n```sql\nEXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\nSELECT * FROM orders WHERE customer_id = 123 AND status = \'pending\';\n```\n\nLook for:\n- **Seq Scan** on a large table → you need an index\n- **high actual vs estimated rows** → stale statistics, run `ANALYZE orders`\n- **Nested Loop with many iterations** → may need a hash join or better index\n\nQuick wins:\n```sql\n-- Add a composite index for your most common filter combination\nCREATE INDEX CONCURRENTLY idx_orders_customer_status\n  ON orders (customer_id, status);\n```\n\nAlso check `pg_stat_statements` for your slowest queries across the whole database.',
        },
        {
          user: 'What are REST API best practices I should follow?',
          assistant: 'The ones that matter most in practice:\n\n**URLs represent resources, not actions**\n- ✅ `DELETE /users/42`\n- ❌ `POST /deleteUser?id=42`\n\n**Use standard HTTP status codes correctly**\n- 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity, 429 Too Many Requests\n\n**Version your API from day one** — `/v1/users` is much easier than retrofitting it later\n\n**Consistent error shape** — always return `{ error: string, code?: string }` so clients can parse errors reliably\n\n**Pagination** — use cursor-based pagination for large collections; avoid `OFFSET` at scale\n\n**Never expose internal IDs** — use UUIDs or opaque tokens instead of auto-increment integers',
        },
        {
          user: 'Can you summarise the main points of our Q3 product roadmap document?',
          assistant: 'Based on the document, the Q3 priorities are:\n\n1. **Performance** — reduce p95 API latency from 340ms to under 150ms by migrating hot paths to edge workers\n2. **Billing overhaul** — replace the current flat-rate plan with usage-based pricing; launch in mid-August\n3. **Team accounts** — add multi-seat organisations with role-based access (admin, member, viewer)\n4. **Mobile SDK** — ship iOS and Android SDKs to unlock the enterprise segment that blocked on mobile support\n5. **Observability** — instrument all services with OpenTelemetry and set up error budgets per SLO\n\nThe theme is scaling the platform to handle 10× current traffic while unlocking enterprise deals blocked on compliance and team features.',
        },
        {
          user: 'How do I debounce a search input in React?',
          assistant: 'The cleanest approach is a custom hook:\n\n```ts\nimport { useState, useEffect } from \'react\';\n\nfunction useDebounce<T>(value: T, delayMs: number): T {\n  const [debounced, setDebounced] = useState(value);\n\n  useEffect(() => {\n    const timer = setTimeout(() => setDebounced(value), delayMs);\n    return () => clearTimeout(timer);\n  }, [value, delayMs]);\n\n  return debounced;\n}\n\n// Usage\nfunction SearchBox() {\n  const [query, setQuery] = useState(\'\');\n  const debouncedQuery = useDebounce(query, 300);\n\n  useEffect(() => {\n    if (debouncedQuery) fetchResults(debouncedQuery);\n  }, [debouncedQuery]);\n\n  return <input value={query} onChange={e => setQuery(e.target.value)} />;\n}\n```\n\nThe `delayMs` of 300ms is a good default — noticeable but not sluggish.',
        },
        {
          user: 'What\'s the difference between authentication and authorisation?',
          assistant: '**Authentication** answers "who are you?" — it verifies identity. Examples: logging in with a password, verifying a JWT, OAuth.\n\n**Authorisation** answers "what are you allowed to do?" — it checks permissions. Examples: "can this user edit this post?", role-based access control (RBAC), resource ownership checks.\n\nAuthentication always comes first. You can\'t authorise someone you haven\'t identified.\n\nIn code, the pattern looks like:\n```js\n// Authentication middleware — runs first\nconst user = verifyToken(req.headers.authorization);\nif (!user) return res.status(401).json({ error: \'Unauthenticated\' });\n\n// Authorisation check — runs after\nif (post.authorId !== user.id && user.role !== \'admin\') {\n  return res.status(403).json({ error: \'Forbidden\' });\n}\n```',
        },
        {
          user: 'Generate a TypeScript type for a paginated API response.',
          assistant: '```typescript\ninterface PaginatedResponse<T> {\n  data: T[];\n  pagination: {\n    total: number;\n    page: number;\n    perPage: number;\n    hasNextPage: boolean;\n    hasPrevPage: boolean;\n  };\n}\n\n// Cursor-based variant (better for large datasets)\ninterface CursorPaginatedResponse<T> {\n  data: T[];\n  nextCursor: string | null;\n  prevCursor: string | null;\n  total?: number; // optional — expensive to compute\n}\n\n// Usage\ntype UserListResponse = PaginatedResponse<User>;\nasync function getUsers(page: number): Promise<UserListResponse> { ... }\n```\n\nPrefer cursor-based pagination if your data can be inserted or deleted between pages — offset pagination skips or duplicates items when the underlying data changes.',
        },
        {
          user: 'How do I handle environment variables safely in a Next.js app?',
          assistant: 'Next.js splits env vars into two categories:\n\n**Server-only** — any variable in `.env.local` without the `NEXT_PUBLIC_` prefix. Only accessible in Server Components, API routes, and `getServerSideProps`. Never sent to the browser.\n\n**Public (client-accessible)** — prefixed with `NEXT_PUBLIC_`. Gets inlined at build time into the client bundle. Treat these as public — never put secrets here.\n\nBest practices:\n- `.env.local` for local development (git-ignored)\n- `.env.example` committed to the repo as a template\n- Secrets (API keys, DB passwords) always server-only\n- Use a secrets manager (Doppler, Infisical, AWS Secrets Manager) for production rather than env files\n\n```ts\n// ✅ Safe — server only\nconst dbUrl = process.env.DATABASE_URL;\n\n// ⚠️ Public — visible in browser bundle\nconst apiBase = process.env.NEXT_PUBLIC_API_URL;\n```',
        },
        {
          user: 'I need to merge two arrays of objects by a shared key in JavaScript.',
          assistant: '```js\n// Merge two arrays of objects by a shared key (e.g. "id")\nfunction mergeById(a, b, key = \'id\') {\n  const map = new Map(a.map(item => [item[key], item]));\n  for (const item of b) {\n    map.set(item[key], { ...map.get(item[key]), ...item });\n  }\n  return Array.from(map.values());\n}\n\n// Example\nconst users = [{ id: 1, name: \'Alice\' }, { id: 2, name: \'Bob\' }];\nconst scores = [{ id: 1, score: 95 }, { id: 3, score: 72 }];\n\nconsole.log(mergeById(users, scores));\n// [\n//   { id: 1, name: \'Alice\', score: 95 },\n//   { id: 2, name: \'Bob\' },\n//   { id: 3, score: 72 }\n// ]\n```\n\nItems in `b` that aren\'t in `a` are added. If both arrays have the same key, `b`\'s values win (spread order).',
        },
        {
          user: 'What\'s the best way to handle errors in an async Express route?',
          assistant: 'Wrap your async handlers to forward errors to Express\'s error middleware:\n\n```js\n// Utility wrapper\nconst asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);\n\n// Route using the wrapper\napp.get(\'/users/:id\', asyncHandler(async (req, res) => {\n  const user = await db.findUser(req.params.id);\n  if (!user) throw Object.assign(new Error(\'Not found\'), { status: 404 });\n  res.json(user);\n}));\n\n// Central error handler (must have 4 params)\napp.use((err, req, res, next) => {\n  const status = err.status ?? 500;\n  res.status(status).json({\n    error: status < 500 ? err.message : \'Internal server error\',\n  });\n});\n```\n\nIn Express 5 (now stable), async errors propagate automatically without the wrapper.',
        },
      ];

      let totalLogs = 0;

      for (const demoUser of demoUsers) {
        const numRequests = 20 + Math.floor(Math.random() * 21); // 20–40 per user

        for (let i = 0; i < numRequests; i++) {
          // Random timestamp within the last 30 days
          const daysAgo = Math.floor(Math.random() * 30);
          const ts = new Date(now);
          ts.setUTCDate(ts.getUTCDate() - daysAgo);
          ts.setUTCHours(
            8 + Math.floor(Math.random() * 14), // 08:00–21:59 UTC
            Math.floor(Math.random() * 60),
            Math.floor(Math.random() * 60),
            0
          );

          const model = models[Math.floor(Math.random() * models.length)];
          const feature = features[Math.floor(Math.random() * features.length)];
          const conv = conversations[Math.floor(Math.random() * conversations.length)];
          const promptTokens = 200 + Math.floor(Math.random() * 2000);
          const completionTokens = 50 + Math.floor(Math.random() * 500);
          const latencyMs = 200 + Math.floor(Math.random() * 2800);
          const success = Math.random() > 0.05; // 95% success rate

          let costUsd = 0;
          if (pricingStore) {
            try {
              costUsd = await pricingStore.calculateCost(model, promptTokens, completionTokens);
            } catch {
              costUsd = (promptTokens * 0.0025 + completionTokens * 0.01) / 1000;
            }
          } else {
            costUsd = (promptTokens * 0.0025 + completionTokens * 0.01) / 1000;
          }

          await requestLogStore.create({
            id: crypto.randomUUID(),
            endUserId: demoUser.endUserId,
            orgId,
            endUserEmail: demoUser.endUserEmail,
            endUserName: demoUser.endUserName,
            conversationId: crypto.randomUUID(),
            model,
            feature,
            requestBody: JSON.stringify({ messages: [{ role: 'user', content: conv.user }] }),
            responseBody: JSON.stringify({ choices: [{ message: { role: 'assistant', content: conv.assistant } }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } }),
            status: success ? 'success' : 'error',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd,
            latencyMs,
            createdAt: ts,
          });

          // Update usage for the correct daily period key so date-range queries work
          const periodKey = getPeriodKey('daily', ts);
          await usageStore.updateUsage(demoUser.endUserId, model, promptTokens, completionTokens, periodKey, costUsd);

          totalLogs++;
        }
      }

      logger.info({ orgId, users: demoUsers.length, logs: totalLogs }, 'Demo data seeded');

      return c.json({ seeded: true, orgId, users: demoUsers.length, logs: totalLogs });
    });
  }

  return app;
}
