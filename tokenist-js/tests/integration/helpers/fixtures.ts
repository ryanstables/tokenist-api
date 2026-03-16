/** Generate a unique end-user ID that won't collide across parallel test runs */
export const uid = (prefix = "user") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Minimal realistic OpenAI chat request payload */
export function fakeChatRequest(content: string) {
  return {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
  };
}

/** Minimal realistic OpenAI chat completion response payload */
export function fakeChatResponse(prompt_tokens: number, completion_tokens: number) {
  return {
    id: `chatcmpl-${Math.random().toString(36).slice(2)}`,
    object: "chat.completion",
    model: "gpt-4o-mini",
    choices: [
      {
        message: { role: "assistant", content: "Test response" },
        finish_reason: "stop",
        index: 0,
      },
    ],
    usage: {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    },
  };
}
