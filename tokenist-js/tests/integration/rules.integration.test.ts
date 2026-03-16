import { bootstrapTestOrg, TestOrg } from "./helpers/api-client";

let org: TestOrg;

beforeAll(async () => {
  org = await bootstrapTestOrg("rules");
});

describe("Rules – CRUD lifecycle", () => {
  it("creates a block rule and reads it back individually", async () => {
    const rule = await org.client.admin.createRule(org.orgId, {
      name: "Block heavy users",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: { type: "token_limit", tokens: 10000, window: { count: 1, unit: "day" } },
      restriction: { type: "block" },
      notifications: {},
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe("Block heavy users");
    expect(rule.enabled).toBe(true);
    expect(rule.restriction.type).toBe("block");

    const fetched = await org.client.admin.getRule(org.orgId, rule.id);
    expect(fetched.id).toBe(rule.id);
    expect(fetched.trigger).toMatchObject({ type: "token_limit", tokens: 10000 });

    await org.client.admin.deleteRule(org.orgId, rule.id);
  });

  it("creates all four restriction types without error", async () => {
    const configs = [
      {
        name: "warning-rule",
        restriction: { type: "warning" as const },
      },
      {
        name: "rate-limit-rule",
        restriction: {
          type: "rate_limit" as const,
          maxRequests: 10,
          window: { count: 1, unit: "hour" as const },
        },
      },
      {
        name: "throttle-rule",
        restriction: { type: "throttle" as const, delayMs: 500 },
      },
      {
        name: "block-rule",
        restriction: { type: "block" as const },
      },
    ];

    const created: string[] = [];
    for (const { name, restriction } of configs) {
      const rule = await org.client.admin.createRule(org.orgId, {
        name,
        enabled: true,
        subject: { type: "user", ids: [] },
        trigger: {
          type: "cost_limit",
          costUsd: 5,
          window: { count: 1, unit: "month" as const },
        },
        restriction,
        notifications: {},
      });
      expect(rule.restriction.type).toBe(restriction.type);
      created.push(rule.id);
    }

    for (const id of created) {
      await org.client.admin.deleteRule(org.orgId, id);
    }
  });

  it("listRules returns created rules and respects restrictionType filter", async () => {
    const blockRule = await org.client.admin.createRule(org.orgId, {
      name: "block-filter-test",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: {
        type: "token_limit",
        tokens: 5000,
        window: { count: 1, unit: "hour" as const },
      },
      restriction: { type: "block" },
      notifications: {},
    });
    const warningRule = await org.client.admin.createRule(org.orgId, {
      name: "warning-filter-test",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: {
        type: "cost_limit",
        costUsd: 1,
        window: { count: 1, unit: "day" as const },
      },
      restriction: { type: "warning" },
      notifications: {},
    });

    const allRules = await org.client.admin.listRules(org.orgId);
    expect(allRules.rules.length).toBeGreaterThanOrEqual(2);

    const blockRules = await org.client.admin.listRules(org.orgId, {
      restrictionType: "block",
    });
    expect(blockRules.rules.every((r) => r.restriction.type === "block")).toBe(true);
    expect(blockRules.rules.map((r) => r.id)).toContain(blockRule.id);
    expect(blockRules.rules.map((r) => r.id)).not.toContain(warningRule.id);

    await org.client.admin.deleteRule(org.orgId, blockRule.id);
    await org.client.admin.deleteRule(org.orgId, warningRule.id);
  });

  it("updates a rule's name", async () => {
    const rule = await org.client.admin.createRule(org.orgId, {
      name: "original-name",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: {
        type: "token_limit",
        tokens: 1000,
        window: { count: 1, unit: "hour" as const },
      },
      restriction: { type: "warning" },
      notifications: {},
    });

    const updated = await org.client.admin.updateRule(org.orgId, rule.id, {
      name: "updated-name",
    });
    expect(updated.name).toBe("updated-name");

    await org.client.admin.deleteRule(org.orgId, rule.id);
  });

  it("toggling a rule updates enabled state and appends to history", async () => {
    const rule = await org.client.admin.createRule(org.orgId, {
      name: "toggle-test",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: {
        type: "token_limit",
        tokens: 1000,
        window: { count: 1, unit: "hour" as const },
      },
      restriction: { type: "block" },
      notifications: {},
    });

    const disabled = await org.client.admin.toggleRule(org.orgId, rule.id, false);
    expect(disabled.enabled).toBe(false);

    const reenabled = await org.client.admin.toggleRule(org.orgId, rule.id, true);
    expect(reenabled.enabled).toBe(true);

    const history = await org.client.admin.getRuleHistory(org.orgId, rule.id);
    const actions = history.entries.map((e) => e.action);
    expect(actions).toContain("created");
    expect(actions).toContain("disabled");
    expect(actions).toContain("enabled");
    // Each entry must have a timestamp
    for (const entry of history.entries) {
      expect(entry.timestamp).toBeDefined();
      expect(typeof entry.timestamp).toBe("string");
    }

    await org.client.admin.deleteRule(org.orgId, rule.id);
  });

  it("deleted rule no longer appears in listRules", async () => {
    const rule = await org.client.admin.createRule(org.orgId, {
      name: "delete-me",
      enabled: true,
      subject: { type: "user", ids: [] },
      trigger: {
        type: "token_limit",
        tokens: 500,
        window: { count: 1, unit: "hour" as const },
      },
      restriction: { type: "warning" },
      notifications: {},
    });

    await org.client.admin.deleteRule(org.orgId, rule.id);

    const list = await org.client.admin.listRules(org.orgId);
    expect(list.rules.map((r) => r.id)).not.toContain(rule.id);
  });
});
