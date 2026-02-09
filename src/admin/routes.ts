import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from '../logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore } from '../storage/interfaces';
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

export function createAdminRoutes(deps: AdminRouteDeps) {
  const { usageStore, blocklist, userStore, apiKeyStore, logger, jwtSecret, jwtExpiresIn } = deps;
  const app = new Hono<Env>();

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

      const user = await userStore.create({
        userId,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        orgId: body.orgId,
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
            orgId: user.orgId,
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
          orgId: user.orgId,
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
        orgId: user.orgId,
      });
    });

    // List API keys (protected)
    app.get('/auth/api-keys', authMw, async (c) => {
      const payload = c.get('user');
      const keys = await apiKeyStore.listByUserId(payload.userId);
      return c.json({ keys });
    });

    // Create API key (protected)
    app.post('/auth/api-keys', authMw, async (c) => {
      const payload = c.get('user');
      const body = (await c.req.json().catch(() => ({}))) as { name?: string };

      if (!body.name || body.name.length < 1 || body.name.length > 100) {
        return c.json({ error: 'name is required (1-100 chars)' }, 400);
      }

      const result = await apiKeyStore.create(payload.userId, body.name);
      return c.json(result, 201);
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
  }

  return app;
}
