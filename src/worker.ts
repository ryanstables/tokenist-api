import { createTokenist } from './index';
import {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
} from './storage/memory';

interface Env {
  OPENAI_API_KEY: string;
  JWT_SECRET: string;
  DEFAULT_MAX_COST_USD?: string;
  DEFAULT_MAX_TOTAL_TOKENS?: string;
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
      usageStore: createInMemoryUsageStore({
        defaultMaxCostUsd,
        defaultMaxTotalTokens,
      }),
      blocklist: createInMemoryBlocklist(),
      userStore: createInMemoryUserStore(),
      apiKeyStore: createInMemoryApiKeyStore(),
    });

    return tokenist.fetch(request);
  },
};
