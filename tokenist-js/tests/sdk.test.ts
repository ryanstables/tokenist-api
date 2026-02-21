import { TokenistClient } from "../src/client";
import { mockFetch, expectFetchCall } from "./helpers";
import type { SdkRecordRequest } from "../src/types";

const BASE_URL = "https://tokenist.example.com";
const API_KEY = "ug_test_key";

function makeClient() {
  return new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

describe("sdk resource", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── check ────────────────────────────────────────────────────────────────

  describe("check()", () => {
    it("POSTs to /sdk/check with the request payload", async () => {
      const client = makeClient();
      // API returns { tokens, costUsd } — NOT the EndUserUsage shape
      const checkResponse = {
        allowed: true,
        usage: { tokens: 500, costUsd: 0.05 },
        remaining: { tokens: 49500, costUsd: 9.95 },
      };
      const spy = mockFetch({ body: checkResponse });

      const result = await client.sdk.check({
        userId: "user-123",
        model: "gpt-4o-realtime-preview",
        requestType: "realtime",
        estimatedTokens: 100,
        feature: "voice-assistant",
      });

      expectFetchCall(spy, `${BASE_URL}/sdk/check`, {
        method: "POST",
        bodyContaining: {
          userId: "user-123",
          model: "gpt-4o-realtime-preview",
          requestType: "realtime",
          estimatedTokens: 100,
          feature: "voice-assistant",
        },
        authHeader: `Bearer ${API_KEY}`,
      });
      expect(result.allowed).toBe(true);
      // API returns `tokens` (not `totalTokens`)
      expect(result.usage.tokens).toBe(500);
      expect(result.usage.costUsd).toBe(0.05);
      expect(result.remaining?.tokens).toBe(49500);
    });

    it("returns allowed:false with a reason when user is blocked", async () => {
      const client = makeClient();
      mockFetch({
        body: {
          allowed: false,
          reason: "User is blocked: spam",
          usage: { tokens: 0, costUsd: 0 },
        },
      });

      const result = await client.sdk.check({
        userId: "blocked-user",
        model: "gpt-4o",
        requestType: "chat",
      });

      expect(result.allowed).toBe(false);
      // `reason` field is present on denied responses
      expect(result.reason).toBe("User is blocked: spam");
    });

    it("works without optional fields", async () => {
      const client = makeClient();
      const spy = mockFetch({
        body: {
          allowed: true,
          usage: { tokens: 0, costUsd: 0 },
          remaining: { tokens: 50000, costUsd: 10 },
        },
      });

      await client.sdk.check({
        userId: "u1",
        model: "gpt-4o",
        requestType: "chat",
      });

      expectFetchCall(spy, `${BASE_URL}/sdk/check`, { method: "POST" });
    });
  });

  // ─── record ───────────────────────────────────────────────────────────────

  describe("record()", () => {
    it("POSTs to /sdk/record with usage data including latencyMs", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.sdk.record({
        userId: "user-123",
        model: "gpt-4o-realtime-preview",
        requestType: "realtime",
        inputTokens: 500,
        outputTokens: 1200,
        latencyMs: 2300,
        success: true,
        feature: "voice-assistant",
      });

      expectFetchCall(spy, `${BASE_URL}/sdk/record`, {
        method: "POST",
        bodyContaining: {
          userId: "user-123",
          inputTokens: 500,
          outputTokens: 1200,
          latencyMs: 2300,
          success: true,
        },
      });
    });

    it("records a failed request", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.sdk.record({
        userId: "u1",
        model: "gpt-4o",
        requestType: "chat",
        inputTokens: 100,
        outputTokens: 0,
        latencyMs: 0,
        success: false,
      });

      const [, options] = spy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.success).toBe(false);
    });

    it("latencyMs is required — omitting it is a compile-time error", () => {
      // The API schema has latencyMs: z.number().nonnegative() (no .optional()).
      // @ts-expect-error latencyMs must be required on SdkRecordRequest
      const req: SdkRecordRequest = {
        userId: "u1",
        model: "gpt-4o",
        requestType: "chat",
        inputTokens: 100,
        outputTokens: 0,
        success: false,
      };
      expect(req).toBeDefined();
    });
  });

  // ─── log ──────────────────────────────────────────────────────────────────

  describe("log()", () => {
    it("POSTs to /sdk/log with the full log payload", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.sdk.log({
        model: "gpt-4o-realtime-preview",
        request: { type: "session.update", session: {} },
        response: { type: "response.done", response: {} },
        latencyMs: 2300,
        status: "success",
        conversationId: "conv-123",
        userId: "user_alice",
        userEmail: "alice@example.com",
        userName: "Alice Smith",
        feature: "voice-assistant",
      });

      expectFetchCall(spy, `${BASE_URL}/sdk/log`, {
        method: "POST",
        bodyContaining: {
          model: "gpt-4o-realtime-preview",
          conversationId: "conv-123",
          userId: "user_alice",
          status: "success",
        },
      });
    });

    it("works with minimal fields (no optional params)", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.sdk.log({
        model: "gpt-4o",
        request: { messages: [{ role: "user", content: "Hello" }] },
      });

      const [url, options] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/sdk/log`);
      expect(options.method).toBe("POST");
    });

    it("uses the API key for authentication", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.sdk.log({ model: "gpt-4o", request: {} });

      const [, options] = spy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    });
  });
});
