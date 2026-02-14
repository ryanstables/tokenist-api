import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from '../logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore } from '../storage/interfaces';
import type { JWTPayload } from '../auth/jwt';
import { generateToken } from '../auth/jwt';
import { hashPassword, verifyPassword } from '../auth/password';
import { createAuthMiddleware, createApiKeyMiddleware } from './middleware';

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
  logger: Logger;
  jwtSecret: string;
  jwtExpiresIn?: string;
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
});

const sdkLogSchema = z.object({
  model: z.string().min(1),
  request: z.record(z.unknown()),
  response: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  conversationId: z.string().min(1).optional(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
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
});

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
  const { usageStore, blocklist, userStore, apiKeyStore, requestLogStore, logger, jwtSecret, jwtExpiresIn } = deps;
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

  // Get user usage
  app.get('/admin/users/:userId/usage', async (c) => {
    const userId = c.req.param('userId');

    const usage = await usageStore.getUsage(userId);
    const threshold = await usageStore.getThreshold(userId);
    const blockEntry = await blocklist.getBlockEntry(userId);

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
      userId,
      usage: usagePayload,
      threshold,
      blocked: !!blockEntry,
      blockEntry: blockEntry || null,
    });
  });

  // List all users with usage
  app.get('/admin/users', async (c) => {
    const allUsers = await usageStore.getAllUsers();

    const users = await Promise.all(
      Array.from(allUsers.entries()).map(async ([userId, usage]) => {
        const blockEntry = await blocklist.getBlockEntry(userId);
        const threshold = await usageStore.getThreshold(userId);
        return {
          userId,
          usage,
          threshold,
          blocked: !!blockEntry,
        };
      })
    );

    return c.json({ users });
  });

  // Organization summary for dashboard
  if (userStore) {
    app.get('/admin/orgs/:orgId/summary', async (c) => {
      const orgId = c.req.param('orgId');
      const period = c.req.query('period') ?? 'monthly';
      const userIdsParam = c.req.query('userIds');
      const feature = c.req.query('feature') ?? null;
      const scopedUserIds = new Set(
        (userIdsParam ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      );

      const orgUsers = await userStore.listByOrg(orgId);
      const usersInScope =
        scopedUserIds.size > 0
          ? orgUsers.filter((user) => scopedUserIds.has(user.userId))
          : orgUsers;

      const users = await Promise.all(
        usersInScope.map(async (user) => {
          const usage = await usageStore.getUsage(user.userId);
          return {
            userId: user.userId,
            displayName: user.displayName,
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
        periodLabel: buildPeriodLabel(period),
        totalCost,
        userCount: users.length,
        users,
        featureFilter: feature,
      });
    });

    app.get('/admin/orgs/:orgId/users', async (c) => {
      const orgId = c.req.param('orgId');
      const registered = await userStore.listByOrg(orgId);
      const byId = new Map(
        registered.map((u) => [
          u.userId,
          {
            id: u.userId,
            displayName: u.displayName ?? u.email ?? u.userId,
            email: u.email ?? null,
          },
        ])
      );
      if (requestLogStore) {
        const fromLogs = await requestLogStore.listUsersByOrgId(orgId);
        for (const u of fromLogs) {
          if (!byId.has(u.userId)) {
            byId.set(u.userId, {
              id: u.userId,
              displayName: u.userName ?? u.userEmail ?? u.userId,
              email: u.userEmail ?? null,
            });
          }
        }
      }
      return c.json(Array.from(byId.values()));
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
      app.get('/admin/orgs/:orgId/logs', async (c) => {
        const orgId = c.req.param('orgId');
        const limit = Number.parseInt(c.req.query('limit') ?? '25', 10);
        const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);
        const { logs, total } = await requestLogStore.listByOrgId(orgId, { limit, offset });
        return c.json({
          logs: logs.map((log) => ({
            id: log.id,
            userId: log.userId,
            orgId: log.orgId,
            userEmail: log.userEmail,
            userName: log.userName,
            conversationId: log.conversationId,
            model: log.model,
            requestBody: log.requestBody,
            responseBody: log.responseBody,
            status: log.status,
            promptTokens: log.promptTokens,
            completionTokens: log.completionTokens,
            totalTokens: log.totalTokens,
            latencyMs: log.latencyMs,
            createdAt: log.createdAt.toISOString(),
          })),
          total,
        });
      });

      app.get('/admin/orgs/:orgId/logs/:logId', async (c) => {
        const logId = c.req.param('logId');
        const log = await requestLogStore.getById(logId);
        if (!log) {
          return c.json({ error: 'Log not found' }, 404);
        }
        return c.json({
          id: log.id,
          userId: log.userId,
          orgId: log.orgId,
          userEmail: log.userEmail,
          userName: log.userName,
          conversationId: log.conversationId,
          model: log.model,
          requestBody: log.requestBody,
          responseBody: log.responseBody,
          status: log.status,
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          totalTokens: log.totalTokens,
          latencyMs: log.latencyMs,
          createdAt: log.createdAt.toISOString(),
        });
      });

      app.get('/admin/orgs/:orgId/users/:userId/logs', async (c) => {
        const orgId = c.req.param('orgId');
        const userId = c.req.param('userId');
        const limit = Number.parseInt(c.req.query('limit') ?? '10', 10);
        const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);
        const { logs, total } = await requestLogStore.listByOrgIdAndUserId(orgId, userId, {
          limit,
          offset,
        });
        return c.json({
          logs: logs.map((log) => ({
            id: log.id,
            userId: log.userId,
            orgId: log.orgId,
            userEmail: log.userEmail,
            userName: log.userName,
            conversationId: log.conversationId,
            model: log.model,
            requestBody: log.requestBody,
            responseBody: log.responseBody,
            status: log.status,
            promptTokens: log.promptTokens,
            completionTokens: log.completionTokens,
            totalTokens: log.totalTokens,
            latencyMs: log.latencyMs,
            createdAt: log.createdAt.toISOString(),
          })),
          total,
        });
      });
    }
  }

  // Block user
  app.post('/admin/users/:userId/block', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json().catch(() => ({}));

    const result = blockRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }

    const { reason, expiresAt } = result.data;
    await blocklist.block(userId, reason, expiresAt ? new Date(expiresAt) : undefined);

    logger.info({ userId, reason, expiresAt }, 'User blocked');

    return c.json({
      success: true,
      userId,
      blocked: true,
      reason,
      expiresAt,
    });
  });

  // Unblock user
  app.post('/admin/users/:userId/unblock', async (c) => {
    const userId = c.req.param('userId');
    const wasBlocked = await blocklist.unblock(userId);

    logger.info({ userId, wasBlocked }, 'User unblocked');

    return c.json({ success: true, userId, wasBlocked });
  });

  // Set user threshold
  app.post('/admin/users/:userId/threshold', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json().catch(() => ({}));

    const result = thresholdRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }

    await usageStore.setThreshold(userId, result.data);
    logger.info({ userId, threshold: result.data }, 'Threshold updated');

    return c.json({ success: true, userId, threshold: result.data });
  });

  // List blocked users
  app.get('/admin/blocked', async (c) => {
    const entries = await blocklist.getAll();
    return c.json({ blocked: entries });
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
          apiKey: key.apiKey,
          createdAt: key.createdAt.toISOString(),
        })),
      });
    });

    // Create API key (protected)
    app.post('/auth/api-keys', authMw, async (c) => {
      const payload = c.get('user');
      const body = (await c.req.json().catch(() => ({}))) as { name?: string };

      if (!body.name || body.name.length < 1 || body.name.length > 100) {
        return c.json({ error: 'name is required (1-100 chars)' }, 400);
      }

      const result = await apiKeyStore.create(payload.userId, body.name);
      return c.json(
        {
          id: result.key.id,
          name: result.key.name,
          apiKey: result.plainKey,
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
  }

  // ============================================================
  // SDK endpoints (require apiKeyStore)
  // ============================================================

  if (apiKeyStore) {
    const apiKeyMw = createApiKeyMiddleware(apiKeyStore);

    // Check if a user is allowed to make a request
    app.post('/sdk/check', apiKeyMw, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const result = sdkCheckSchema.safeParse(body);
      if (!result.success) {
        return c.json({ error: result.error.issues }, 400);
      }

      const { userId } = result.data;

      const blockEntry = await blocklist.getBlockEntry(userId);
      if (blockEntry) {
        const usage = await usageStore.getUsage(userId);
        return c.json({
          allowed: false,
          reason: `User is blocked: ${blockEntry.reason || 'No reason provided'}`,
          usage: usage
            ? { tokens: usage.totalTokens, costUsd: usage.costUsd }
            : { tokens: 0, costUsd: 0 },
        });
      }

      const usage = await usageStore.getUsage(userId);
      const threshold = await usageStore.getThreshold(userId);
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

      const { userId, model, inputTokens, outputTokens } = result.data;
      const usage = await usageStore.updateUsage(userId, model, inputTokens, outputTokens);

      const threshold = await usageStore.getThreshold(userId);
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

      logger.info({ userId, inputTokens, outputTokens, blocked }, 'SDK usage recorded');

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

        const userId = c.get('apiKeyUserId');
        const user = await userStore.findByUserId(userId);
        const orgId = user?.orgId ?? null;

        const {
          model,
          request: reqBody,
          response: resBody,
          status,
          latencyMs,
          conversationId: clientConversationId,
          userEmail: clientEmail,
          userName: clientName,
        } = result.data;

        // Use client-supplied conversationId or generate one
        const conversationId = clientConversationId || crypto.randomUUID();

        // Resolve user email and name: prefer explicit values, fall back to stored user record
        const userEmail = clientEmail || user?.email || null;
        const userName = clientName || user?.displayName || null;

        // Extract token counts from response.usage if present
        const usage = resBody?.usage as
          | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
          | undefined;
        const promptTokens = usage?.prompt_tokens ?? null;
        const completionTokens = usage?.completion_tokens ?? null;
        const totalTokens = usage?.total_tokens ?? null;

        const id = crypto.randomUUID();
        const log = await requestLogStore.create({
          id,
          userId,
          orgId,
          userEmail,
          userName,
          conversationId,
          model,
          requestBody: JSON.stringify(reqBody),
          responseBody: resBody ? JSON.stringify(resBody) : null,
          status: status ?? 'success',
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs: latencyMs ?? null,
          createdAt: new Date(),
        });

        logger.info({ logId: log.id, userId, conversationId, model }, 'Request logged');

        return c.json({ id: log.id, conversationId, recorded: true }, 201);
      });
    }
  }

  return app;
}
