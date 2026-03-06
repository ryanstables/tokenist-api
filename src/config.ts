import type { UsageWindow } from './types/user';
import type { LogLevel, Logger } from './logger';
import type { UsageStore, Blocklist, UserStore, ApiKeyStore, RequestLogStore, PricingStore, SlackSettingsStore, SentimentLabelStore, TierUsageStore } from './storage/interfaces';

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

  // Stripe payment integration (optional)
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceStarterMonthly?: string;
  stripePriceStarterAnnual?: string;
  stripePriceGrowthMonthly?: string;
  stripePriceGrowthAnnual?: string;
  dashboardUrl?: string;
  marketingUrl?: string;

  usageStore: UsageStore;
  blocklist: Blocklist;
  userStore?: UserStore;
  apiKeyStore?: ApiKeyStore;
  requestLogStore?: RequestLogStore;
  pricingStore?: PricingStore;
  slackSettingsStore?: SlackSettingsStore;
  sentimentLabelStore?: SentimentLabelStore;
  tierUsageStore?: TierUsageStore;
  logger?: Logger;
}
