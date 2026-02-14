import type { UsageWindow } from './types/user';
import type { LogLevel, Logger } from './logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore } from './storage/interfaces';

export interface TokenistConfig {
  openaiApiKey: string;
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
  logger?: Logger;
}
