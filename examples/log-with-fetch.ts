/**
 * Example: Log to Tokenist using plain fetch (no OpenAI SDK)
 *
 * Useful if you already have the raw request/response objects,
 * e.g. from a proxy, edge function, or other language client.
 *
 * Usage:
 *   TOKENIST_API_KEY=ug_... npx tsx examples/log-with-fetch.ts
 *   npx tsx examples/log-with-fetch.ts --user=user_alice
 *
 * Pass a unique userId (or TOKENIST_END_USER_ID) per end user so they appear as separate
 * users in the dashboard. If omitted, the API key owner's id is used for all logs.
 */

const TOKENIST_URL = process.env.TOKENIST_URL ?? "http://localhost:8081";
const TOKENIST_API_KEY = 'ug_bf177c5911682623bf2d85c0c72032fb53b6a1e0d31545aff5af4c9672139542';


async function main() {
  // if (!TOKENIST_API_KEY) {
  //   console.error("Set TOKENIST_API_KEY (e.g. ug_...)");
  //   process.exit(1);
  // }

  // These would come from your actual OpenAI call
  const request = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is 2 + 2?" },
    ],
    temperature: 0,
  };

  const response = {
    id: "chatcmpl-abc123",
    object: "chat.completion",
    created: 1700000000,
    model: "gpt-4o-2024-08-06",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "2 + 2 = 4." },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 25,
      completion_tokens: 8,
      total_tokens: 313,
    },
  };

  const body: Record<string, unknown> = {
    model: request.model,
    request,
    response,
    latencyMs: 342,
    status: "success",
    userId: "12345asdasd67890123",
    userEmail: "ryanstables@gmail.com",
    userName: "Ryan Stable",
    conversationId: "conv_asdasdabc123wawea", // omit to auto-generate
  };

  const res = await fetch(`${TOKENIST_URL}/sdk/log`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKENIST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  console.log("Status:", res.status);
  console.log("Body:", await res.json());
  // → { id: "...", conversationId: "conv_abc123", recorded: true }
  //
  // Now open http://localhost:3001/users to see end users and their logs.
}

main();
