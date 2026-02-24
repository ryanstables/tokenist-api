# Remove WebSocket Proxy — Design

Date: 2026-02-24

## Context

Tokenist is refocusing on REST API endpoints for logging and applying guardrails. The legacy WebSocket proxy (which let customers point their OpenAI client's `baseURL` at Tokenist to transparently intercept Realtime API traffic) is being removed. The SDK-based integration pattern (`/sdk/check`, `/sdk/record`, `/sdk/log`) is the supported path going forward.

## What Is Removed

### Files deleted
- `src/proxy/handler.ts` — WebSocket upgrade handler (identity check, blocklist/threshold gate, relay setup)
- `src/proxy/relay.ts` — bidirectional WebSocket relay with live token tracking
- `src/proxy/upstream.ts` — connects to `wss://api.openai.com/v1/realtime`
- `src/guardrails/identity.ts` — extracts end-user identity from `x-user-id`/`x-org-id` headers; only called by the proxy handler

### Changes to existing files
- `src/config.ts` — remove `openaiApiKey: string` from `TokenistConfig` (was only forwarded to OpenAI)
- `src/index.ts` — remove the `/v1/realtime` route, its import, and re-exports of `RelayContext`, `RelayHooks`, `ExtractIdentityResult`, `IdentityResult`, `IdentityError`, `extractIdentity`
- `src/worker.ts` — remove `OPENAI_API_KEY` from `Env` and from the `createTokenist()` call

## What Is Kept

- All REST routes: `/admin/*`, `/auth/*`, `/sdk/*`
- `src/types/events.ts` and its re-exports (used by `sdk/log` to parse Realtime API usage payloads)
- `src/guardrails/policy.ts` (threshold checking, used by SDK endpoints)
- All storage, pricing, estimator, auth, and logger modules
- `tokenist-js` Node SDK (calls REST endpoints only; unaffected)

## Verification

- `npm run typecheck` passes in `tokenist-core`
- `npm test` passes in `tokenist-core`
- `npm run lint` (typecheck) passes in `tokenist-js`
- `npm test` passes in `tokenist-js`
