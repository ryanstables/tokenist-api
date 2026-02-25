import { describe, it, expect, vi } from 'vitest';
import { createAdminRoutes } from './routes';
import {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
  createInMemoryRequestLogStore,
  createInMemoryPricingStore,
} from '../storage/memory';
import { createLogger } from '../logger';
import type { RequestLogStore } from '../storage/interfaces';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const JWT_SECRET = 'test-secret';

function createTestApp(requestLogStore: RequestLogStore, openaiApiKey?: string) {
  return createAdminRoutes({
    usageStore: createInMemoryUsageStore(),
    blocklist: createInMemoryBlocklist(),
    userStore: createInMemoryUserStore(),
    apiKeyStore: createInMemoryApiKeyStore(),
    requestLogStore,
    pricingStore: createInMemoryPricingStore(),
    logger: createLogger('error'),
    jwtSecret: JWT_SECRET,
    openaiApiKey,
  });
}

async function seedLog(store: RequestLogStore, id: string) {
  await store.create({
    id,
    endUserId: 'u1',
    conversationId: 'c1',
    model: 'gpt-4o',
    requestBody: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
    responseBody: JSON.stringify({ choices: [{ message: { content: 'Hi!' } }] }),
    status: 'success',
    createdAt: new Date(),
  });
}

describe('POST /admin/sentiment/analyze-pending', () => {
  it('returns 500 when openaiApiKey is not configured', async () => {
    const store = createInMemoryRequestLogStore();
    const app = createTestApp(store, '');

    const res = await app.fetch(
      new Request('http://localhost/admin/sentiment/analyze-pending', { method: 'POST' })
    );

    expect(res.status).toBe(500);
    const body: Json = await res.json();
    expect(body.error).toMatch(/OPENAI_API_KEY/);
  });

  it('returns { processed: 0 } when no logs are pending', async () => {
    const store = createInMemoryRequestLogStore();
    const app = createTestApp(store, 'sk-test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await app.fetch(
      new Request('http://localhost/admin/sentiment/analyze-pending', { method: 'POST' })
    );

    expect(res.status).toBe(200);
    const body: Json = await res.json();
    expect(body.processed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('processes all pending logs and returns total count', async () => {
    const store = createInMemoryRequestLogStore();
    await seedLog(store, 'log-1');
    await seedLog(store, 'log-2');
    await seedLog(store, 'log-3');

    const app = createTestApp(store, 'sk-test');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '["win"]' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const res = await app.fetch(
      new Request('http://localhost/admin/sentiment/analyze-pending', { method: 'POST' })
    );

    expect(res.status).toBe(200);
    const body: Json = await res.json();
    expect(body.processed).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const log1 = await store.getById('log-1');
    expect(log1?.analysisLabels).toEqual(['win']);
    const log2 = await store.getById('log-2');
    expect(log2?.analysisLabels).toEqual(['win']);
    const log3 = await store.getById('log-3');
    expect(log3?.analysisLabels).toEqual(['win']);

    fetchSpy.mockRestore();
  });
});
