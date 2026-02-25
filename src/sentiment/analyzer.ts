import type { RequestLogStore } from '../storage/interfaces';

const VALID_LABELS = [
  'forgetting',
  'task_failure',
  'user_frustration',
  'nsfw',
  'jailbreaking',
  'laziness',
  'success',
] as const;

const BATCH_SIZE = 50;
const TRUNCATE_CHARS = 500;

export function extractContent(
  requestBody: string,
  responseBody: string | null
): { userMessage: string; assistantResponse: string } {
  let userMessage = '';
  let assistantResponse = '';
  try {
    const req = JSON.parse(requestBody) as { messages?: { role: string; content: string }[] };
    if (Array.isArray(req.messages)) {
      const userMsgs = req.messages.filter((m) => m.role === 'user');
      if (userMsgs.length > 0) {
        userMessage = (userMsgs[userMsgs.length - 1].content ?? '').slice(0, TRUNCATE_CHARS);
      }
    }
  } catch { /* malformed */ }
  if (responseBody) {
    try {
      const res = JSON.parse(responseBody) as { choices?: { message?: { content?: string } }[] };
      if (Array.isArray(res.choices) && res.choices.length > 0) {
        assistantResponse = (res.choices[0].message?.content ?? '').slice(0, TRUNCATE_CHARS);
      }
    } catch { /* malformed */ }
  }
  return { userMessage, assistantResponse };
}

export function parseLabels(rawJson: string): string[] {
  if (!rawJson) return [];
  const stripped = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is string => typeof l === 'string' && (VALID_LABELS as readonly string[]).includes(l)
    );
  } catch {
    return [];
  }
}

const SYSTEM_PROMPT = `You are a quality-analysis classifier for AI assistant conversations.
Analyze the user message and assistant response and return a JSON array of labels that apply.
Only use labels from this list: forgetting, task_failure, user_frustration, nsfw, jailbreaking, laziness, success.
Return an empty array [] if none apply. Respond with ONLY the JSON array — no explanation, no markdown.

Label definitions:
- forgetting: assistant forgot important context the user previously provided
- task_failure: assistant failed, refused, or could not complete the requested task
- user_frustration: user expressed frustration, anger, or disappointment
- nsfw: explicit, harmful, or adult content was involved
- jailbreaking: user tried to manipulate or bypass the assistant's guidelines
- laziness: assistant gave a blank, minimal, or low-effort response
- success: assistant gave a complete, accurate, and helpful response that clearly and fully addressed the user's request`;

export async function classifyRequest(
  content: { userMessage: string; assistantResponse: string },
  apiKey: string
): Promise<string[]> {
  const userContent = `User message:\n${content.userMessage || '(empty)'}\n\nAssistant response:\n${content.assistantResponse || '(empty)'}`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 64,
    }),
  });
  if (!response.ok) {
    throw new Error(`[sentiment] OpenAI API error ${response.status}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return parseLabels(data.choices?.[0]?.message?.content ?? '');
}

export async function handleSentimentAnalysis(
  store: RequestLogStore,
  apiKey: string
): Promise<number> {
  if (!apiKey) return 0;
  const logs = await store.getUnanalyzed(BATCH_SIZE);
  if (logs.length === 0) return 0;
  const settled = await Promise.allSettled(
    logs.map(async (log) => {
      try {
        const content = extractContent(log.requestBody, log.responseBody ?? null);
        const labels = await classifyRequest(content, apiKey);
        await store.setAnalysisLabels(log.id, labels);
      } catch (err) {
        console.error(`[sentiment] Failed to classify log ${log.id}:`, err);
        // Write empty array to prevent infinite retry of permanently failing logs.
        // Transient failures will be retried on next cron run if not yet set.
        await store.setAnalysisLabels(log.id, []);
      }
    })
  );
  const failures = settled.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[sentiment] ${failures.length}/${logs.length} classifications failed`);
  }
  return logs.length;
}
