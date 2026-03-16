/**
 * route.ts — Drop-in replacement for chatbot-ui's app/api/chat/route.ts
 *
 * To use:
 *   1. Copy this file to: <chatbot-ui-root>/app/api/chat/route.ts
 *      (overwriting the existing file)
 *   2. Copy middleware.ts and user-context.ts to the same directory
 *   3. Add to .env.local:
 *        TOKENIST_API_KEY=ug_...
 *        TOKENIST_BASE_URL=https://api.tokenist.dev   # or http://localhost:8081 for local dev
 *   4. Install tokenist-js:
 *        npm install tokenist-js
 *
 * What this adds vs. the original route:
 *   - Pre-flight Tokenist check (returns HTTP 429 if user is blocked/over-limit)
 *   - Fire-and-forget logging of every chat exchange (enables cost tracking,
 *     usage dashboards, rate limiting rules, and sentiment analysis)
 *
 * The OpenAI streaming logic is intentionally kept minimal to stay compatible
 * with chatbot-ui's expected SSE format.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserContext } from "./user-context";
import { checkUser, logExchange } from "./middleware";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    model: string;
    messages: Array<{ role: string; content: string }>;
    chatId?: string;
    [key: string]: unknown;
  };

  const user = await getUserContext();
  const model = body.model ?? "gpt-4o-mini";
  const conversationId = body.chatId; // chatbot-ui passes chatId in the body

  // ── 1. Pre-flight Tokenist check ────────────────────────────────────────────
  const check = await checkUser(user, model);
  if (!check.allowed) {
    return NextResponse.json(
      { error: check.reason ?? "Request not allowed by usage policy." },
      { status: 429 }
    );
  }

  const start = performance.now();
  let status: "success" | "error" = "success";

  // ── 2. Stream OpenAI response ────────────────────────────────────────────────
  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: body.messages as OpenAI.ChatCompletionMessageParam[],
      stream: true,
      // include_usage ensures we get token counts in the final chunk
      stream_options: { include_usage: true },
    });

    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null =
      null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              chunks.push(content);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            if (chunk.usage) {
              usage = chunk.usage;
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          status = "error";
          controller.error(err);
        } finally {
          // ── 3. Log to Tokenist after stream completes ──────────────────────
          const latencyMs = performance.now() - start;
          void logExchange({
            user,
            model,
            request: body,
            response: {
              choices: [{ message: { role: "assistant", content: chunks.join("") } }],
              usage,
            },
            latencyMs,
            status,
            conversationId,
            feature: "chatbot-ui",
          });
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    status = "error";
    const latencyMs = performance.now() - start;
    void logExchange({
      user,
      model,
      request: body,
      response: { error: String(err) },
      latencyMs,
      status,
      conversationId,
      feature: "chatbot-ui",
    });
    return NextResponse.json({ error: "OpenAI request failed" }, { status: 500 });
  }
}
