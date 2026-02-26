import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { TokenistConfig } from './config';
import { createLogger } from './logger';
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
  RequestLogStore,
  StoredRequestLog,
  PricingStore,
  ModelRecord,
  ModelTokenPricing,
  DetailedTokenUsage,
  SentimentLabel,
  SentimentLabelStore,
} from './storage/interfaces';
export type {
  UsageWindow,
  EndUserIdentity,
  EndUserUsage,
  EndUserThreshold,
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
  ResponseDone,
  ResponseFunctionCallArgumentsDelta,
  ResponseFunctionCallArgumentsDone,
  SessionCreated,
  RateLimitsUpdated,
} from './types/events';
export type { JWTPayload } from './auth/jwt';
export type { ThresholdCheck } from './guardrails/policy';
export type { TokenEstimate, TokenDetails, ResponseUsage } from './usage/estimator';
export type { ModelPricing } from './usage/pricing';

// Re-export implementations
export { createLogger } from './logger';
export {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
  createInMemoryRequestLogStore,
  createInMemoryPricingStore,
  createInMemoryLabelStore,
} from './storage/memory';
export {
  createD1UsageStore,
  createD1Blocklist,
  createD1UserStore,
  createD1ApiKeyStore,
  createD1RequestLogStore,
  createD1PricingStore,
  createD1SentimentLabelStore,
} from './storage/d1';
export type { D1StoreOptions } from './storage/d1';
export { getPeriodKey, getRolling24hPeriodKeys } from './storage/period';
export { getPricing, calculateCost, calculateDetailedCost } from './usage/pricing';
export {
  countTokens,
  estimateClientMessageTokens,
  estimateUpstreamMessageTokens,
  extractResponseUsage,
} from './usage/estimator';
export { checkThreshold } from './guardrails/policy';
export { generateToken, verifyToken } from './auth/jwt';
export { hashPassword, verifyPassword } from './auth/password';

export interface TokenistInstance {
  fetch: (request: Request) => Response | Promise<Response>;
}

export function createTokenist(config: TokenistConfig): TokenistInstance {
  const logger = config.logger ?? createLogger(config.logLevel ?? 'info');
  const { usageStore, blocklist, userStore, apiKeyStore, requestLogStore, pricingStore, slackSettingsStore, sentimentLabelStore } = config;

  // Build admin/API routes
  const adminApp = createAdminRoutes({
    usageStore,
    blocklist,
    userStore,
    apiKeyStore,
    requestLogStore,
    pricingStore,
    slackSettingsStore,
    sentimentLabelStore,
    logger,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    openaiApiKey: config.openaiApiKey,
    devMode: config.devMode,
    db: config.db,
  });

  // Main app with CORS
  const app = new Hono();
  app.use('*', cors());

  // Mount admin routes
  app.route('/', adminApp);

  return {
    fetch: (request: Request) => app.fetch(request),
  };
}
