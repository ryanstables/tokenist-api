import type { RequestLogStore, SentimentLabelStore } from '../storage/interfaces';

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

export function parseLabels(rawJson: string, validLabels: string[]): string[] {
  if (!rawJson) return [];
  const stripped = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is string => typeof l === 'string' && validLabels.includes(l)
    );
  } catch {
    return [];
  }
}

export interface LabelDef {
  name: string;
  description: string;
}

export function buildSystemPrompt(labels: LabelDef[]): string {
  const labelList = labels.map((l) => l.name).join(', ');
  const definitions = labels.map((l) => `- ${l.name}: ${l.description}`).join('\n');
  return `You are a quality-analysis classifier for AI assistant conversations.
Analyze the user message and assistant response and return a JSON array of labels that apply.
Only use labels from this list: ${labelList}.
Return an empty array [] if none apply. Respond with ONLY the JSON array — no explanation, no markdown.

Label definitions:
${definitions}`;
}

export async function classifyRequest(
  content: { userMessage: string; assistantResponse: string },
  apiKey: string,
  systemPrompt: string,
  validLabels: string[]
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
        { role: 'system', content: systemPrompt },
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
  return parseLabels(data.choices?.[0]?.message?.content ?? '', validLabels);
}

export async function handleSentimentAnalysis(
  store: RequestLogStore,
  labelStore: SentimentLabelStore,
  apiKey: string
): Promise<number> {
  if (!apiKey) return 0;
  const logs = await store.getUnanalyzed(BATCH_SIZE);
  if (logs.length === 0) return 0;

  // Group logs by orgId so we fetch labels once per org
  const byOrg = new Map<string, typeof logs>();
  for (const log of logs) {
    const key = log.orgId ?? '';
    const bucket = byOrg.get(key) ?? [];
    bucket.push(log);
    byOrg.set(key, bucket);
  }

  const allPromises: Promise<void>[] = [];

  for (const [orgId, orgLogs] of byOrg) {
    const labels = await labelStore.getForOrg(orgId || 'default');
    const validNames = labels.map((l) => l.name);
    const systemPrompt = buildSystemPrompt(labels);

    for (const log of orgLogs) {
      allPromises.push(
        (async () => {
          try {
            const content = extractContent(log.requestBody, log.responseBody ?? null);
            const classified = await classifyRequest(content, apiKey, systemPrompt, validNames);
            await store.setAnalysisLabels(log.id, classified);
          } catch (err) {
            console.error(`[sentiment] Failed to classify log ${log.id}:`, err);
            // Write empty array to prevent infinite retry of permanently failing logs.
            await store.setAnalysisLabels(log.id, []);
          }
        })()
      );
    }
  }

  const settled = await Promise.allSettled(allPromises);
  const failures = settled.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[sentiment] ${failures.length}/${logs.length} classifications failed`);
  }
  return logs.length;
}
