/**
 * Sentiment analysis integration tests.
 *
 * These tests require a real OPENAI_API_KEY and are automatically SKIPPED
 * when the key is not present in the environment. This prevents accidental
 * cost during regular CI runs.
 *
 * To run sentiment tests explicitly:
 *   OPENAI_API_KEY=sk-... npm run test:integration -- --testPathPattern=sentiment
 *
 * How it works:
 *   1. Log a chat completion with an obvious sentiment message
 *   2. POST /admin/sentiment/analyze-pending to trigger classification
 *   3. Poll the log entry until analysisLabels are populated
 */

import { bootstrapTestOrg, BASE_URL, TestOrg } from "./helpers/api-client";
import { uid } from "./helpers/fixtures";
import { poll } from "./helpers/poll";

const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Skip the entire suite when OpenAI key is absent
const describeIfOpenAI = OPENAI_KEY ? describe : describe.skip;

let org: TestOrg;

beforeAll(async () => {
  if (!OPENAI_KEY) return;
  org = await bootstrapTestOrg("sentiment");
});

describeIfOpenAI("Sentiment Analysis – label classification", () => {
  it("classifies a clearly positive message", async () => {
    const userId = uid("sentiment-positive");
    const convId = `conv_sentiment_pos_${Date.now()}`;

    await org.client.log({
      model: "gpt-4o-mini",
      request: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content:
              "This is absolutely amazing! You are incredibly helpful and I love using this tool!",
          },
        ],
      },
      response: {
        choices: [
          {
            message: { role: "assistant", content: "Thank you so much, I'm glad I could help!" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 25, completion_tokens: 12, total_tokens: 37 },
      },
      latencyMs: 150,
      status: "success",
      conversationId: convId,
      userId,
    });

    // Trigger sentiment analysis for all pending logs
    const analyzeRes = await fetch(`${BASE_URL}/admin/sentiment/analyze-pending`, {
      method: "POST",
    });
    expect(analyzeRes.status).toBe(200);
    const analyzeBody = (await analyzeRes.json()) as { processed: number };
    expect(typeof analyzeBody.processed).toBe("number");

    // Poll for the log entry to have analysisLabels populated
    // The analyze-pending endpoint runs synchronously, so this usually succeeds on the first poll.
    type LogWithLabels = { conversationId: string; analysisLabels?: string[] | null };

    const entry = await poll(
      async () => {
        const list = await org.client.admin.listOrgLogs(org.orgId, { limit: 50 });
        const found = list.logs.find((l) => l.conversationId === convId) as
          | LogWithLabels
          | undefined;
        // Return non-null when labels array is present (even if empty after analysis)
        if (found && found.analysisLabels !== undefined) return found;
        return null;
      },
      { timeoutMs: 20000, intervalMs: 1000 }
    );

    // The exact labels depend on the org's configured sentiment labels;
    // we assert only that the analysis ran and labels is an array.
    expect(Array.isArray(entry.analysisLabels)).toBe(true);
  });

  it("returns processed count for analyze-pending endpoint", async () => {
    // Log a message to ensure there's something to analyse
    await org.client.log({
      model: "gpt-4o-mini",
      request: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "This product is frustrating and broken." }],
      },
      response: {
        choices: [
          {
            message: { role: "assistant", content: "I'm sorry to hear that." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
      },
      latencyMs: 200,
      status: "success",
      userId: uid("sentiment-negative"),
    });

    const res = await fetch(`${BASE_URL}/admin/sentiment/analyze-pending`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(typeof body.processed).toBe("number");
    expect(body.processed).toBeGreaterThanOrEqual(0);
  });
});

// This test runs even without OpenAI key — it just verifies the endpoint exists
describe("Sentiment Analysis – endpoint availability", () => {
  it("analyze-pending endpoint responds even without OPENAI_API_KEY env var", async () => {
    // We don't call this on a fresh org (org may be undefined when OPENAI_KEY is absent),
    // so we just hit the global endpoint directly.
    const res = await fetch(`${BASE_URL}/admin/sentiment/analyze-pending`, {
      method: "POST",
    });
    // Should be 200 (processed: 0) or 500 if OPENAI_API_KEY is missing server-side
    expect([200, 500]).toContain(res.status);
  });
});
