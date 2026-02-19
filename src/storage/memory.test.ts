import { describe, it, expect } from 'vitest';
import {
  createInMemoryUsageStore,
  createInMemoryPricingStore,
} from './memory';
import { calculateCost, calculateDetailedCost } from '../usage/pricing';

describe('createInMemoryUsageStore', () => {
  describe('updateUsage with requestCost', () => {
    it('uses requestCost when provided instead of recalculating', async () => {
      const store = createInMemoryUsageStore();
      const result = await store.updateUsage('user-1', 'gpt-realtime', 1000, 500, undefined, 0.42);

      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.totalTokens).toBe(1500);
      expect(result.costUsd).toBe(0.42);
    });

    it('accumulates requestCost across multiple calls', async () => {
      const store = createInMemoryUsageStore();
      await store.updateUsage('user-1', 'gpt-realtime', 1000, 500, undefined, 0.10);
      const result = await store.updateUsage('user-1', 'gpt-realtime', 500, 300, undefined, 0.05);

      expect(result.inputTokens).toBe(1500);
      expect(result.outputTokens).toBe(800);
      expect(result.costUsd).toBeCloseTo(0.15);
    });

    it('recalculates from totals when requestCost is undefined', async () => {
      const store = createInMemoryUsageStore();
      const result = await store.updateUsage('user-1', 'gpt-realtime', 1000, 500);

      const expectedCost = calculateCost('gpt-realtime', 1000, 500);
      expect(result.costUsd).toBeCloseTo(expectedCost);
    });

    it('handles requestCost of 0', async () => {
      const store = createInMemoryUsageStore();
      const result = await store.updateUsage('user-1', 'gpt-realtime', 100, 50, undefined, 0);

      expect(result.costUsd).toBe(0);
    });

    it('audio requestCost is higher than text-only recalculation', async () => {
      const store = createInMemoryUsageStore();

      // Calculate what the detailed cost should be for audio-heavy usage
      const audioCost = calculateDetailedCost('gpt-4o-realtime-preview', {
        inputTokens: 2000,
        outputTokens: 1000,
        textInputTokens: 200,
        audioInputTokens: 1800,
        textOutputTokens: 200,
        audioOutputTokens: 800,
      });

      // Pass the pre-calculated audio cost
      const result = await store.updateUsage(
        'user-1',
        'gpt-4o-realtime-preview',
        2000,
        1000,
        undefined,
        audioCost
      );

      // The text-only recalculation would be cheaper
      const textOnlyCost = calculateCost('gpt-4o-realtime-preview', 2000, 1000);
      expect(result.costUsd).toBeGreaterThan(textOnlyCost);
      expect(result.costUsd).toBe(audioCost);
    });
  });

  describe('updateUsage with pricingStore', () => {
    it('uses pricingStore when no requestCost provided', async () => {
      const pricingStore = createInMemoryPricingStore();
      const store = createInMemoryUsageStore({ pricingStore });

      const result = await store.updateUsage('user-1', 'gpt-4o', 1000, 500);
      expect(result.costUsd).toBeGreaterThan(0);
    });

    it('prefers requestCost over pricingStore recalculation', async () => {
      const pricingStore = createInMemoryPricingStore();
      const store = createInMemoryUsageStore({ pricingStore });

      const result = await store.updateUsage('user-1', 'gpt-4o', 1000, 500, undefined, 99.99);
      expect(result.costUsd).toBe(99.99);
    });
  });
});

describe('createInMemoryPricingStore', () => {
  it('calculateDetailedCost handles audio tokens', async () => {
    const store = createInMemoryPricingStore();
    const cost = await store.calculateDetailedCost('gpt-realtime', {
      inputTokens: 2000,
      outputTokens: 1000,
      textInputTokens: 500,
      audioInputTokens: 1500,
      textOutputTokens: 200,
      audioOutputTokens: 800,
    });

    const textOnlyCost = await store.calculateCost('gpt-realtime', 2000, 1000);
    expect(cost).toBeGreaterThan(textOnlyCost);
  });

  it('calculateDetailedCost falls back gracefully without details', async () => {
    const store = createInMemoryPricingStore();
    const detailed = await store.calculateDetailedCost('gpt-4o', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    const basic = await store.calculateCost('gpt-4o', 1000, 500);
    expect(detailed).toBeCloseTo(basic);
  });

  it('strips date suffix from model names', async () => {
    const store = createInMemoryPricingStore();
    const resolved = await store.resolveModelId('gpt-4o-realtime-preview-2024-12-17');
    expect(resolved).toBe('gpt-4o-realtime-preview');
  });

  it('getModelTokenTypes includes audio-input for realtime models', async () => {
    const store = createInMemoryPricingStore();
    const types = await store.getModelTokenTypes('gpt-realtime');
    const tokenTypeNames = types.map((t) => t.tokenType);
    expect(tokenTypeNames).toContain('audio-input');
    expect(tokenTypeNames).toContain('audio-output');
    expect(tokenTypeNames).toContain('text-input');
    expect(tokenTypeNames).toContain('text-output');
  });
});
