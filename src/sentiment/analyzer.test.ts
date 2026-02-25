import { describe, it, expect, vi } from 'vitest';
import { extractContent, parseLabels, buildSystemPrompt, handleSentimentAnalysis } from './analyzer';
import { createInMemoryRequestLogStore, createInMemoryLabelStore } from '../storage/memory';

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
  const valid = ['success', 'task_failure', 'custom'];

  it('returns empty array for []', () => {
    expect(parseLabels('[]', valid)).toEqual([]);
  });

  it('returns matched labels', () => {
    expect(parseLabels('["success","task_failure"]', valid)).toEqual(['success', 'task_failure']);
  });

  it('filters out unknown labels', () => {
    const result = parseLabels('["success","invented_label"]', valid);
    expect(result).toContain('success');
    expect(result).not.toContain('invented_label');
  });

  it('strips markdown code fences', () => {
    expect(parseLabels('```json\n["success"]\n```', valid)).toContain('success');
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseLabels('not json', valid)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseLabels('', valid)).toEqual([]);
  });
});

describe('buildSystemPrompt', () => {
  it('includes label names in the label list', () => {
    const prompt = buildSystemPrompt([
      { name: 'success', description: 'it worked' },
      { name: 'failure', description: 'it failed' },
    ]);
    expect(prompt).toContain('success');
    expect(prompt).toContain('failure');
  });

  it('includes label descriptions', () => {
    const prompt = buildSystemPrompt([{ name: 'my_label', description: 'user was happy' }]);
    expect(prompt).toContain('user was happy');
  });
});

describe('handleSentimentAnalysis', () => {
  it('skips gracefully when apiKey is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = createInMemoryRequestLogStore();
    const labelStore = createInMemoryLabelStore();
    const result = await handleSentimentAnalysis(store, labelStore, '');
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns 0 when no unanalyzed logs exist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = createInMemoryRequestLogStore();
    const labelStore = createInMemoryLabelStore();
    const result = await handleSentimentAnalysis(store, labelStore, 'sk-test');
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('classifies unanalyzed logs using org labels', async () => {
    const store = createInMemoryRequestLogStore();
    const labelStore = createInMemoryLabelStore();
    await store.create({
      id: 'log-1',
      endUserId: 'u1',
      orgId: 'org-1',
      conversationId: 'c1',
      model: 'gpt-4o',
      requestBody: JSON.stringify({ messages: [{ role: 'user', content: 'Thanks!' }] }),
      responseBody: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'You are welcome!' } }] }),
      status: 'success',
      createdAt: new Date(),
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '["success"]' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await handleSentimentAnalysis(store, labelStore, 'sk-test');
    expect(result).toBe(1);
    const log = await store.getById('log-1');
    expect(log?.analysisLabels).toEqual(['success']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('writes empty array on classification failure to prevent infinite retry', async () => {
    const store = createInMemoryRequestLogStore();
    const labelStore = createInMemoryLabelStore();
    await store.create({
      id: 'log-1',
      endUserId: 'u1',
      orgId: 'org-1',
      conversationId: 'c1',
      model: 'gpt-4o',
      requestBody: '{}',
      responseBody: null,
      status: 'success',
      createdAt: new Date(),
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    );

    const result = await handleSentimentAnalysis(store, labelStore, 'sk-test');
    expect(result).toBe(1);
    const log = await store.getById('log-1');
    expect(log?.analysisLabels).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('uses different labels per org', async () => {
    const store = createInMemoryRequestLogStore();
    const labelStore = createInMemoryLabelStore();

    // Seed org-1 labels then add a custom one
    await labelStore.getForOrg('org-1');
    await labelStore.create('org-1', {
      name: 'custom_org1',
      displayName: 'Custom Org1',
      description: 'a custom label for org 1',
      color: '#123456',
      sortOrder: 10,
    });

    await store.create({
      id: 'log-org1',
      endUserId: 'u1',
      orgId: 'org-1',
      conversationId: 'c1',
      model: 'gpt-4o',
      requestBody: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      responseBody: JSON.stringify({ choices: [{ message: { content: 'Hello!' } }] }),
      status: 'success',
      createdAt: new Date(),
    });

    // Mock returns both success and custom_org1 — both valid for org-1
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '["success","custom_org1"]' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await handleSentimentAnalysis(store, labelStore, 'sk-test');
    const log = await store.getById('log-org1');
    expect(log?.analysisLabels).toContain('success');
    expect(log?.analysisLabels).toContain('custom_org1');
    fetchSpy.mockRestore();
  });
});
