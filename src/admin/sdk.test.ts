import { describe, it, expect, beforeEach } from 'vitest';
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
import { hashPassword } from '../auth/password';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore, PricingStore } from '../storage/interfaces';
import type { Logger } from '../logger';

const JWT_SECRET = 'test-secret-key-for-tests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface TestContext {
  app: ReturnType<typeof createAdminRoutes>;
  usageStore: UsageStore;
  blocklist: Blocklist;
  userStore: UserStore;
  apiKeyStore: ApiKeyStore;
  requestLogStore: RequestLogStore;
  pricingStore: PricingStore;
  logger: Logger;
  apiKey: string;
}

async function createTestApp(): Promise<TestContext> {
  const usageStore = createInMemoryUsageStore();
  const blocklist = createInMemoryBlocklist();
  const userStore = createInMemoryUserStore();
  const apiKeyStore = createInMemoryApiKeyStore();
  const requestLogStore = createInMemoryRequestLogStore();
  const pricingStore = createInMemoryPricingStore();
  const logger = createLogger('error');

  const app = createAdminRoutes({
    usageStore,
    blocklist,
    userStore,
    apiKeyStore,
    requestLogStore,
    pricingStore,
    logger,
    jwtSecret: JWT_SECRET,
  });

  // Create a user and API key for SDK auth
  const passwordHash = await hashPassword('test-password');
  await userStore.create({
    userId: 'platform-user-1',
    email: 'test@example.com',
    passwordHash,
    orgId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const { plainKey } = await apiKeyStore.create('platform-user-1', 'test-key');

  return {
    app,
    usageStore,
    blocklist,
    userStore,
    apiKeyStore,
    requestLogStore,
    pricingStore,
    logger,
    apiKey: plainKey,
  };
}

function sdkRequest(app: ReturnType<typeof createAdminRoutes>, path: string, apiKey: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

describe('SDK endpoints', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  describe('POST /sdk/check', () => {
    it('allows a new user with no usage', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/check', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-4o-realtime-preview',
        requestType: 'realtime',
      });
      expect(res.status).toBe(200);
      const body: Json = await res.json();
      expect(body.allowed).toBe(true);
    });

    it('blocks a user on the blocklist', async () => {
      await ctx.blocklist.block('end-user-1', 'abuse');
      const res = await sdkRequest(ctx.app, '/sdk/check', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-4o-realtime-preview',
        requestType: 'realtime',
      });
      expect(res.status).toBe(200);
      const body: Json = await res.json();
      expect(body.allowed).toBe(false);
      expect(body.reason).toContain('blocked');
    });

    it('blocks a user who exceeded cost threshold', async () => {
      await ctx.usageStore.setThreshold('end-user-1', { maxCostUsd: 1.0 });
      // Simulate accumulated cost exceeding $1
      await ctx.usageStore.updateUsage('end-user-1', 'gpt-realtime', 10000, 5000, undefined, 1.50);

      const res = await sdkRequest(ctx.app, '/sdk/check', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-realtime',
        requestType: 'realtime',
      });
      const body: Json = await res.json();
      expect(body.allowed).toBe(false);
      expect(body.reason).toContain('Cost limit');
    });

    it('returns 400 for invalid request body', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/check', ctx.apiKey, {
        model: 'gpt-4o',
        // missing userId and requestType
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 without API key', async () => {
      const res = await ctx.app.request('/sdk/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'end-user-1',
          model: 'gpt-4o',
          requestType: 'chat',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /sdk/record', () => {
    it('records usage and returns updated totals', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/record', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-4o-realtime-preview',
        requestType: 'realtime',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 250,
        success: true,
      });
      expect(res.status).toBe(200);
      const body: Json = await res.json();
      expect(body.recorded).toBe(true);
      expect(body.usage.tokens).toBe(1500);
      expect(body.usage.costUsd).toBeGreaterThan(0);
    });

    it('accumulates usage across multiple record calls', async () => {
      await sdkRequest(ctx.app, '/sdk/record', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-realtime',
        requestType: 'realtime',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 200,
        success: true,
      });
      const res = await sdkRequest(ctx.app, '/sdk/record', ctx.apiKey, {
        userId: 'end-user-1',
        model: 'gpt-realtime',
        requestType: 'realtime',
        inputTokens: 2000,
        outputTokens: 1000,
        latencyMs: 300,
        success: true,
      });
      const body: Json = await res.json();
      expect(body.usage.tokens).toBe(4500); // 1000+500+2000+1000
    });
  });

  describe('POST /sdk/log', () => {
    it('logs a Realtime API response with audio token details', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-4o-realtime-preview',
        userId: 'end-user-1',
        request: {
          type: 'response.create',
          response: { modalities: ['text', 'audio'] },
        },
        response: {
          id: 'resp_abc',
          status: 'completed',
          usage: {
            total_tokens: 5000,
            input_tokens: 3200,
            output_tokens: 1800,
            input_token_details: {
              cached_tokens: 100,
              text_tokens: 200,
              audio_tokens: 3000,
            },
            output_token_details: {
              text_tokens: 300,
              audio_tokens: 1500,
            },
          },
        },
        status: 'success',
        latencyMs: 450,
      });

      expect(res.status).toBe(201);
      const body: Json = await res.json();
      expect(body.recorded).toBe(true);
      expect(body.id).toBeDefined();
      expect(body.conversationId).toBeDefined();
    });

    it('stores granular token details in the request log', async () => {
      await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-realtime',
        userId: 'end-user-1',
        request: { type: 'response.create' },
        response: {
          id: 'resp_xyz',
          status: 'completed',
          usage: {
            total_tokens: 2000,
            input_tokens: 1200,
            output_tokens: 800,
            input_token_details: {
              text_tokens: 200,
              audio_tokens: 1000,
              cached_tokens: 50,
            },
            output_token_details: {
              text_tokens: 300,
              audio_tokens: 500,
            },
          },
        },
      });

      // Verify the log was stored with token details by fetching it
      const { logs } = await ctx.requestLogStore.listByOrgId('org-1', { limit: 10, offset: 0 });
      expect(logs.length).toBe(1);
      const log = logs[0];
      expect(log.audioInputTokens).toBe(1000);
      expect(log.textInputTokens).toBe(200);
      expect(log.cachedInputTokens).toBe(50);
      expect(log.audioOutputTokens).toBe(500);
      expect(log.textOutputTokens).toBe(300);
      expect(log.promptTokens).toBe(1200);
      expect(log.completionTokens).toBe(800);
    });

    it('calculates detailed cost for audio responses using pricingStore', async () => {
      await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-4o-realtime-preview',
        userId: 'end-user-1',
        request: { type: 'response.create' },
        response: {
          id: 'resp_cost',
          status: 'completed',
          usage: {
            total_tokens: 2000,
            input_tokens: 1000,
            output_tokens: 1000,
            input_token_details: {
              text_tokens: 200,
              audio_tokens: 800,
            },
            output_token_details: {
              text_tokens: 200,
              audio_tokens: 800,
            },
          },
        },
      });

      const { logs } = await ctx.requestLogStore.listByOrgId('org-1', { limit: 10, offset: 0 });
      expect(logs.length).toBe(1);
      const log = logs[0];

      // costUsd should be set and reflect audio pricing (higher than text-only)
      expect(log.costUsd).toBeDefined();
      expect(log.costUsd).toBeGreaterThan(0);
    });

    it('logs a standard Chat Completions response without audio', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-4o',
        userId: 'end-user-1',
        request: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        },
        response: {
          id: 'chatcmpl-xyz',
          choices: [{ message: { role: 'assistant', content: 'Hi!' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
      });

      expect(res.status).toBe(201);
      const { logs } = await ctx.requestLogStore.listByOrgId('org-1', { limit: 10, offset: 0 });
      expect(logs.length).toBe(1);
      expect(logs[0].promptTokens).toBe(10);
      expect(logs[0].completionTokens).toBe(5);
      expect(logs[0].costUsd).toBeGreaterThan(0);
    });

    it('handles response without usage gracefully', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-4o',
        userId: 'end-user-1',
        request: { model: 'gpt-4o', messages: [] },
        response: {
          id: 'chatcmpl-nousage',
          choices: [],
        },
      });

      expect(res.status).toBe(201);
      const { logs } = await ctx.requestLogStore.listByOrgId('org-1', { limit: 10, offset: 0 });
      expect(logs[0].promptTokens).toBeNull();
      expect(logs[0].costUsd).toBeNull();
    });

    it('updates usage store when logging a request', async () => {
      await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-realtime',
        userId: 'end-user-1',
        request: { type: 'response.create' },
        response: {
          usage: {
            total_tokens: 1000,
            input_tokens: 600,
            output_tokens: 400,
          },
        },
      });

      const usage = await ctx.usageStore.getUsage('end-user-1');
      expect(usage).toBeDefined();
      expect(usage!.inputTokens).toBe(600);
      expect(usage!.outputTokens).toBe(400);
      expect(usage!.totalTokens).toBe(1000);
    });

    it('uses custom conversationId when provided', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        model: 'gpt-4o',
        userId: 'end-user-1',
        conversationId: 'my-custom-conv-id',
        request: { messages: [] },
        response: { usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 } },
      });

      const body: Json = await res.json();
      expect(body.conversationId).toBe('my-custom-conv-id');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await sdkRequest(ctx.app, '/sdk/log', ctx.apiKey, {
        // missing model and request
        userId: 'end-user-1',
      });
      expect(res.status).toBe(400);
    });
  });
});
