/**
 * user-context.ts
 *
 * Extracts the authenticated user's context from chatbot-ui's Supabase session.
 * chatbot-ui uses @supabase/ssr, which stores the session in HTTP cookies.
 *
 * Drop this file into your chatbot-ui project alongside route.ts.
 * It requires no additional dependencies beyond what chatbot-ui already uses.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export interface UserContext {
  userId: string;
  email?: string;
  displayName?: string;
}

/**
 * Extract the authenticated user's context from the Supabase session cookie.
 * Falls back to { userId: "anonymous" } if no session is present.
 *
 * The Supabase user.id is a stable UUID that works as a Tokenist userId.
 */
export async function getUserContext(): Promise<UserContext> {
  const cookieStore = await cookies();

  // These env vars come from chatbot-ui's own .env.local
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Read-only in this context — we don't refresh the session here
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: "anonymous" };
  }

  return {
    userId: user.id, // Supabase UUID — stable, unique per user
    email: user.email,
    displayName: user.email?.split("@")[0],
  };
}
