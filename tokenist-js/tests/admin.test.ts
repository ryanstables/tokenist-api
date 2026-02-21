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
    it("GETs /admin/users", async () => {
      const client = makeClient();
      const users = [{ endUserId: "u1", usage: {}, threshold: {}, blocked: false }];
      const spy = mockFetch({ body: users });

      const result = await client.admin.listUsers();

      expectFetchCall(spy, `${BASE_URL}/admin/users`);
      expect(result).toEqual(users);
    });
  });

  describe("getUserUsage()", () => {
    it("GETs /admin/users/:userId/usage", async () => {
      const client = makeClient();
      const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001, lastUpdated: "2024-01-01" };
      const spy = mockFetch({ body: usage });

      const result = await client.admin.getUserUsage("user-abc");

      expectFetchCall(spy, `${BASE_URL}/admin/users/user-abc/usage`);
      expect(result.totalTokens).toBe(30);
    });

    it("URL-encodes the userId", async () => {
      const client = makeClient();
      mockFetch({ body: {} });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({}),
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
    it("GETs /admin/blocked", async () => {
      const client = makeClient();
      const blocked = [{ endUserId: "u1", reason: "spam", blockedAt: "2024-01-01" }];
      const spy = mockFetch({ body: blocked });

      const result = await client.admin.listBlocked();

      expectFetchCall(spy, `${BASE_URL}/admin/blocked`);
      expect(result).toEqual(blocked);
    });
  });

  // ─── Orgs ─────────────────────────────────────────────────────────────────

  describe("getOrgSummary()", () => {
    it("GETs /admin/orgs/:orgId/summary without period", async () => {
      const client = makeClient();
      const summary = { orgId: "org1", period: "monthly", totalTokens: 1000, totalCostUsd: 0.5, userCount: 3 };
      const spy = mockFetch({ body: summary });

      const result = await client.admin.getOrgSummary("org1");

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/admin/orgs/org1/summary`);
      expect(result.orgId).toBe("org1");
    });

    it("appends the period query parameter when provided", async () => {
      const client = makeClient();
      mockFetch({ body: {} });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({}),
      } as unknown as Response);

      await client.admin.getOrgSummary("org1", { period: "daily" });

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toContain("period=daily");
    });
  });

  describe("listOrgUsers()", () => {
    it("GETs /admin/orgs/:orgId/users", async () => {
      const client = makeClient();
      const users = [{ endUserId: "u1", usage: {} }];
      const spy = mockFetch({ body: users });

      const result = await client.admin.listOrgUsers("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/users`);
      expect(result).toEqual(users);
    });
  });

  describe("listOrgBlocked()", () => {
    it("GETs /admin/orgs/:orgId/blocked", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: [] });

      await client.admin.listOrgBlocked("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/blocked`);
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
    it("GETs /admin/orgs/:orgId/logs/:logId", async () => {
      const client = makeClient();
      const log = { id: "log1", endUserId: "u1", conversationId: "c1", model: "gpt-4o", status: "success", createdAt: "2024-01-01" };
      const spy = mockFetch({ body: log });

      const result = await client.admin.getOrgLog("org1", "log1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/logs/log1`);
      expect(result.id).toBe("log1");
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
      const policies = [{ id: "p1", orgId: "org1", name: "Default", createdAt: "2024-01-01", updatedAt: "2024-01-01" }];
      const spy = mockFetch({ body: policies });

      const result = await client.admin.listPolicies("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies`);
      expect(result).toEqual(policies);
    });
  });

  describe("createPolicy()", () => {
    it("POSTs to /admin/orgs/:orgId/policies", async () => {
      const client = makeClient();
      const created = { id: "p2", orgId: "org1", name: "Strict", createdAt: "2024-01-01", updatedAt: "2024-01-01" };
      const spy = mockFetch({ body: created });

      const result = await client.admin.createPolicy("org1", { name: "Strict" });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/policies`, {
        method: "POST",
        bodyContaining: { name: "Strict" },
      });
      expect(result.id).toBe("p2");
    });
  });

  describe("updatePolicy()", () => {
    it("PUTs to /admin/orgs/:orgId/policies/:policyId", async () => {
      const client = makeClient();
      const updated = { id: "p1", orgId: "org1", name: "Updated", createdAt: "2024-01-01", updatedAt: "2024-01-02" };
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
    it("GETs /admin/orgs/:orgId/rules", async () => {
      const client = makeClient();
      const rules = [{ id: "r1", orgId: "org1", subjectType: "user", restrictionType: "cost_limit", value: 5, enabled: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" }];
      const spy = mockFetch({ body: rules });

      const result = await client.admin.listRules("org1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules`);
      expect(result).toEqual(rules);
    });

    it("passes filter query params", async () => {
      const client = makeClient();
      mockFetch({ body: [] });
      const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve([]),
      } as unknown as Response);

      await client.admin.listRules("org1", { subjectType: "user", enabled: true });

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toContain("subjectType=user");
      expect(url).toContain("enabled=true");
    });
  });

  describe("createRule()", () => {
    it("POSTs to /admin/orgs/:orgId/rules", async () => {
      const client = makeClient();
      const created = { id: "r1", orgId: "org1", subjectType: "user", restrictionType: "cost_limit", value: 5, enabled: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
      const spy = mockFetch({ body: created });

      await client.admin.createRule("org1", {
        subjectType: "user",
        restrictionType: "cost_limit",
        value: 5,
      });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules`, {
        method: "POST",
        bodyContaining: { subjectType: "user", restrictionType: "cost_limit" },
      });
    });
  });

  describe("getRule()", () => {
    it("GETs /admin/orgs/:orgId/rules/:ruleId", async () => {
      const client = makeClient();
      const rule = { id: "r1", orgId: "org1", subjectType: "global", restrictionType: "token_limit", value: 1000, enabled: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
      const spy = mockFetch({ body: rule });

      const result = await client.admin.getRule("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1`);
      expect(result.id).toBe("r1");
    });
  });

  describe("updateRule()", () => {
    it("PUTs to /admin/orgs/:orgId/rules/:ruleId", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: {} });

      await client.admin.updateRule("org1", "r1", { value: 10 });

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1`, {
        method: "PUT",
        bodyContaining: { value: 10 },
      });
    });
  });

  describe("toggleRule()", () => {
    it("PATCHes /admin/orgs/:orgId/rules/:ruleId/toggle", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: { enabled: false } });

      await client.admin.toggleRule("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/toggle`, { method: "PATCH" });
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
    it("GETs /admin/orgs/:orgId/rules/:ruleId/history", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: [] });

      await client.admin.getRuleHistory("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/history`);
    });
  });

  describe("getRuleTriggers()", () => {
    it("GETs /admin/orgs/:orgId/rules/:ruleId/triggers", async () => {
      const client = makeClient();
      const spy = mockFetch({ body: [] });

      await client.admin.getRuleTriggers("org1", "r1");

      expectFetchCall(spy, `${BASE_URL}/admin/orgs/org1/rules/r1/triggers`);
    });
  });
});
