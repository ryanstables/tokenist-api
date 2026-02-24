# Remove WebSocket Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete the OpenAI Realtime API WebSocket proxy and all supporting code, leaving only the REST API and Node SDK.

**Architecture:** Pure deletion — remove four source files and trim three files of proxy-only imports, routes, config fields, and re-exports. No new code is introduced. The event type definitions in `src/types/events.ts` are kept because `sdk/log` parses Realtime API usage payloads.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, Vitest

---

### Task 1: Delete proxy source files and their test

**Files:**
- Delete: `src/proxy/handler.ts`
- Delete: `src/proxy/relay.ts`
- Delete: `src/proxy/relay.test.ts`
- Delete: `src/proxy/upstream.ts`
- Delete: `src/guardrails/identity.ts`

**Step 1: Delete the files**

```bash
rm src/proxy/handler.ts src/proxy/relay.ts src/proxy/relay.test.ts src/proxy/upstream.ts
rm src/guardrails/identity.ts
```

**Step 2: Verify the files are gone**

```bash
ls src/proxy/
ls src/guardrails/
```

Expected: `src/proxy/` is now empty (or missing). `src/guardrails/` contains only `policy.ts`.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete WebSocket proxy files and relay tests"
```

---

### Task 2: Remove `openaiApiKey` from config and worker

**Files:**
- Modify: `src/config.ts`
- Modify: `src/worker.ts`

**Step 1: Edit `src/config.ts`**

Remove the `openaiApiKey: string;` line. The file should look like:

```typescript
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
```

**Step 2: Edit `src/worker.ts`**

Remove `OPENAI_API_KEY` from the `Env` interface and remove `openaiApiKey: env.OPENAI_API_KEY` from the `createTokenist()` call. The file should look like:

```typescript
import { createTokenist } from './index';
import {
  createD1UsageStore,
  createD1Blocklist,
  createD1UserStore,
  createD1ApiKeyStore,
  createD1RequestLogStore,
  createD1PricingStore,
} from './storage/d1';

interface Env {
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

    const pricingStore = createD1PricingStore(env.DB);

    const tokenist = createTokenist({
      jwtSecret: env.JWT_SECRET,
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
    });

    return tokenist.fetch(request);
  },
};
```

**Step 3: Commit**

```bash
git add src/config.ts src/worker.ts
git commit -m "chore: remove openaiApiKey from config and worker env"
```

---

### Task 3: Remove proxy route and re-exports from `src/index.ts`

**Files:**
- Modify: `src/index.ts`

**Step 1: Remove the proxy import and `/v1/realtime` route**

Delete these lines:

```typescript
import { handleWebSocketUpgrade } from './proxy/handler';
```

And the entire route block:

```typescript
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
      pricingStore,
    });
  });
```

**Step 2: Remove proxy re-exports**

Delete these re-export lines:

```typescript
export type { RelayContext, RelayHooks } from './proxy/relay';
export type { ExtractIdentityResult, IdentityResult, IdentityError } from './guardrails/identity';
export { extractIdentity } from './guardrails/identity';
```

Keep all other exports, including `src/types/events.ts` re-exports.

**Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

**Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass. `relay.test.ts` is gone so there is nothing to fail. `sdk.test.ts` and all other suites should be green.

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "chore: remove /v1/realtime route and proxy re-exports from index"
```

---

### Task 4: Verify tokenist-js is unaffected

**Files:**
- Read: `tokenist-js/src/**` (no edits expected)

**Step 1: Typecheck tokenist-js**

```bash
cd tokenist-js && npm run lint
```

Expected: zero TypeScript errors. tokenist-js only imports from its own `src/` directory and calls REST endpoints — it has no dependency on the deleted proxy types.

**Step 2: Run tokenist-js tests**

```bash
npm test
```

Expected: all tests pass.

**Step 3: Return to root**

```bash
cd ..
```

No changes to tokenist-js are needed. If errors appear, inspect the import causing the failure before making any edits.
