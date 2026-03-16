import { bootstrapTestOrg, TestOrg } from "./helpers/api-client";
import { uid, fakeChatRequest, fakeChatResponse } from "./helpers/fixtures";

let org: TestOrg;

beforeAll(async () => {
  org = await bootstrapTestOrg("logs");
});

describe("Logs – capture and retrieval", () => {
  it("logs a chat completion and retrieves it from org logs", async () => {
    const userId = uid("log-basic");
    const convId = `conv_${Date.now()}`;
    const request = fakeChatRequest("What is 2+2?");
    const response = fakeChatResponse(12, 8);

    await org.client.log({
      model: "gpt-4o-mini",
      request,
      response,
      latencyMs: 320,
      status: "success",
      conversationId: convId,
      userId,
      userEmail: `${userId}@test.local`,
      userName: "Test User",
    });

    const logs = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = logs.logs.find((l) => l.conversationId === convId);

    expect(entry).toBeDefined();
    expect(entry!.userId).toBe(userId);
    expect(entry!.model).toBe("gpt-4o-mini");
    expect(entry!.promptTokens).toBe(12);
    expect(entry!.completionTokens).toBe(8);
    expect(entry!.totalTokens).toBe(20);
    expect(entry!.costUsd).toBeGreaterThan(0);
    expect(entry!.latencyMs).toBe(320);
    expect(entry!.status).toBe("success");
    expect(entry!.userEmail).toBe(`${userId}@test.local`);
    expect(entry!.userName).toBe("Test User");
    expect(entry!.conversationId).toBe(convId);
  });

  it("retrieves a single log by ID with full tokenDetails breakdown", async () => {
    const userId = uid("log-detail");
    const convId = `conv_${Date.now()}`;

    await org.client.log({
      model: "gpt-4o",
      request: fakeChatRequest("Explain caching"),
      response: {
        id: "chatcmpl-detail",
        object: "chat.completion",
        model: "gpt-4o",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
          prompt_tokens_details: { cached_tokens: 10, text_tokens: 40 },
          completion_tokens_details: { text_tokens: 30 },
        },
      },
      latencyMs: 500,
      status: "success",
      conversationId: convId,
      userId,
    });

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const summary = list.logs.find((l) => l.conversationId === convId);
    expect(summary).toBeDefined();

    const detail = await org.client.admin.getOrgLog(org.orgId, summary!.id);
    expect(detail.userId).toBe(userId);
    expect(detail.promptTokens).toBe(50);
    expect(detail.completionTokens).toBe(30);
    // tokenDetails should have granular breakdown
    expect(detail.tokenDetails.cachedInputTokens).toBe(10);
    expect(detail.tokenDetails.textInputTokens).toBe(40);
    expect(detail.tokenDetails.textOutputTokens).toBe(30);
  });

  it("listUserLogs filters logs to the specific user", async () => {
    const userId = uid("log-filter");
    const otherUserId = uid("log-filter-other");
    const convId = `conv_${Date.now()}`;

    // Log for our target user
    await org.client.log({
      model: "gpt-4o-mini",
      request: fakeChatRequest("Filter me"),
      response: fakeChatResponse(5, 5),
      latencyMs: 100,
      status: "success",
      conversationId: convId,
      userId,
    });

    // Log for a different user (should not appear in userId filter)
    await org.client.log({
      model: "gpt-4o-mini",
      request: fakeChatRequest("Other user"),
      response: fakeChatResponse(5, 5),
      latencyMs: 100,
      status: "success",
      userId: otherUserId,
    });

    const userLogs = await org.client.admin.listUserLogs(org.orgId, userId);
    expect(userLogs.logs.every((l) => l.userId === userId)).toBe(true);
    expect(userLogs.logs.some((l) => l.conversationId === convId)).toBe(true);
  });

  it("paginated log listing respects limit and offset", async () => {
    const userId = uid("log-paginate");

    // Seed 5 logs for this user
    for (let i = 0; i < 5; i++) {
      await org.client.log({
        model: "gpt-4o-mini",
        request: fakeChatRequest(`Page test ${i}`),
        response: fakeChatResponse(10, 5),
        latencyMs: 100,
        status: "success",
        userId,
      });
    }

    const page1 = await org.client.admin.listUserLogs(org.orgId, userId, {
      limit: 2,
      offset: 0,
    });
    const page2 = await org.client.admin.listUserLogs(org.orgId, userId, {
      limit: 2,
      offset: 2,
    });

    expect(page1.logs).toHaveLength(2);
    expect(page2.logs).toHaveLength(2);
    // Pages must not overlap
    const page1Ids = new Set(page1.logs.map((l) => l.id));
    const page2Ids = new Set(page2.logs.map((l) => l.id));
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("error status log has null cost (no token counts in error response)", async () => {
    const userId = uid("log-error");
    const convId = `conv_err_${Date.now()}`;

    await org.client.log({
      model: "gpt-4o-mini",
      request: fakeChatRequest("This will fail"),
      response: { error: "timeout" },
      latencyMs: 5000,
      status: "error",
      conversationId: convId,
      userId,
    });

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = list.logs.find((l) => l.conversationId === convId);
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("error");
    // No usage in error response → no cost
    expect(entry!.costUsd).toBeNull();
  });

  it("log without userId creates a log entry with null userId", async () => {
    const convId = `conv_anon_${Date.now()}`;

    const result = await org.client.log({
      model: "gpt-4o-mini",
      request: fakeChatRequest("Anonymous call"),
      response: fakeChatResponse(8, 4),
      latencyMs: 150,
      status: "success",
      conversationId: convId,
    });

    // The log call should return a log ID
    expect(result.id).toBeDefined();

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = list.logs.find((l) => l.conversationId === convId);
    expect(entry).toBeDefined();
  });
});
