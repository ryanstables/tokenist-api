import { describe, it, expect } from 'vitest';
import { calculateCost, calculateDetailedCost, getPricing } from './pricing';
import type { DetailedTokenUsage } from '../storage/interfaces';

describe('getPricing', () => {
  it('returns pricing for known realtime models', () => {
    const pricing = getPricing('gpt-4o-realtime-preview');
    expect(pricing.inputPer1K).toBeGreaterThan(0);
    expect(pricing.outputPer1K).toBeGreaterThan(0);
    expect(pricing.audioPer1K).toBeGreaterThan(0);
    expect(pricing.audioInputPer1K).toBeGreaterThan(0);
  });

  it('includes audioInputPer1K for all realtime models', () => {
    const models = [
      'gpt-realtime',
      'gpt-realtime-mini',
      'gpt-4o-realtime-preview',
      'gpt-4o-mini-realtime-preview',
    ];
    for (const model of models) {
      const pricing = getPricing(model);
      expect(pricing.audioInputPer1K, `${model} should have audioInputPer1K`).toBeDefined();
      expect(pricing.audioInputPer1K).toBeGreaterThan(0);
    }
  });

  it('includes audioInputPer1K for all audio models', () => {
    const models = [
      'gpt-audio',
      'gpt-audio-mini',
      'gpt-4o-audio-preview',
      'gpt-4o-mini-audio-preview',
    ];
    for (const model of models) {
      const pricing = getPricing(model);
      expect(pricing.audioInputPer1K, `${model} should have audioInputPer1K`).toBeDefined();
      expect(pricing.audioInputPer1K).toBeGreaterThan(0);
    }
  });

  it('audio rates are higher than text rates for realtime models', () => {
    const pricing = getPricing('gpt-4o-realtime-preview');
    expect(pricing.audioInputPer1K!).toBeGreaterThan(pricing.inputPer1K);
    expect(pricing.audioPer1K!).toBeGreaterThan(pricing.outputPer1K);
  });

  it('returns default pricing for unknown models', () => {
    const pricing = getPricing('unknown-model-xyz');
    expect(pricing.inputPer1K).toBeGreaterThan(0);
    expect(pricing.outputPer1K).toBeGreaterThan(0);
  });
});

describe('calculateCost', () => {
  it('calculates text-only cost using inputPer1K and outputPer1K', () => {
    const cost = calculateCost('gpt-4o-realtime-preview', 1000, 1000);
    const pricing = getPricing('gpt-4o-realtime-preview');
    expect(cost).toBeCloseTo(pricing.inputPer1K + pricing.outputPer1K);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateCost('gpt-4o-realtime-preview', 0, 0)).toBe(0);
  });
});

describe('calculateDetailedCost', () => {
  it('calculates text-only cost when no audio tokens', () => {
    const usage: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      textInputTokens: 1000,
      textOutputTokens: 500,
    };
    const cost = calculateDetailedCost('gpt-4o-realtime-preview', usage);
    const pricing = getPricing('gpt-4o-realtime-preview');
    const expected = (1000 / 1000) * pricing.inputPer1K + (500 / 1000) * pricing.outputPer1K;
    expect(cost).toBeCloseTo(expected);
  });

  it('calculates audio + text cost for realtime models', () => {
    const usage: DetailedTokenUsage = {
      inputTokens: 2000,
      outputTokens: 1500,
      textInputTokens: 500,
      audioInputTokens: 1500,
      textOutputTokens: 500,
      audioOutputTokens: 1000,
    };
    const cost = calculateDetailedCost('gpt-4o-realtime-preview', usage);
    const pricing = getPricing('gpt-4o-realtime-preview');
    const expected =
      (500 / 1000) * pricing.inputPer1K +
      (1500 / 1000) * pricing.audioInputPer1K! +
      (500 / 1000) * pricing.outputPer1K +
      (1000 / 1000) * pricing.audioPer1K!;
    expect(cost).toBeCloseTo(expected);
  });

  it('audio cost is significantly higher than text-only cost', () => {
    const textOnly: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 1000,
      textInputTokens: 1000,
      textOutputTokens: 1000,
    };
    const audioHeavy: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 1000,
      textInputTokens: 0,
      audioInputTokens: 1000,
      textOutputTokens: 0,
      audioOutputTokens: 1000,
    };
    const textCost = calculateDetailedCost('gpt-4o-realtime-preview', textOnly);
    const audioCost = calculateDetailedCost('gpt-4o-realtime-preview', audioHeavy);
    expect(audioCost).toBeGreaterThan(textCost * 2);
  });

  it('handles cached input tokens with discounted rate', () => {
    const noCached: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 0,
      textInputTokens: 1000,
    };
    const allCached: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 0,
      textInputTokens: 1000,
      cachedInputTokens: 1000,
    };
    const noCachedCost = calculateDetailedCost('gpt-4o-realtime-preview', noCached);
    const allCachedCost = calculateDetailedCost('gpt-4o-realtime-preview', allCached);
    expect(allCachedCost).toBeLessThan(noCachedCost);
  });

  it('falls back to aggregate inputTokens when no text breakdown', () => {
    const usage: DetailedTokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
    };
    const cost = calculateDetailedCost('gpt-4o-realtime-preview', usage);
    const pricing = getPricing('gpt-4o-realtime-preview');
    const expected = (1000 / 1000) * pricing.inputPer1K + (500 / 1000) * pricing.outputPer1K;
    expect(cost).toBeCloseTo(expected);
  });

  it('handles a realistic Realtime API response.done usage', () => {
    // Simulates a typical Realtime API response with mixed text+audio
    const usage: DetailedTokenUsage = {
      inputTokens: 3200,
      outputTokens: 1800,
      textInputTokens: 200,
      audioInputTokens: 3000,
      cachedInputTokens: 100,
      textOutputTokens: 300,
      audioOutputTokens: 1500,
    };
    const cost = calculateDetailedCost('gpt-realtime', usage);
    expect(cost).toBeGreaterThan(0);

    // Verify it's more expensive than calculateCost (which ignores audio rates)
    const naiveCost = calculateCost('gpt-realtime', 3200, 1800);
    expect(cost).toBeGreaterThan(naiveCost);
  });

  it('returns 0 for zero tokens', () => {
    const usage: DetailedTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
    };
    expect(calculateDetailedCost('gpt-realtime', usage)).toBe(0);
  });
});
