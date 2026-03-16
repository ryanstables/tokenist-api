/**
 * middleware.ts
 *
 * Tokenist middleware for chatbot-ui. Provides two functions:
 *   checkUser()   — pre-flight check before forwarding to OpenAI
 *   logExchange() — fire-and-forget logging after the response is consumed
 *
 * Both functions fail safely: errors are logged to console and never surfaced
 * to the user. Tokenist unavailability must not break the chat experience.
 */

import { TokenistClient } from "tokenist-js";
import type { UserContext } from "./user-context";

// Singleton client — initialised once at module load time
const tokenist = new TokenistClient({
  apiKey: process.env.TOKENIST_API_KEY!,
  baseUrl: process.env.TOKENIST_BASE_URL ?? "https://api.tokenist.dev",
});

export interface CheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Pre-flight check before forwarding a chat request to OpenAI.
 * Returns { allowed: false, reason } if the user has exceeded their limits.
 *
 * Fails open: if Tokenist is unreachable, the request is allowed through.
 */
export async function checkUser(user: UserContext, model: string): Promise<CheckResult> {
  try {
    const result = await tokenist.check({
      userId: user.userId,
      model,
      requestType: "chat",
    });
    return { allowed: result.allowed, reason: result.reason };
  } catch (err) {
    console.error("[tokenist] check() failed, failing open:", err);
    return { allowed: true };
  }
}

/**
 * Log a completed chat exchange to Tokenist for auditing, cost tracking,
 * and sentiment analysis.
 *
 * Fire-and-forget: never throws, never blocks the response stream.
 */
export async function logExchange(opts: {
  user: UserContext;
  model: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  latencyMs: number;
  status: "success" | "error";
  conversationId?: string;
  feature?: string;
}): Promise<void> {
  try {
    await tokenist.log({
      model: opts.model,
      request: opts.request,
      response: opts.response,
      latencyMs: opts.latencyMs,
      status: opts.status,
      conversationId: opts.conversationId,
      userId: opts.user.userId,
      userEmail: opts.user.email,
      userName: opts.user.displayName,
      feature: opts.feature,
    });
  } catch (err) {
    console.error("[tokenist] log() failed:", err);
  }
}

export { tokenist };
