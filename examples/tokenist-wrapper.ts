/**
 * Example: Reusable wrapper that auto-logs every OpenAI call to Tokenist
 *
 * Wraps the OpenAI client so every chat completion is automatically
 * checked against limits (POST /sdk/check) and logged (POST /sdk/log).
 *
 * Usage:
 *   TOKENIST_API_KEY=ug_... OPENAI_API_KEY=sk-... npx tsx examples/tokenist-wrapper.ts
 */

import OpenAI from "openai";

// ── Tokenist client ────────────────────────────────────────────────

interface TokenistClientOptions {
  baseUrl?: string;
  apiKey: string; // ug_... key
}

/** Context about the user making the request. */
interface UserContext {
  userId: string;
  email?: string;
  name?: string;
  /** Optional conversation ID to group related requests. Auto-generated if omitted. */
  conversationId?: string;
}

function createTokenistClient(opts: TokenistClientOptions) {
  const base = (opts.baseUrl ?? "http://localhost:8081").replace(/\/$/, "");

  async function post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  }

  return {
    /** Check if a user is allowed to make a request */
    check(userId: string, model: string) {
      return post<{ allowed: boolean; reason?: string }>("/sdk/check", {
        userId,
        model,
        requestType: "chat",
      });
    },

    /** Record aggregated token usage */
    record(
      userId: string,
      model: string,
      inputTokens: number,
      outputTokens: number,
      latencyMs: number
    ) {
      return post("/sdk/record", {
        userId,
        model,
        requestType: "chat",
        inputTokens,
        outputTokens,
        latencyMs,
        success: true,
      });
    },

    /** Log the full request/response payload with user context */
    log(
      model: string,
      request: Record<string, unknown>,
      response: Record<string, unknown>,
      latencyMs: number,
      user: UserContext,
      status = "success"
    ) {
      return post<{ id: string; conversationId: string; recorded: boolean }>("/sdk/log", {
        model,
        request,
        response,
        latencyMs,
        status,
        conversationId: user.conversationId,
        userEmail: user.email,
        userName: user.name,
      });
    },
  };
}

// ── Wrapped OpenAI call ────────────────────────────────────────────

const tokenist = createTokenistClient({
  apiKey: process.env.TOKENIST_API_KEY!,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Drop-in replacement for openai.chat.completions.create()
 * that enforces Tokenist limits and logs the full exchange.
 */
async function chatCompletion(
  user: UserContext,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
) {
  // 1. Check limits before calling OpenAI
  const check = await tokenist.check(user.userId, params.model);
  if (!check.allowed) {
    throw new Error(`Blocked by Tokenist: ${check.reason}`);
  }

  // 2. Call OpenAI
  const start = performance.now();
  let status = "success";
  let completion: OpenAI.ChatCompletion;
  try {
    completion = await openai.chat.completions.create(params);
  } catch (err: unknown) {
    status = "error";
    const latencyMs = performance.now() - start;
    await tokenist.log(
      params.model,
      params as unknown as Record<string, unknown>,
      { error: err instanceof Error ? err.message : String(err) },
      latencyMs,
      user,
      status
    );
    throw err;
  }
  const latencyMs = performance.now() - start;

  // 3. Record usage + log full request/response (fire and forget)
  const usage = completion.usage;
  if (usage) {
    tokenist.record(
      user.userId,
      params.model,
      usage.prompt_tokens,
      usage.completion_tokens,
      latencyMs
    );
  }

  tokenist.log(
    params.model,
    params as unknown as Record<string, unknown>,
    completion as unknown as Record<string, unknown>,
    latencyMs,
    user,
    status
  );

  return completion;
}

// ── Demo ───────────────────────────────────────────────────────────

async function main() {
  const user: UserContext = {
    userId: "user_alice",
    email: "alice@example.com",
    name: "Alice Smith",
    conversationId: "conv_demo_123", // omit to auto-generate
  };

  const result = await chatCompletion(user, {
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: "Explain WebSockets in one sentence." },
    ],
  });

  console.log("Assistant:", result.choices[0].message.content);
  console.log("Usage:", result.usage);
}

main().catch(console.error);
