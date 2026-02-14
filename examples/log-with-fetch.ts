/**
 * Example: Log to Tokenist using plain fetch (no OpenAI SDK)
 *
 * Useful if you already have the raw request/response objects,
 * e.g. from a proxy, edge function, or other language client.
 *
 * Usage:
 *   TOKENIST_API_KEY=ug_... npx tsx examples/log-with-fetch.ts
 */

const TOKENIST_URL = "http://localhost:8081";
const TOKENIST_API_KEY = "ug_97ef73fb15a0088f284f67eaf7c41c7888bd61931b4423cc2e49e600468c378b";

async function main() {
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
      total_tokens: 33,
    },
  };

  const res = await fetch(`${TOKENIST_URL}/sdk/log`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKENIST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      request,
      response,
      latencyMs: 342,
      status: "success",
    }),
  });

  console.log("Status:", res.status);
  console.log("Body:", await res.json());
  // → { id: "...", recorded: true }
  //
  // Now open http://localhost:3001/logs to see this entry in the dashboard.
}

main();
