/**
 * Example: Log a streaming Chat Completion to Tokenist
 *
 * Streaming responses don't include usage by default.
 * Pass `stream_options: { include_usage: true }` so the
 * final chunk contains token counts for Tokenist to store.
 *
 * Usage:
 *   TOKENIST_API_KEY=ug_... OPENAI_API_KEY=sk-... npx tsx examples/log-streaming.ts
 */

import OpenAI from "openai";

const TOKENIST_URL =
  process.env.TOKENIST_URL ?? "http://localhost:8081";
const TOKENIST_API_KEY = process.env.TOKENIST_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function logToTokenist(
  model: string,
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  latencyMs: number,
  opts: {
    status?: string;
    conversationId?: string;
    userEmail?: string;
    userName?: string;
  } = {}
) {
  const res = await fetch(`${TOKENIST_URL}/sdk/log`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKENIST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      request,
      response,
      latencyMs,
      status: opts.status ?? "success",
      conversationId: opts.conversationId,
      userEmail: opts.userEmail,
      userName: opts.userName,
    }),
  });
  return res.json();
}

async function main() {
  const request = {
    model: "gpt-4o-mini",
    messages: [
      { role: "user" as const, content: "Write a haiku about logging." },
    ],
    stream: true as const,
    stream_options: { include_usage: true },
  };

  const start = performance.now();
  const chunks: string[] = [];
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null =
    null;

  const stream = await openai.chat.completions.create(request);

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      process.stdout.write(delta);
      chunks.push(delta);
    }
    // The final chunk with include_usage has usage data
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  console.log(); // newline after streamed output

  const latencyMs = performance.now() - start;

  // Build a synthetic response object for logging
  const syntheticResponse = {
    id: "stream",
    object: "chat.completion",
    model: request.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: chunks.join("") },
        finish_reason: "stop",
      },
    ],
    usage,
  };

  // Pass a conversationId to group related requests together
  const conversationId = `conv_stream_${Date.now()}`;

  const result = await logToTokenist(
    request.model,
    request,
    syntheticResponse,
    latencyMs,
    {
      conversationId,
      userEmail: "alice@example.com",
      userName: "Alice Smith",
    }
  );

  console.log("Logged to Tokenist:", result);
  // → { id: "...", conversationId: "conv_stream_...", recorded: true }
  if (usage) {
    console.log(
      `Tokens — prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`
    );
  }
}

main();
