import { TokenistClient } from "../src/client";
import { mockFetch, expectFetchCall } from "./helpers";

const BASE_URL = "https://tokenist.example.com";
const API_KEY = "ug_test_key";

function makeClient() {
  return new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

describe("auth resource", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe("register()", () => {
    const payload = { email: "alice@example.com", password: "secret", displayName: "Alice" };
    const serverResponse = {
      user: { userId: "u1", email: "alice@example.com", displayName: "Alice" },
      token: "jwt.abc.123",
    };

    it("POSTs to /auth/register and returns the auth response", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: serverResponse });

      const result = await client.auth.register(payload);

      expectFetchCall(spy, `${BASE_URL}/auth/register`, {
        method: "POST",
        bodyContaining: payload,
      });
      expect(result.user.email).toBe("alice@example.com");
      expect(result.token).toBe("jwt.abc.123");
    });

    it("stores the returned JWT for subsequent requests", async () => {
      const client = makeClient();
      mockFetch({ body: serverResponse });
      await client.auth.register(payload);
      expect(client.getAuthToken()).toBe("jwt.abc.123");
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe("login()", () => {
    const credentials = { email: "bob@example.com", password: "pass" };
    const serverResponse = {
      user: { userId: "u2", email: "bob@example.com" },
      token: "jwt.xyz.789",
    };

    it("POSTs to /auth/login and returns the auth response", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: serverResponse });

      const result = await client.auth.login(credentials);

      expectFetchCall(spy, `${BASE_URL}/auth/login`, {
        method: "POST",
        bodyContaining: credentials,
      });
      expect(result.token).toBe("jwt.xyz.789");
    });

    it("stores the returned JWT", async () => {
      const client = makeClient();
      mockFetch({ body: serverResponse });
      await client.auth.login(credentials);
      expect(client.getAuthToken()).toBe("jwt.xyz.789");
    });
  });

  // ─── me ───────────────────────────────────────────────────────────────────

  describe("me()", () => {
    it("GETs /auth/me using the stored JWT", async () => {
      const client = makeClient();
      client.setAuthToken("my.jwt");
      const spy = mockFetch({ body: { userId: "u1", email: "a@b.com" } });

      const result = await client.auth.me();

      expectFetchCall(spy, `${BASE_URL}/auth/me`, {
        authHeader: "Bearer my.jwt",
      });
      expect(result.userId).toBe("u1");
    });
  });

  // ─── listApiKeys ──────────────────────────────────────────────────────────

  describe("listApiKeys()", () => {
    it("GETs /auth/api-keys and returns an array of keys", async () => {
      const client = makeClient();
      client.setAuthToken("jwt");
      const keys = [{ id: "k1", userId: "u1", name: "My Key", createdAt: "2024-01-01" }];
      const spy = mockFetch({ body: keys });

      const result = await client.auth.listApiKeys();

      expectFetchCall(spy, `${BASE_URL}/auth/api-keys`);
      expect(result).toEqual(keys);
    });
  });

  // ─── createApiKey ─────────────────────────────────────────────────────────

  describe("createApiKey()", () => {
    it("POSTs to /auth/api-keys with the key name", async () => {
      const client = makeClient();
      client.setAuthToken("jwt");
      const created = {
        id: "k2",
        userId: "u1",
        name: "New Key",
        apiKey: "ug_plaintext",
        createdAt: "2024-01-01",
      };
      const spy = mockFetch({ body: created });

      const result = await client.auth.createApiKey({ name: "New Key" });

      expectFetchCall(spy, `${BASE_URL}/auth/api-keys`, {
        method: "POST",
        bodyContaining: { name: "New Key" },
      });
      expect(result.apiKey).toBe("ug_plaintext");
    });
  });

  // ─── deleteApiKey ─────────────────────────────────────────────────────────

  describe("deleteApiKey()", () => {
    it("DELETEs /auth/api-keys/:keyId", async () => {
      const client = makeClient();
      client.setAuthToken("jwt");
      const spy = mockFetch({ body: {} });

      await client.auth.deleteApiKey("k1");

      expectFetchCall(spy, `${BASE_URL}/auth/api-keys/k1`, { method: "DELETE" });
    });

    it("URL-encodes the keyId", async () => {
      const client = makeClient();
      client.setAuthToken("jwt");
      const spy = mockFetch({ body: {} });

      await client.auth.deleteApiKey("key with spaces");

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/auth/api-keys/key%20with%20spaces`);
    });
  });

  // ─── getUsage ─────────────────────────────────────────────────────────────

  describe("getUsage()", () => {
    it("GETs /auth/usage and returns usage data", async () => {
      const client = makeClient();
      client.setAuthToken("jwt");
      const usageData = {
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.01, lastUpdated: "2024-01-01" },
        threshold: { maxCostUsd: 10 },
      };
      const spy = mockFetch({ body: usageData });

      const result = await client.auth.getUsage();

      expectFetchCall(spy, `${BASE_URL}/auth/usage`);
      expect(result.usage.totalTokens).toBe(150);
      expect(result.threshold.maxCostUsd).toBe(10);
    });
  });
});
