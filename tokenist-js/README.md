# tokenist-js

Node.js client for the [Tokenist API](https://github.com/ryanstables/tokenist-api) — per-user token tracking, cost guardrails, and admin management for OpenAI integrations.

## Requirements

- Node.js 18 or later (uses the native `fetch` API)
- TypeScript 4.7+ (if using from TypeScript)

## Installation

```bash
npm install tokenist-js
```

## Quick start

Generate an API key from your Tokenist dashboard, then initialise the client:

```ts
import { TokenistClient } from "tokenist-js";

const client = new TokenistClient({
  apiKey:  "ug_your_api_key",
  baseUrl: "https://tokenist.example.com",
});
```

Every request is authenticated with your API key as a `Bearer` token.

---

## API reference

### `client.sdk`

Methods for integrating Tokenist checks into your own backend, around calls you make to OpenAI.

#### `sdk.check(data)`

Pre-flight check — call this *before* forwarding a request to OpenAI to verify the user is allowed.

```ts
const result = await client.sdk.check({
  userId:          "user-123",
  model:           "gpt-4o-realtime-preview",
  requestType:     "realtime",     // "realtime" | "chat" | "embeddings"
  estimatedTokens: 500,            // optional estimate
  feature:         "voice-chat",   // optional product/feature label
});

if (!result.allowed) {
  return res.status(429).json({ error: "Usage limit reached" });
}
// result.remaining.tokens, result.remaining.costUsd
```

#### `sdk.record(data)`

Record actual token usage *after* a request completes. Keeps Tokenist's usage totals accurate when you have real counts from the OpenAI response.

```ts
await client.sdk.record({
  userId:      "user-123",
  model:       "gpt-4o-realtime-preview",
  requestType: "realtime",
  inputTokens: 480,
  outputTokens: 1240,
  latencyMs:   2300,    // optional
  success:     true,
  feature:     "voice-chat",
});
```

#### `sdk.log(data)`

Log a full request/response pair for auditing and analytics.

```ts
await client.sdk.log({
  model:          "gpt-4o-realtime-preview",
  request:        { type: "session.update", session: { voice: "alloy" } },
  response:       { type: "response.done",  response: { ... } },
  latencyMs:      2300,
  status:         "success",
  conversationId: "conv-abc-123",
  userId:         "user-123",
  userEmail:      "alice@example.com",
  userName:       "Alice",
  feature:        "voice-chat",
});
```

---

### `client.admin`

Methods for managing end users, organisations, request logs, policies, and rules.

#### User management

```ts
// List all end users
const users = await client.admin.listUsers();

// Get usage for a specific user
const usage = await client.admin.getUserUsage("user-123");

// Block a user
await client.admin.blockUser("user-123", {
  reason:    "Exceeded quota",
  expiresAt: "2025-03-01T00:00:00Z",  // optional – omit for a permanent block
});

// Unblock a user
await client.admin.unblockUser("user-123");

// Set custom thresholds for a user
await client.admin.setUserThreshold("user-123", {
  maxCostUsd:      5.00,
  maxTotalTokens:  100_000,
});

// List all currently blocked users
const blocked = await client.admin.listBlocked();
```

#### Organisation analytics

```ts
// Aggregated usage summary
const summary = await client.admin.getOrgSummary("my-org", {
  period: "monthly",   // "daily" | "monthly" | "rolling_24h"
});

// List users in an org
const orgUsers = await client.admin.listOrgUsers("my-org");

// List blocked users in an org
const orgBlocked = await client.admin.listOrgBlocked("my-org");
```

#### Request logs

```ts
// Paginated log list for an org
const { logs, total } = await client.admin.listOrgLogs("my-org", {
  limit: 50,
  offset: 0,
});

// Single log entry
const log = await client.admin.getOrgLog("my-org", "log-id-456");

// Logs for a specific user within an org
const { logs: userLogs } = await client.admin.listUserLogs("my-org", "user-123", {
  limit: 20,
});
```

#### Policies

```ts
const policies = await client.admin.listPolicies("my-org");

const policy = await client.admin.createPolicy("my-org", { name: "Strict limits" });

await client.admin.updatePolicy("my-org", policy.id, { name: "Very strict limits" });

await client.admin.deletePolicy("my-org", policy.id);
```

#### Rules

```ts
// List (with optional filters)
const rules = await client.admin.listRules("my-org", {
  subjectType:     "user",         // "user" | "org" | "global"
  restrictionType: "cost_limit",
  enabled:         true,
});

// Create
const rule = await client.admin.createRule("my-org", {
  subjectType:     "user",
  subjectId:       "user-123",
  restrictionType: "cost_limit",
  value:           5.00,
  enabled:         true,
});

// Get, update, toggle, delete
const r = await client.admin.getRule("my-org", rule.id);
await client.admin.updateRule("my-org", rule.id, { value: 10.00 });
await client.admin.toggleRule("my-org", rule.id);   // flip enabled/disabled
await client.admin.deleteRule("my-org", rule.id);

// Audit trail
const history  = await client.admin.getRuleHistory("my-org", rule.id);
const triggers = await client.admin.getRuleTriggers("my-org", rule.id);
```

---

## Error handling

All API errors are thrown as `TokenistError`:

```ts
import { TokenistError } from "tokenist-js";

try {
  await client.admin.blockUser("unknown-user");
} catch (err) {
  if (err instanceof TokenistError) {
    console.error(err.status);   // HTTP status code, e.g. 404
    console.error(err.message);  // Error message from the API
    console.error(err.body);     // Raw response body
  }
}
```

---

## TypeScript

The package ships with full TypeScript types. All request/response shapes are exported:

```ts
import type {
  TokenistClientOptions,
  SdkCheckRequest,
  SdkCheckResponse,
  EndUserUsage,
  EndUserThreshold,
  RequestLog,
  Rule,
  // ... and more
} from "tokenist-js";
```

---

## Development

```bash
npm test              # run the test suite
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
npm run build         # compile to dist/
npm run lint          # type-check without emitting
```

Tests use Jest with a mocked global `fetch` — no real HTTP requests are made.
