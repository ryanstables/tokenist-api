import { TokenistClient } from "../src/client";
import { mockFetch, expectFetchCall } from "./helpers";

const BASE_URL = "https://tokenist.example.com";
const API_KEY = "ug_test_key";

function makeClient() {
  return new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

describe("admin resource", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  describe("listUsers()", () => {
    it("GETs /admin/users and returns { users } wrapper", async () => {
      const client = makeClient();
      // API returns { users: [...] } — NOT a flat array
      const apiResponse = {
        users: [{ userId: "u1", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001, lastUpdated: "2024-01-01" }, threshold: {}, blocked: false }],
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.listUsers();

      expectFetchCall(spy, `${BASE_URL}/admin/users`);
      // Returns a wrapper object with `users` array
      expect(result.users).toHaveLength(1);
      // Field is `userId`, not `endUserId`
      expect(result.users[0].userId).toBe("u1");
    });
  });

  describe("getUserUsage()", () => {
    it("GETs /admin/users/:userId/usage and returns full user detail", async () => {
      const client = makeClient();
      // API returns { userId, usage, threshold, blocked, blockEntry } — NOT just EndUserUsage
      const apiResponse = {
        userId: "user-abc",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001, lastUpdated: "2024-01-01" },
        threshold: { maxCostUsd: 5 },
        blocked: false,
        blockEntry: null,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.getUserUsage("user-abc");

      expectFetchCall(spy, `${BASE_URL}/admin/users/user-abc/usage`);
      // Returns the full detail object, not just EndUserUsage
      expect(result.userId).toBe("user-abc");
      expect(result.usage.totalTokens).toBe(30);
      expect(result.blocked).toBe(false);
    });

    it("URL-encodes the userId", async () => {
      const client = makeClient();
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ userId: "u", usage: {}, threshold: {}, blocked: false, blockEntry: null }),
      } as unknown as Response);

      await client.admin.getUserUsage("user/with/slashes");

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/admin/users/user%2Fwith%2Fslashes/usage`);
    });
  });

  describe("blockUser()", () => {
    it("POSTs to /admin/users/:userId/block", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.blockUser("u1", { reason: "abuse" });

      expectFetchCall(spy, `${BASE_URL}/admin/users/u1/block`, {
        method: "POST",
        bodyContaining: { reason: "abuse" },
      });
    });

    it("sends an empty body when no options provided", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.blockUser("u1");

      const [, options] = spy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({});
    });
  });

  describe("unblockUser()", () => {
    it("POSTs to /admin/users/:userId/unblock", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.unblockUser("u1");

      expectFetchCall(spy, `${BASE_URL}/admin/users/u1/unblock`, { method: "POST" });
    });
  });

  describe("setUserThreshold()", () => {
    it("POSTs to /admin/users/:userId/threshold with threshold data", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.setUserThreshold("u1", { maxCostUsd: 5, maxTotalTokens: 100000 });

      expectFetchCall(spy, `${BASE_URL}/admin/users/u1/threshold`, {
        method: "POST",
        bodyContaining: { maxCostUsd: 5, maxTotalTokens: 100000 },
      });
    });
  });

  describe("listBlocked()", () => {
    it("GETs /admin/blocked and returns { blocked } wrapper", async () => {
      const client = makeClient();
      // API returns { blocked: [...] } — NOT a flat array
      const apiResponse = {
        blocked: [{ userId: "u1", reason: "spam", blockedAt: "2024-01-01", expiresAt: null }],
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.listBlocked();

      expectFetchCall(spy, `${BASE_URL}/admin/blocked`);
      // Returns wrapper with `blocked` array; entries use `userId` not `endUserId`
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0].userId).toBe("u1");
    });
  });

  // ─── Orgs ─────────────────────────────────────────────────────────────────

  describe("getOrgSummary()", () => {
    it("GETs /admin/orgs/:orgId/summary and returns API-shaped response", async () => {
      const client = makeClient();
      // API returns { orgId, period, periodLabel, totalCost, userCount, users, featureFilter }
      // NOT { totalCostUsd, totalInputTokens, totalOutputTokens, totalTokens }
      const apiResponse = {
        orgId: "org1",
        period: "monthly",
        periodLabel: "Feb 2026",
        totalCost: 0.5,
        userCount: 3,
        users: [{ userId: "u1", displayName: "Alice", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.003, lastUpdated: "2024-01-01" } }],
        featureFilter: null,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.getOrgSummary("org1");

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/admin/orgs/org1/summary`);
      expect(result.orgId).toBe("org1");
      // API returns `totalCost`, not `totalCostUsd`
      expect(result.totalCost).toBe(0.5);
      // API returns `periodLabel`
      expect(result.periodLabel).toBe("Feb 2026");
      // API returns a `users` array with per-user breakdowns
      expect(result.users).toHaveLength(1);
      expect(result.users[0].userId).toBe("u1");
      expect(result.featureFilter).toBeNull();
    });

    it("appends the period query parameter when provided", async () => {
      const client = makeClient();
      mockFetch({ body: {} });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ orgId: "org1", period: "daily", periodLabel: "2026-02-21", totalCost: 0, userCount: 0, users: [], featureFilter: null }),
      } as unknown as Response);

      await client.admin.getOrgSummary("org1", { period: "daily" });

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toContain("period=daily");
    });
  });

  describe("listOrgUsers()", () => {
    it("GETs /admin/orgs/:orgId/users and returns { id, displayName, email } entries", async () => {
      const client = makeClient();
      // API returns [{ id, displayName, email }] — NOT { endUserId, name, usage }
      const apiResponse = [{ id: "u1", displayName: "Alice", email: "alice@example.com" }];
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.listOrgUsers("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/users`);
      // Field is `id`, not `endUserId`; `displayName`, not `name`
      expect(result[0].id).toBe("u1");
      expect(result[0].displayName).toBe("Alice");
      expect(result[0].email).toBe("alice@example.com");
    });
  });

  describe("listOrgBlocked()", () => {
    it("GETs /admin/orgs/:orgId/blocked and returns { blocked, count } wrapper", async () => {
      const client = makeClient();
      // API returns { blocked: [...], count: number } — NOT a flat array
      const apiResponse = {
        blocked: [{ userId: "u1", reason: "spam", blockedAt: "2024-01-01", expiresAt: null }],
        count: 1,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.listOrgBlocked("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/blocked`);
      expect(result.blocked).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.blocked[0].userId).toBe("u1");
    });
  });

  // ─── Logs ─────────────────────────────────────────────────────────────────

  describe("listOrgLogs()", () => {
    it("GETs /admin/orgs/:orgId/logs", async () => {
      const client = makeClient();
      const response = { logs: [], total: 0 };
      const spy = mockFetch({ body: response });

      const result = await client.admin.listOrgLogs("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/logs`);
      expect(result.total).toBe(0);
    });

    it("passes limit and offset as query parameters", async () => {
      const client = makeClient();
      mockFetch({ body: { logs: [], total: 0 } });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ logs: [], total: 0 }),
      } as unknown as Response);

      await client.admin.listOrgLogs("org1", { limit: 10, offset: 20 });

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });
  });

  describe("getOrgLog()", () => {
    it("GETs /admin/orgs/:orgId/logs/:logId with userId (not endUserId)", async () => {
      const client = makeClient();
      // API serializes `endUserId → userId`, `endUserEmail → userEmail`, `endUserName → userName`
      // Token details are nested in `tokenDetails` object
      const apiResponse = {
        id: "log1",
        userId: "u1",
        orgId: "org1",
        userEmail: "alice@example.com",
        userName: "Alice",
        conversationId: "c1",
        model: "gpt-4o",
        feature: null,
        requestBody: "{}",
        responseBody: "{}",
        status: "success",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        tokenDetails: {
          cachedInputTokens: null,
          textInputTokens: null,
          audioInputTokens: null,
          imageInputTokens: null,
          textOutputTokens: null,
          audioOutputTokens: null,
          reasoningTokens: null,
        },
        costUsd: 0.001,
        latencyMs: 500,
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.getOrgLog("org1", "log1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/logs/log1`);
      expect(result.id).toBe("log1");
      // API returns `userId`, not `endUserId`
      expect(result.userId).toBe("u1");
      // API returns `userEmail`, not `endUserEmail`
      expect(result.userEmail).toBe("alice@example.com");
      // Token details are nested
      expect(result.tokenDetails).toBeDefined();
    });
  });

  describe("listUserLogs()", () => {
    it("GETs /admin/orgs/:orgId/users/:userId/logs", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: { logs: [], total: 0 } });

      await client.admin.listUserLogs("org1", "u1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/users/u1/logs`);
    });
  });

  // ─── Policies ─────────────────────────────────────────────────────────────

  describe("listPolicies()", () => {
    it("GETs /admin/orgs/:orgId/policies", async () => {
      const client = makeClient();
      const policies = [{ id: "p1", name: "Default", description: "Default policy", source: "custom", createdAt: "2024-01-01" }];
      const spy = mockFetch({ body: policies });

      const result = await client.admin.listPolicies("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies`);
      expect(result).toEqual(policies);
    });
  });

  describe("createPolicy()", () => {
    it("POSTs to /admin/orgs/:orgId/policies with name and required description", async () => {
      const client = makeClient();
      const created = { id: "p2", name: "Strict", description: "Strict limits", source: "custom", createdAt: "2024-01-01" };
      const spy = mockFetch({ body: created });

      // description is required by the API (returns 400 if missing)
      const result = await client.admin.createPolicy("org1", { name: "Strict", description: "Strict limits" });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies`, {
        method: "POST",
        bodyContaining: { name: "Strict", description: "Strict limits" },
      });
      expect(result.id).toBe("p2");
    });
  });

  describe("updatePolicy()", () => {
    it("PUTs to /admin/orgs/:orgId/policies/:policyId", async () => {
      const client = makeClient();
      const updated = { id: "p1", name: "Updated", description: "Updated desc", source: "custom", createdAt: "2024-01-01" };
      const spy = mockFetch({ body: updated });

      await client.admin.updatePolicy("org1", "p1", { name: "Updated" });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies/p1`, {
        method: "PUT",
        bodyContaining: { name: "Updated" },
      });
    });
  });

  describe("deletePolicy()", () => {
    it("DELETEs /admin/orgs/:orgId/policies/:policyId", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.deletePolicy("org1", "p1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies/p1`, { method: "DELETE" });
    });
  });

  // ─── Rules ────────────────────────────────────────────────────────────────

  describe("listRules()", () => {
    it("GETs /admin/orgs/:orgId/rules and returns { rules, total } wrapper", async () => {
      const client = makeClient();
      // API returns { rules: [...], total: number } — NOT a flat array
      // RuleRecord uses subject/trigger/restriction objects, not subjectType/restrictionType/value
      const apiResponse = {
        rules: [{
          id: "r1",
          name: "Block heavy users",
          enabled: true,
          subject: { type: "user", ids: ["u1"] },
          trigger: { type: "token_threshold", threshold: 1000 },
          restriction: { type: "block" },
          notifications: {},
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        }],
        total: 1,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.listRules("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules`);
      // Returns wrapper with `rules` array and `total`
      expect(result.rules).toHaveLength(1);
      expect(result.total).toBe(1);
      // Rule uses `subject` object, not flat `subjectType`
      expect(result.rules[0].subject.type).toBe("user");
      expect(result.rules[0].restriction.type).toBe("block");
    });

    it("passes filter query params", async () => {
      const client = makeClient();
      mockFetch({ body: { rules: [], total: 0 } });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ rules: [], total: 0 }),
      } as unknown as Response);

      // SubjectType is now 'user' | 'group' | 'feature' (API values)
      await client.admin.listRules("org1", { subjectType: "user", enabled: true });

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toContain("subjectType=user");
      expect(url).toContain("enabled=true");
    });
  });

  describe("createRule()", () => {
    it("POSTs to /admin/orgs/:orgId/rules with API-compatible shape", async () => {
      const client = makeClient();
      const created = {
        id: "r1",
        name: "Block heavy users",
        enabled: true,
        subject: { type: "user", ids: [] },
        trigger: { type: "token_threshold", threshold: 1000 },
        restriction: { type: "block" },
        notifications: {},
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      };
      const spy = mockFetch({ body: created });

      // API expects { name, subject, trigger, restriction, notifications }
      await client.admin.createRule("org1", {
        name: "Block heavy users",
        subject: { type: "user", ids: [] },
        trigger: { type: "token_threshold", threshold: 1000 },
        restriction: { type: "block" },
        notifications: {},
      });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules`, {
        method: "POST",
        bodyContaining: { name: "Block heavy users" },
      });
    });
  });

  describe("getRule()", () => {
    it("GETs /admin/orgs/:orgId/rules/:ruleId with RuleRecord shape", async () => {
      const client = makeClient();
      const rule = {
        id: "r1",
        name: "Rate limit org",
        enabled: true,
        subject: { type: "user", ids: [] },
        trigger: { type: "cost_threshold", threshold: 5 },
        restriction: { type: "rate_limit" },
        notifications: { webhookUrl: "https://example.com/hook" },
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      };
      const spy = mockFetch({ body: rule });

      const result = await client.admin.getRule("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1`);
      expect(result.id).toBe("r1");
      expect(result.subject.type).toBe("user");
    });
  });

  describe("updateRule()", () => {
    it("PUTs to /admin/orgs/:orgId/rules/:ruleId", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.updateRule("org1", "r1", { enabled: false });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1`, {
        method: "PUT",
        bodyContaining: { enabled: false },
      });
    });
  });

  describe("toggleRule()", () => {
    it("PATCHes /admin/orgs/:orgId/rules/:ruleId/toggle with { enabled } body", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: { id: "r1", enabled: false } });

      // API requires { enabled: boolean } in body — missing it causes a 400
      await client.admin.toggleRule("org1", "r1", false);

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/toggle`, {
        method: "PATCH",
        bodyContaining: { enabled: false },
      });
    });

    it("can enable a rule", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: { id: "r1", enabled: true } });

      await client.admin.toggleRule("org1", "r1", true);

      const [, options] = spy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.enabled).toBe(true);
    });
  });

  describe("deleteRule()", () => {
    it("DELETEs /admin/orgs/:orgId/rules/:ruleId", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.deleteRule("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1`, { method: "DELETE" });
    });
  });

  describe("getRuleHistory()", () => {
    it("GETs history and returns { entries, total } wrapper", async () => {
      const client = makeClient();
      // API returns { entries: [...], total: number } — NOT a flat array
      // RuleHistoryRecord uses { action, changes, timestamp } — NOT { changedBy, previousValue, newValue, changedAt }
      const apiResponse = {
        entries: [{
          id: "h1",
          ruleId: "r1",
          action: "created",
          timestamp: "2024-01-01T00:00:00.000Z",
        }],
        total: 1,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.getRuleHistory("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/history`);
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      // API uses `action` and `timestamp`, not `changedBy`/`changedAt`
      expect(result.entries[0].action).toBe("created");
      expect(result.entries[0].timestamp).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("getRuleTriggers()", () => {
    it("GETs triggers and returns { events, total } wrapper", async () => {
      const client = makeClient();
      // API returns { events: [...], total: number } — NOT a flat RuleTrigger[] array
      // RuleTriggerRecord uses { subjectId, subjectType, triggerContext, actionTaken, timestamp }
      const apiResponse = {
        events: [{
          id: "t1",
          ruleId: "r1",
          subjectId: "u1",
          subjectType: "user",
          triggerContext: "token_limit_exceeded",
          actionTaken: "blocked",
          timestamp: "2024-01-01T00:00:00.000Z",
        }],
        total: 1,
      };
      const spy = mockFetch({ body: apiResponse });

      const result = await client.admin.getRuleTriggers("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/triggers`);
      // Returns `events` wrapper, not a flat array; field is `events` not `triggers`
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.events[0].subjectId).toBe("u1");
      expect(result.events[0].timestamp).toBe("2024-01-01T00:00:00.000Z");
    });
  });
});
