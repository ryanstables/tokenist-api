import { createMiddleware } from 'hono/factory';
import { verifyToken, type JWTPayload } from '../auth/jwt';
import type { ApiKeyStore } from '../storage/interfaces';

type Env = {
  Variables: {
    user: JWTPayload;
    apiKeyUserId: string;
  };
};

export function createAuthMiddleware(jwtSecret: string) {
  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token, jwtSecret);

    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('user', payload);
    await next();
  });
}

export function createApiKeyMiddleware(apiKeyStore: ApiKeyStore) {
  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization header required' }, 401);
    }

    const apiKey = authHeader.slice(7);

    if (!apiKey.startsWith('ug_')) {
      return c.json({ error: 'Invalid API key format' }, 401);
    }

    const userId = await apiKeyStore.findUserIdByApiKey(apiKey);

    if (!userId) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    c.set('apiKeyUserId', userId);
    await next();
  });
}
