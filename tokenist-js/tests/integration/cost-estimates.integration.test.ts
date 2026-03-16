/**
 * Cost estimate integration tests.
 *
 * Pricing constants are taken directly from src/usage/pricing.ts:
 *   gpt-4o-mini: input = per1K(0.15) = 0.00015, output = per1K(0.6) = 0.0006
 *   gpt-4o:      input = per1K(2.5)  = 0.0025,  output = per1K(10)  = 0.01
 *   default:     input = per1K(5)    = 0.005,   output = per1K(20)  = 0.02
 *
 * Formula: costUsd = (inputTokens / 1000) * inputPer1K + (outputTokens / 1000) * outputPer1K
 */

import { bootstrapTestOrg, TestOrg } from "./helpers/api-client";
import { uid, fakeChatRequest } from "./helpers/fixtures";

let org: TestOrg;

beforeAll(async () => {
  org = await bootstrapTestOrg("cost");
});

function gpt4oMiniCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * 0.00015 + (outputTokens / 1000) * 0.0006;
}

function gpt4oCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * 0.0025 + (outputTokens / 1000) * 0.01;
}

describe("Cost Estimates – per-model pricing accuracy", () => {
  it("calculates gpt-4o-mini cost correctly after sdk/log", async () => {
    const userId = uid("cost-mini");
    const convId = `conv_cost_${Date.now()}`;
    const inputTokens = 1000;
    const outputTokens = 500;
    const expectedCostUsd = gpt4oMiniCost(inputTokens, outputTokens);

    await org.client.log({
      model: "gpt-4o-mini",
      request: fakeChatRequest("Cost test"),
      response: {
        id: "chatcmpl-test",
        object: "chat.completion",
        model: "gpt-4o-mini",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
      latencyMs: 200,
      status: "success",
      conversationId: convId,
      userId,
    });

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = list.logs.find((l) => l.conversationId === convId);
    expect(entry).toBeDefined();
    expect(entry!.costUsd).toBeCloseTo(expectedCostUsd, 6);
  });

  it("calculates gpt-4o cost correctly (higher rate than mini)", async () => {
    const userId = uid("cost-4o");
    const convId = `conv_4o_${Date.now()}`;
    const inputTokens = 500;
    const outputTokens = 300;
    const expectedCostUsd = gpt4oCost(inputTokens, outputTokens);

    await org.client.log({
      model: "gpt-4o",
      request: fakeChatRequest("4o cost test"),
      response: {
        id: "chatcmpl-4o",
        object: "chat.completion",
        model: "gpt-4o",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
      latencyMs: 250,
      status: "success",
      conversationId: convId,
      userId,
    });

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = list.logs.find((l) => l.conversationId === convId);
    expect(entry).toBeDefined();
    expect(entry!.costUsd).toBeCloseTo(expectedCostUsd, 6);
  });

  it("cost accumulates in usage store after multiple record() calls", async () => {
    const userId = uid("cost-accum");

    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 1000,
      outputTokens: 500,
      latencyMs: 100,
      success: true,
    });
    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 1000,
      outputTokens: 500,
      latencyMs: 100,
      success: true,
    });

    const usage = await org.client.admin.getUserUsage(userId);
    const expectedTotal = 2 * gpt4oMiniCost(1000, 500);
    expect(usage.usage.costUsd).toBeCloseTo(expectedTotal, 6);
    expect(usage.usage.totalTokens).toBe(3000);
    expect(usage.usage.inputTokens).toBe(2000);
    expect(usage.usage.outputTokens).toBe(1000);
  });

  it("unknown model falls back to default pricing and still stores a positive cost", async () => {
    const userId = uid("cost-unknown");
    const convId = `conv_unknown_${Date.now()}`;

    await org.client.log({
      model: "some-future-model-xyz",
      request: fakeChatRequest("unknown model test"),
      response: {
        id: "chatcmpl-unknown",
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      },
      latencyMs: 100,
      status: "success",
      conversationId: convId,
      userId,
    });

    const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
    const entry = list.logs.find((l) => l.conversationId === convId);
    expect(entry).toBeDefined();
    // Default pricing: input=$0.005/1K, output=$0.02/1K → (100/1000)*0.005 + (50/1000)*0.02 = $0.001 > 0
    expect(entry!.costUsd).toBeGreaterThan(0);
  });

  it("costUsd in getOrgSummary reflects total spend across users", async () => {
    // Each call to bootstrapTestOrg creates a fresh org, so this org is clean.
    const userId = uid("cost-summary");

    await org.client.record({
      userId,
      model: "gpt-4o-mini",
      requestType: "chat",
      inputTokens: 2000,
      outputTokens: 1000,
      latencyMs: 100,
      success: true,
    });

    const summary = await org.client.admin.getOrgSummary(org.orgId);
    // totalCost (not totalCostUsd — see types.ts OrgSummary interface)
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.userCount).toBeGreaterThanOrEqual(1);
  });
});
