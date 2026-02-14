import { createTokenist } from './index';
import {
  createD1UsageStore,
  createD1Blocklist,
  createD1UserStore,
  createD1ApiKeyStore,
  createD1RequestLogStore,
} from './storage/d1';

interface Env {
  OPENAI_API_KEY: string;
  JWT_SECRET: string;
  DEFAULT_MAX_COST_USD?: string;
  DEFAULT_MAX_TOTAL_TOKENS?: string;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const defaultMaxCostUsd = env.DEFAULT_MAX_COST_USD
      ? parseFloat(env.DEFAULT_MAX_COST_USD)
      : 10;
    const defaultMaxTotalTokens = env.DEFAULT_MAX_TOTAL_TOKENS
      ? parseInt(env.DEFAULT_MAX_TOTAL_TOKENS, 10)
      : 0;

    const tokenist = createTokenist({
      openaiApiKey: env.OPENAI_API_KEY,
      jwtSecret: env.JWT_SECRET,
      defaultMaxCostUsd,
      defaultMaxTotalTokens,
      usageStore: createD1UsageStore(env.DB, {
        defaultMaxCostUsd,
        defaultMaxTotalTokens,
      }),
      blocklist: createD1Blocklist(env.DB),
      userStore: createD1UserStore(env.DB),
      apiKeyStore: createD1ApiKeyStore(env.DB),
      requestLogStore: createD1RequestLogStore(env.DB),
    });

    return tokenist.fetch(request);
  },
};
