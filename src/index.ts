import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { TokenistConfig } from './config';
import { createLogger } from './logger';
import { handleWebSocketUpgrade } from './proxy/handler';
import { createAdminRoutes } from './admin/routes';

// Re-export types
export type { TokenistConfig } from './config';
export type { Logger, LogLevel } from './logger';
export type {
  UsageStore,
  Blocklist,
  BlockEntry,
  UserStore,
  StoredUserRecord,
  ApiKeyStore,
  StoredApiKey,
} from './storage/interfaces';
export type {
  UsageWindow,
  UserIdentity,
  UserUsage,
  UserThreshold,
  ConnectionContext,
  UsagePeriodKey,
  UsageHistoryEntry,
} from './types/user';
export type {
  BaseEvent,
  ClientEvent,
  ServerEvent,
  ConversationItemCreate,
  SessionUpdate,
  ResponseCreate,
  ResponseTextDelta,
  ResponseAudioTranscriptDelta,
  ResponseOutputTextDelta,
  ResponseOutputAudioTranscriptDelta,
  ResponseDone,
  SessionCreated,
} from './types/events';
export type { JWTPayload } from './auth/jwt';
export type { RelayContext, RelayHooks } from './proxy/relay';
export type { ThresholdCheck } from './guardrails/policy';
export type { ExtractIdentityResult, IdentityResult, IdentityError } from './guardrails/identity';
export type { TokenEstimate, ResponseUsage } from './usage/estimator';
export type { ModelPricing } from './usage/pricing';

// Re-export implementations
export { createLogger } from './logger';
export {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
} from './storage/memory';
export { getPeriodKey, getRolling24hPeriodKeys } from './storage/period';
export { getPricing, calculateCost } from './usage/pricing';
export {
  countTokens,
  estimateClientMessageTokens,
  estimateUpstreamMessageTokens,
  extractResponseUsage,
} from './usage/estimator';
export { extractIdentity } from './guardrails/identity';
export { checkThreshold } from './guardrails/policy';
export { generateToken, verifyToken } from './auth/jwt';
export { hashPassword, verifyPassword } from './auth/password';

export interface TokenistInstance {
  fetch: (request: Request) => Response | Promise<Response>;
}

export function createTokenist(config: TokenistConfig): TokenistInstance {
  const logger = config.logger ?? createLogger(config.logLevel ?? 'info');
  const { usageStore, blocklist, userStore, apiKeyStore } = config;

  // Build admin/API routes
  const adminApp = createAdminRoutes({
    usageStore,
    blocklist,
    userStore,
    apiKeyStore,
    logger,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });

  // Main app with CORS
  const app = new Hono();
  app.use('*', cors());

  // WebSocket upgrade for /v1/realtime
  app.all('/v1/realtime', async (c) => {
    const upgradeHeader = c.req.header('upgrade');
    if (upgradeHeader !== 'websocket') {
      return c.text('WebSocket upgrade required', 426);
    }

    return handleWebSocketUpgrade(c.req.raw, {
      usageStore,
      blocklist,
      openaiApiKey: config.openaiApiKey,
      logger,
    });
  });

  // Mount admin routes
  app.route('/', adminApp);

  return {
    fetch: (request: Request) => app.fetch(request),
  };
}
