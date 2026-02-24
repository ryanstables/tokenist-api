import type { UsageWindow } from './types/user';
import type { LogLevel, Logger } from './logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore, PricingStore } from './storage/interfaces';

export interface TokenistConfig {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
  defaultUsageWindow?: UsageWindow;
  jwtSecret: string;
  jwtExpiresIn?: string;
  logLevel?: LogLevel;

  usageStore: UsageStore;
  blocklist: Blocklist;
  userStore?: UserStore;
  apiKeyStore?: ApiKeyStore;
  requestLogStore?: RequestLogStore;
  pricingStore?: PricingStore;
  logger?: Logger;
}
