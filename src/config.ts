import type { UsageWindow } from './types/user';
import type { LogLevel, Logger } from './logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore, PricingStore, SlackSettingsStore, SentimentLabelStore } from './storage/interfaces';

export interface TokenistConfig {
  defaultMaxCostUsd?: number;
  defaultMaxTotalTokens?: number;
  defaultUsageWindow?: UsageWindow;
  jwtSecret: string;
  jwtExpiresIn?: string;
  openaiApiKey?: string;
  devMode?: boolean;
  db?: D1Database;
  logLevel?: LogLevel;

  usageStore: UsageStore;
  blocklist: Blocklist;
  userStore?: UserStore;
  apiKeyStore?: ApiKeyStore;
  requestLogStore?: RequestLogStore;
  pricingStore?: PricingStore;
  slackSettingsStore?: SlackSettingsStore;
  sentimentLabelStore?: SentimentLabelStore;
  logger?: Logger;
}
