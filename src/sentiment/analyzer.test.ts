import { describe, it, expect, vi } from 'vitest';
import { extractContent, parseLabels, handleSentimentAnalysis } from './analyzer';
import { createInMemoryRequestLogStore } from '../storage/memory';

describe('extractContent', () => {
  it('extracts last user message and assistant response', () => {
    const req = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'What is 2+2?' },
      ],
    });
    const res = JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '4.' } }],
    });
    const { userMessage, assistantResponse } = extractContent(req, res);
    expect(userMessage).toBe('What is 2+2?');
    expect(assistantResponse).toBe('4.');
  });

  it('truncates content to 500 characters', () => {
    const long = 'A'.repeat(1000);
    const req = JSON.stringify({ messages: [{ role: 'user', content: long }] });
    const res = JSON.stringify({ choices: [{ message: { role: 'assistant', content: long } }] });
    const { userMessage, assistantResponse } = extractContent(req, res);
    expect(userMessage.length).toBeLessThanOrEqual(500);
    expect(assistantResponse.length).toBeLessThanOrEqual(500);
  });

  it('handles null responseBody gracefully', () => {
    const req = JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] });
    const { userMessage, assistantResponse } = extractContent(req, null);
    expect(userMessage).toBe('Hello');
    expect(assistantResponse).toBe('');
  });

  it('handles malformed JSON gracefully', () => {
    const { userMessage, assistantResponse } = extractContent('bad json', 'also bad');
    expect(userMessage).toBe('');
    expect(assistantResponse).toBe('');
  });
});

describe('parseLabels', () => {
  it('returns empty array for []', () => {
    expect(parseLabels('[]')).toEqual([]);
  });

  it('returns matched labels', () => {
    expect(parseLabels('["success","task_failure"]')).toEqual(['success', 'task_failure']);
  });

  it('filters out unknown labels', () => {
    const result = parseLabels('["success","invented_label"]');
    expect(result).toContain('success');
    expect(result).not.toContain('invented_label');
  });

  it('strips markdown code fences', () => {
    expect(parseLabels('```json\n["success"]\n```')).toContain('success');
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseLabels('not json')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseLabels('')).toEqual([]);
  });
});

describe('handleSentimentAnalysis', () => {
  it('skips gracefully when apiKey is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = createInMemoryRequestLogStore();
    const result = await handleSentimentAnalysis(store, '');
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns without fetching when no unanalyzed logs exist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = createInMemoryRequestLogStore();
    const result = await handleSentimentAnalysis(store, 'sk-test');
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('classifies unanalyzed logs and stores results', async () => {
    const store = createInMemoryRequestLogStore();
    await store.create({
      id: 'log-1',
      endUserId: 'u1',
      conversationId: 'c1',
      model: 'gpt-4o',
      requestBody: JSON.stringify({ messages: [{ role: 'user', content: 'Thanks, that was great!' }] }),
      responseBody: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'You are welcome!' } }] }),
      status: 'success',
      createdAt: new Date(),
    });

    // Mock the fetch to return ["success"]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '["success"]' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await handleSentimentAnalysis(store, 'sk-test');
    expect(result).toBe(1);

    const log = await store.getById('log-1');
    expect(log?.analysisLabels).toEqual(['success']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('writes empty array on classification failure to prevent infinite retry', async () => {
    const store = createInMemoryRequestLogStore();
    await store.create({
      id: 'log-1',
      endUserId: 'u1',
      conversationId: 'c1',
      model: 'gpt-4o',
      requestBody: '{}',
      responseBody: null,
      status: 'success',
      createdAt: new Date(),
    });

    // Mock fetch to fail
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    const result = await handleSentimentAnalysis(store, 'sk-test');
    expect(result).toBe(1);

    const log = await store.getById('log-1');
    // Should be [] not null — prevents retry and documents the design
    expect(log?.analysisLabels).toEqual([]);
    fetchSpy.mockRestore();
  });
});
