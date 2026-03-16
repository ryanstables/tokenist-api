import { bootstrapTestOrg, TestOrg } from "./helpers/api-client";
import { uid } from "./helpers/fixtures";

let org: TestOrg;

beforeAll(async () => {
  org = await bootstrapTestOrg("rate-limits");
});

describe("Rate Limits – threshold enforcement via check/record", () => {
  it("allows a fresh user with no limits set", async () => {
    const userId = uid("fresh");
    const result = await org.client.check({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks a user after their token threshold is exceeded", async () => {
    const userId = uid("token-limit");

    // Set a tight limit of 100 tokens
    await org.client.admin.setUserThreshold(userId, { maxTotalTokens: 100 });

    // Simulate two small requests totalling 110 tokens
    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 40,
      outputTokens: 20,
      latencyMs: 100,
      success: true,
    });
    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 30,
      outputTokens: 20,
      latencyMs: 80,
      success: true,
    });

    // Now at 110 tokens — should be blocked
    const check = await org.client.check({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBeDefined();
  });

  it("blocks a user after their cost threshold is exceeded", async () => {
    const userId = uid("cost-limit");

    // Set a $0.001 USD limit (very low)
    await org.client.admin.setUserThreshold(userId, { maxCostUsd: 0.001 });

    // gpt-4o: input=$0.0025/1K, output=$0.01/1K
    // 500 input + 200 output = (0.5 * 0.0025) + (0.2 * 0.01) = $0.00125 + $0.002 = $0.00325 > $0.001
    await org.client.record({
      userId,
      model: "gpt-4o",
      requestType: "chat",
      inputTokens: 500,
      outputTokens: 200,
      latencyMs: 150,
      success: true,
    });

    const check = await org.client.check({
      userId,
      model: "gpt-4o",
      requestType: "chat",
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBeDefined();
  });

  it("explicitly blocked user is denied immediately regardless of usage", async () => {
    const userId = uid("blocked");

    await org.client.admin.blockUser(userId, { reason: "integration-test-block" });

    const check = await org.client.check({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBeDefined();
  });

  it("unblocked user is allowed again", async () => {
    const userId = uid("unblock");

    await org.client.admin.blockUser(userId, { reason: "temporary" });
    await org.client.admin.unblockUser(userId);

    const check = await org.client.check({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
    });
    expect(check.allowed).toBe(true);
  });

  it("check returns usage and remaining tokens when threshold is set", async () => {
    const userId = uid("remaining");

    await org.client.admin.setUserThreshold(userId, {
      maxTotalTokens: 10000,
      maxCostUsd: 5.0,
    });
    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 50,
      success: true,
    });

    const check = await org.client.check({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
    });
    expect(check.allowed).toBe(true);
    expect(check.usage.tokens).toBe(150);
    expect(check.remaining?.tokens).toBeLessThan(10000);
  });

  it("getUserUsage reflects accumulated record() calls", async () => {
    const userId = uid("usage-sum");

    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 200,
      outputTokens: 100,
      latencyMs: 80,
      success: true,
    });
    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 300,
      outputTokens: 150,
      latencyMs: 90,
      success: true,
    });

    const details = await org.client.admin.getUserUsage(userId);
    expect(details.usage.totalTokens).toBe(750);
    expect(details.usage.costUsd).toBeGreaterThan(0);
  });

  it("listBlocked includes a blocked user", async () => {
    const userId = uid("list-blocked");

    await org.client.admin.blockUser(userId, { reason: "list-test" });

    const blocked = await org.client.admin.listBlocked();
    expect(blocked.blocked.some((b) => b.userId === userId)).toBe(true);
  });
});
