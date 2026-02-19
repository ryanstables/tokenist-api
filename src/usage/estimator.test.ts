import { describe, it, expect } from 'vitest';
import { extractResponseUsage, estimateUpstreamMessageTokens } from './estimator';

describe('extractResponseUsage', () => {
  it('extracts usage from a Realtime API response.done event', () => {
    const event = {
      type: 'response.done',
      event_id: 'evt_123',
      response: {
        id: 'resp_123',
        status: 'completed',
        usage: {
          total_tokens: 5000,
          input_tokens: 3200,
          output_tokens: 1800,
          input_token_details: {
            cached_tokens: 100,
            text_tokens: 200,
            audio_tokens: 3000,
          },
          output_token_details: {
            text_tokens: 300,
            audio_tokens: 1500,
          },
        },
      },
    };

    const result = extractResponseUsage(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(3200);
    expect(result!.outputTokens).toBe(1800);
    expect(result!.totalTokens).toBe(5000);

    expect(result!.inputTokenDetails).toEqual({
      textTokens: 200,
      audioTokens: 3000,
      cachedTokens: 100,
      imageTokens: undefined,
    });
    expect(result!.outputTokenDetails).toEqual({
      textTokens: 300,
      audioTokens: 1500,
      reasoningTokens: undefined,
    });
  });

  it('extracts usage from a Chat Completions API response.done event', () => {
    const event = {
      type: 'response.done',
      response: {
        id: 'resp_456',
        status: 'completed',
        usage: {
          total_tokens: 2000,
          prompt_tokens: 1200,
          completion_tokens: 800,
          prompt_tokens_details: {
            cached_tokens: 500,
            text_tokens: 1200,
            audio_tokens: 0,
          },
          completion_tokens_details: {
            text_tokens: 700,
            audio_tokens: 100,
            reasoning_tokens: 0,
          },
        },
      },
    };

    const result = extractResponseUsage(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(1200);
    expect(result!.outputTokens).toBe(800);

    expect(result!.inputTokenDetails).toEqual({
      textTokens: 1200,
      audioTokens: 0,
      cachedTokens: 500,
      imageTokens: undefined,
    });
    expect(result!.outputTokenDetails).toEqual({
      textTokens: 700,
      audioTokens: 100,
      reasoningTokens: 0,
    });
  });

  it('extracts usage without token details', () => {
    const event = {
      type: 'response.done',
      response: {
        id: 'resp_789',
        status: 'completed',
        usage: {
          total_tokens: 1000,
          input_tokens: 600,
          output_tokens: 400,
        },
      },
    };

    const result = extractResponseUsage(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(600);
    expect(result!.outputTokens).toBe(400);
    expect(result!.inputTokenDetails).toBeUndefined();
    expect(result!.outputTokenDetails).toBeUndefined();
  });

  it('returns null for non-response.done events', () => {
    const event = { type: 'response.text.delta', delta: 'hello' };
    expect(extractResponseUsage(JSON.stringify(event))).toBeNull();
  });

  it('returns null for response.done without usage', () => {
    const event = {
      type: 'response.done',
      response: { id: 'resp_000', status: 'completed' },
    };
    expect(extractResponseUsage(JSON.stringify(event))).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractResponseUsage('not json')).toBeNull();
  });

  it('extracts usage with image input tokens', () => {
    const event = {
      type: 'response.done',
      response: {
        id: 'resp_img',
        status: 'completed',
        usage: {
          total_tokens: 2500,
          input_tokens: 2000,
          output_tokens: 500,
          input_token_details: {
            text_tokens: 500,
            image_tokens: 1500,
          },
          output_token_details: {
            text_tokens: 500,
          },
        },
      },
    };

    const result = extractResponseUsage(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result!.inputTokenDetails!.imageTokens).toBe(1500);
    expect(result!.inputTokenDetails!.textTokens).toBe(500);
  });
});

describe('estimateUpstreamMessageTokens', () => {
  it('estimates tokens for response.text.delta', () => {
    const event = { type: 'response.text.delta', delta: 'Hello world' };
    const result = estimateUpstreamMessageTokens(JSON.stringify(event));
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.inputTokens).toBe(0);
  });

  it('estimates tokens for response.audio_transcript.delta', () => {
    const event = { type: 'response.audio_transcript.delta', delta: 'Some transcript' };
    const result = estimateUpstreamMessageTokens(JSON.stringify(event));
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it('returns zero for response.done with usage (handled by extractResponseUsage)', () => {
    const event = {
      type: 'response.done',
      response: {
        id: 'resp_1',
        status: 'completed',
        usage: { total_tokens: 100, input_tokens: 50, output_tokens: 50 },
      },
    };
    const result = estimateUpstreamMessageTokens(JSON.stringify(event));
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns zero for unknown event types', () => {
    const event = { type: 'session.created', session: { id: 'sess_1', model: 'gpt-4o' } };
    const result = estimateUpstreamMessageTokens(JSON.stringify(event));
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns zero for invalid JSON', () => {
    const result = estimateUpstreamMessageTokens('not json');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
