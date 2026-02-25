import { describe, it, expect, vi } from 'vitest';
import { extractContent, parseLabels, handleSentimentAnalysis } from './analyzer';

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
    expect(parseLabels('["win","task_failure"]')).toEqual(['win', 'task_failure']);
  });

  it('filters out unknown labels', () => {
    const result = parseLabels('["win","invented_label"]');
    expect(result).toContain('win');
    expect(result).not.toContain('invented_label');
  });

  it('strips markdown code fences', () => {
    expect(parseLabels('```json\n["win"]\n```')).toContain('win');
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
    const fakeDb = {} as D1Database;
    await expect(handleSentimentAnalysis(fakeDb, '')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
