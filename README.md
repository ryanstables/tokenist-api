# tokenist-core

A Cloudflare Workers proxy for the OpenAI Realtime API with per-user token and cost tracking, usage guardrails, and admin APIs.

## Features

- **WebSocket Proxy**: Transparently proxies WebSocket connections to OpenAI's Realtime API
- **Token Tracking**: Per-user token counting using tiktoken (with fallback to OpenAI's usage data)
- **Cost Calculation**: Real-time cost tracking based on model pricing
- **Usage Guardrails**: Enforce per-user cost and token limits
- **User Blocking**: Block/unblock users with optional expiration
- **Admin API**: REST endpoints for user management and usage monitoring
- **Authentication**: JWT-based auth with password hashing (PBKDF2)
- **API Keys**: Generate and manage API keys for SDK integrations
- **Pluggable Storage**: Interface-based storage for easy backend customization

## Project Structure

```
src/
├── admin/              # Admin API routes and middleware
│   ├── middleware.ts   # JWT and API key authentication middleware
│   └── routes.ts       # Admin REST endpoints
├── auth/               # Authentication utilities
│   ├── jwt.ts          # JWT generation and verification (jose)
│   └── password.ts     # Password hashing (PBKDF2 via Web Crypto)
├── config.ts           # Configuration interface
├── guardrails/         # Usage limits and identity extraction
│   ├── identity.ts     # Extract user identity from headers
│   └── policy.ts       # Threshold checking logic
├── index.ts            # Main library export (createTokenist)
├── logger.ts           # Structured JSON logging
├── proxy/              # WebSocket proxy implementation
│   ├── handler.ts      # WebSocket upgrade handler
│   ├── relay.ts        # Bidirectional message relay with usage tracking
│   └── upstream.ts     # OpenAI upstream connection
├── storage/            # Storage interfaces and implementations
│   ├── interfaces.ts   # Abstract storage interfaces
│   ├── memory.ts       # In-memory implementations (for dev/testing)
│   └── period.ts       # Usage period utilities (daily/monthly)
├── types/              # TypeScript type definitions
│   ├── events.ts       # OpenAI Realtime API event types
│   └── user.ts         # User, usage, and threshold types
├── usage/              # Token counting and cost calculation
│   ├── estimator.ts    # Token estimation using tiktoken
│   └── pricing.ts      # Model pricing configuration
└── worker.ts           # Cloudflare Worker entry point
```

## Installation

```bash
npm install
```

## Configuration

### Environment Variables

Create a `.dev.vars` file for local development:

```env
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key
DEFAULT_MAX_COST_USD=10
DEFAULT_MAX_TOTAL_TOKENS=0
```

For production, set these as Wrangler secrets:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put JWT_SECRET
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `openaiApiKey` | string | Yes | - | OpenAI API key |
| `jwtSecret` | string | Yes | - | Secret for JWT signing |
| `defaultMaxCostUsd` | number | No | `10` | Default cost limit per user (USD) |
| `defaultMaxTotalTokens` | number | No | `0` (unlimited) | Default token limit per user |
| `jwtExpiresIn` | string | No | `'7d'` | JWT expiration time |
| `logLevel` | string | No | `'info'` | Log level (trace/debug/info/warn/error) |

## Usage

### As a Cloudflare Worker

The included `worker.ts` provides a ready-to-deploy Worker:

```bash
# Development
npm run dev

# Deploy
wrangler deploy
```

### As a Library

You can use tokenist-core as a library in your own Worker:

```typescript
import { createTokenist } from 'tokenist-core';
import {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
} from 'tokenist-core';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const tokenist = createTokenist({
      openaiApiKey: env.OPENAI_API_KEY,
      jwtSecret: env.JWT_SECRET,
      defaultMaxCostUsd: 10,
      defaultMaxTotalTokens: 100000,
      usageStore: createInMemoryUsageStore({ defaultMaxCostUsd: 10 }),
      blocklist: createInMemoryBlocklist(),
      userStore: createInMemoryUserStore(),
      apiKeyStore: createInMemoryApiKeyStore(),
    });

    return tokenist.fetch(request);
  },
};
```

### Connecting to the Realtime API

Clients connect via WebSocket with user identity headers:

```typescript
const ws = new WebSocket('wss://your-worker.workers.dev/v1/realtime?model=gpt-4o-realtime-preview', {
  headers: {
    'x-user-id': 'user-123',
    'x-org-id': 'org-456',  // optional
    // Optionally pass your own API key:
    // 'Authorization': 'Bearer sk-...'
  }
});
```

## API Reference

### WebSocket Endpoint

#### `GET /v1/realtime`

Upgrade to WebSocket connection for OpenAI Realtime API.

**Headers:**
- `x-user-id` (required): User identifier for tracking
- `x-org-id` (optional): Organization identifier
- `Authorization` (optional): `Bearer <api-key>` - uses server key if not provided

**Query Parameters:**
- `model` (optional): Model name (default: `gpt-4o-realtime-preview`)

### Admin Endpoints

#### `GET /health`
Health check endpoint.

#### `GET /admin/users`
List all users with their usage and threshold data.

#### `GET /admin/users/:userId/usage`
Get usage details for a specific user.

**Response:**
```json
{
  "userId": "user-123",
  "usage": {
    "inputTokens": 1500,
    "outputTokens": 3200,
    "totalTokens": 4700,
    "costUsd": 0.42,
    "lastUpdated": "2025-02-09T10:30:00.000Z"
  },
  "threshold": {
    "maxCostUsd": 10,
    "maxTotalTokens": 100000
  },
  "blocked": false,
  "blockEntry": null
}
```

#### `POST /admin/users/:userId/block`
Block a user from making requests.

**Body:**
```json
{
  "reason": "Exceeded fair usage",
  "expiresAt": "2025-02-10T00:00:00.000Z"
}
```

#### `POST /admin/users/:userId/unblock`
Remove a user from the blocklist.

#### `POST /admin/users/:userId/threshold`
Set custom usage thresholds for a user.

**Body:**
```json
{
  "maxCostUsd": 25,
  "maxTotalTokens": 500000
}
```

#### `GET /admin/blocked`
List all currently blocked users.

### Auth Endpoints

#### `POST /auth/register`
Register a new user.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "John Doe",
  "orgId": "org-123"
}
```

#### `POST /auth/login`
Authenticate and receive a JWT.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "user": {
    "userId": "uuid",
    "email": "user@example.com",
    "displayName": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### `GET /auth/me`
Get current authenticated user (requires JWT).

#### `GET /auth/api-keys`
List API keys for authenticated user.

#### `POST /auth/api-keys`
Create a new API key.

**Body:**
```json
{
  "name": "Production Key"
}
```

#### `DELETE /auth/api-keys/:keyId`
Delete an API key.

### SDK Endpoints

For server-side integrations that need to check/record usage:

#### `POST /sdk/check`
Check if a user is allowed to make a request.

**Headers:**
- `Authorization`: `Bearer ug_...` (API key)

**Body:**
```json
{
  "userId": "user-123",
  "model": "gpt-4o-realtime-preview",
  "requestType": "realtime"
}
```

#### `POST /sdk/record`
Record usage after a request completes.

**Body:**
```json
{
  "userId": "user-123",
  "model": "gpt-4o-realtime-preview",
  "requestType": "realtime",
  "inputTokens": 500,
  "outputTokens": 1200,
  "latencyMs": 2300,
  "success": true
}
```

## Storage Interfaces

The module uses pluggable storage interfaces. Implement these for your preferred backend:

### UsageStore

```typescript
interface UsageStore {
  getUsage(userId: string, periodKey?: string): Promise<UserUsage | undefined>;
  updateUsage(userId: string, model: string, inputTokens: number, outputTokens: number, periodKey?: string): Promise<UserUsage>;
  getThreshold(userId: string): Promise<UserThreshold>;
  setThreshold(userId: string, threshold: UserThreshold): Promise<void>;
  getAllUsers(): Promise<Map<string, UserUsage>>;
}
```

### Blocklist

```typescript
interface Blocklist {
  isBlocked(userId: string): Promise<boolean>;
  getBlockEntry(userId: string): Promise<BlockEntry | undefined>;
  block(userId: string, reason?: string, expiresAt?: Date): Promise<void>;
  unblock(userId: string): Promise<boolean>;
  getAll(): Promise<BlockEntry[]>;
}
```

### UserStore

```typescript
interface UserStore {
  findByUserId(userId: string): Promise<StoredUserRecord | undefined>;
  findByEmail(email: string): Promise<StoredUserRecord | undefined>;
  create(user: StoredUserRecord): Promise<StoredUserRecord>;
  update(userId: string, fields: Partial<StoredUserRecord>): Promise<StoredUserRecord | undefined>;
}
```

### ApiKeyStore

```typescript
interface ApiKeyStore {
  create(userId: string, name: string): Promise<{ key: StoredApiKey; plainKey: string }>;
  listByUserId(userId: string): Promise<StoredApiKey[]>;
  delete(userId: string, keyId: string): Promise<boolean>;
  findUserIdByKeyHash(keyHash: string): Promise<string | undefined>;
}
```

### Recommended Backends

For production on Cloudflare Workers:

- **Cloudflare D1**: SQL database, good for complex queries
- **Cloudflare KV**: Key-value store, good for simple lookups
- **Cloudflare Durable Objects**: Strongly consistent, ideal for real-time state

## Supported Models

Pricing is configured for OpenAI Realtime models:

| Model | Input (per 1K) | Output (per 1K) |
|-------|----------------|-----------------|
| `gpt-4o-realtime-preview` | $0.06 | $0.24 |
| `gpt-4o-realtime-preview-2024-10-01` | $0.06 | $0.24 |
| `gpt-4o-realtime-preview-2024-12-17` | $0.06 | $0.24 |
| `gpt-4o-mini-realtime-preview` | $0.01 | $0.04 |
| `gpt-4o-mini-realtime-preview-2024-12-17` | $0.01 | $0.04 |

## Development

```bash
# Install dependencies
npm install

# Run locally with wrangler
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Build
npm run build
```

## License

MIT
