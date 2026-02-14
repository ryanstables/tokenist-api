/**
 * Example: Log an OpenAI Chat Completion to Tokenist
 *
 * Wraps a standard openai.chat.completions.create() call,
 * measures latency, and posts the full request/response to
 * POST /sdk/log so it appears in the Tokenist dashboard.
 *
 * Usage:
 *   TOKENIST_API_KEY=ug_... OPENAI_API_KEY=sk-... npx tsx examples/log-chat-completion.ts
 */

import OpenAI from "openai";

const TOKENIST_URL =
  process.env.TOKENIST_URL ?? "http://localhost:8081";
const TOKENIST_API_KEY = process.env.TOKENIST_API_KEY!; // ug_...
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function logToTokenist(
  model: string,
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  latencyMs: number,
  status: string = "success"
) {
  const res = await fetch(`${TOKENIST_URL}/sdk/log`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKENIST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, request, response, latencyMs, status }),
  });

  if (!res.ok) {
    console.error("Tokenist log failed:", await res.text());
  }
  return res.json();
}

async function main() {
  const request = {
    model: "gpt-4o",
    messages: [
      { role: "system" as const, content: "You are a helpful assistant." },
      { role: "user" as const, content: "What is the capital of France?" },
    ],
  };

  const start = performance.now();
  let status = "success";
  let response: Record<string, unknown>;

  try {
    const completion = await openai.chat.completions.create(request);
    response = completion as unknown as Record<string, unknown>;
    console.log("Response:", completion.choices[0].message.content);
  } catch (err: unknown) {
    status = "error";
    response = { error: err instanceof Error ? err.message : String(err) };
  }

  const latencyMs = performance.now() - start;

  const result = await logToTokenist(
    request.model,
    request,
    response!,
    latencyMs,
    status
  );
  console.log("Logged to Tokenist:", result);
}

main();
