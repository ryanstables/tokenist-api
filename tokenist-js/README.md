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

```ts
import { TokenistClient } from "tokenist-js";

const client = new TokenistClient({
  apiKey:  "ug_your_api_key",
  baseUrl: "https://tokenist.example.com",
});
```

Pass your API key (a `ug_...` key issued by the Tokenist API) to the constructor. The key is sent as a `Bearer` token on every request.

---

## Authentication

Tokenist uses two authentication schemes:

| Scheme | Used for |
|--------|----------|
| **API key** (`ug_...`) | Admin endpoints, SDK endpoints — pass to the constructor |
| **JWT** | User account endpoints (`auth.me`, `auth.listApiKeys`, etc.) — stored automatically after login |

### Logging in

```ts
const { user, token } = await client.auth.login({
  email: "alice@example.com",
  password: "s3cur3!",
});
// The JWT is now stored internally — subsequent JWT-protected calls just work.
console.log(user.userId);
```

### Registering a new account

```ts
const { user, token } = await client.auth.register({
  email: "bob@example.com",
  password: "s3cur3!",
  displayName: "Bob",
  orgId: "my-org",           // optional
});
```

### Using an existing JWT

If you already hold a JWT (e.g. loaded from a database), set it manually:

```ts
client.setAuthToken("eyJhbGci...");
client.getAuthToken();   // read it back
client.clearAuthToken(); // clear it
```

---

## API reference

### `client.auth`

Methods that operate on user accounts.

#### `auth.register(data)`

Register a new user. Stores the returned JWT automatically.

```ts
const result = await client.auth.register({
  email: "alice@example.com",
  password: "secret",
  displayName: "Alice",   // optional
  orgId: "acme-corp",     // optional
});
// result: { user: UserProfile, token: string }
```

#### `auth.login(data)`

Log in with email and password. Stores the returned JWT automatically.

```ts
const result = await client.auth.login({
  email: "alice@example.com",
  password: "secret",
});
// result: { user: UserProfile, token: string }
```

#### `auth.me()` *(requires JWT)*

Return the currently authenticated user's profile.

```ts
const profile = await client.auth.me();
// { userId, email, displayName?, orgId? }
```

#### `auth.listApiKeys()` *(requires JWT)*

List all API keys for the authenticated user.

```ts
const keys = await client.auth.listApiKeys();
// ApiKey[]  — note: the plaintext key is NOT returned here
```

#### `auth.createApiKey(data)` *(requires JWT)*

Create a new API key. The plaintext key is only returned in this response.

```ts
const key = await client.auth.createApiKey({ name: "Production key" });
console.log(key.apiKey); // "ug_..." — store this securely!
```

#### `auth.deleteApiKey(keyId)` *(requires JWT)*

Delete an API key by its ID.

```ts
await client.auth.deleteApiKey("key-id-123");
```

#### `auth.getUsage()` *(requires JWT)*

Return usage statistics and threshold configuration for the authenticated user.

```ts
const { usage, threshold } = await client.auth.getUsage();
console.log(usage.totalTokens, threshold.maxCostUsd);
```

---

### `client.admin`

Methods for managing end users, organisations, request logs, policies, and rules. All use API key authentication.

#### User management

```ts
// List all end users
const users = await client.admin.listUsers();

// Get usage for a specific user
const usage = await client.admin.getUserUsage("user-123");

// Block a user
await client.admin.blockUser("user-123", {
  reason: "Exceeded quota",
  expiresAt: "2025-03-01T00:00:00Z",  // optional – omit for a permanent block
});

// Unblock a user
await client.admin.unblockUser("user-123");

// Set custom thresholds for a user
await client.admin.setUserThreshold("user-123", {
  maxCostUsd: 5.00,
  maxTotalTokens: 100_000,
});

// List all currently blocked users
const blocked = await client.admin.listBlocked();
```

#### Organisation analytics

```ts
// Aggregated usage summary
const summary = await client.admin.getOrgSummary("my-org", {
  period: "monthly",   // "daily" | "monthly" | "rolling_24h"  (default: monthly)
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
// List
const policies = await client.admin.listPolicies("my-org");

// Create
const policy = await client.admin.createPolicy("my-org", { name: "Strict limits" });

// Update
await client.admin.updatePolicy("my-org", policy.id, { name: "Very strict limits" });

// Delete
await client.admin.deletePolicy("my-org", policy.id);
```

#### Rules

```ts
// List (with optional filters)
const rules = await client.admin.listRules("my-org", {
  subjectType: "user",         // "user" | "org" | "global"
  restrictionType: "cost_limit",
  enabled: true,
});

// Create
const rule = await client.admin.createRule("my-org", {
  subjectType: "user",
  subjectId: "user-123",
  restrictionType: "cost_limit",
  value: 5.00,
  enabled: true,
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

### `client.sdk`

Server-side SDK methods for integrating Tokenist into your own backend, before and after you make calls to OpenAI.

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
npm test            # run the test suite
npm run test:watch  # watch mode
npm run test:coverage # with coverage report
npm run build       # compile to dist/
npm run lint        # type-check without emitting
```

Tests use Jest with a mocked global `fetch` — no real HTTP requests are made.
