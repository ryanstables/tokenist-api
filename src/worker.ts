import { createTokenist } from './index';
import {
  createD1UsageStore,
  createD1Blocklist,
  createD1UserStore,
  createD1ApiKeyStore,
  createD1RequestLogStore,
  createD1PricingStore,
  createD1SlackSettingsStore,
  createD1SentimentLabelStore,
} from './storage/d1';
import { handleSlackReports } from './slack/reporter';
import { handleSentimentAnalysis } from './sentiment/analyzer';

interface Env {
  JWT_SECRET: string;
  DEFAULT_MAX_COST_USD?: string;
  DEFAULT_MAX_TOTAL_TOKENS?: string;
  DB: D1Database;
  OPENAI_API_KEY?: string;
  DEV_MODE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const defaultMaxCostUsd = env.DEFAULT_MAX_COST_USD
      ? parseFloat(env.DEFAULT_MAX_COST_USD)
      : 10;
    const defaultMaxTotalTokens = env.DEFAULT_MAX_TOTAL_TOKENS
      ? parseInt(env.DEFAULT_MAX_TOTAL_TOKENS, 10)
      : 0;

    const pricingStore = createD1PricingStore(env.DB);
    const slackSettingsStore = createD1SlackSettingsStore(env.DB);
    const sentimentLabelStore = createD1SentimentLabelStore(env.DB);

    const tokenist = createTokenist({
      jwtSecret: env.JWT_SECRET,
      openaiApiKey: env.OPENAI_API_KEY,
      devMode: env.DEV_MODE === 'true',
      db: env.DEV_MODE === 'true' ? env.DB : undefined,
      defaultMaxCostUsd,
      defaultMaxTotalTokens,
      usageStore: createD1UsageStore(env.DB, {
        defaultMaxCostUsd,
        defaultMaxTotalTokens,
        pricingStore,
      }),
      blocklist: createD1Blocklist(env.DB),
      userStore: createD1UserStore(env.DB),
      apiKeyStore: createD1ApiKeyStore(env.DB),
      requestLogStore: createD1RequestLogStore(env.DB),
      pricingStore,
      slackSettingsStore,
      sentimentLabelStore,
    });

    return tokenist.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await handleSlackReports(env.DB);
    const requestLogStore = createD1RequestLogStore(env.DB);
    const sentimentLabelStore = createD1SentimentLabelStore(env.DB);
    await handleSentimentAnalysis(requestLogStore, sentimentLabelStore, env.OPENAI_API_KEY ?? '');
  },
};
