import { describe, it, expect } from 'vitest';
import {
  createInMemoryUsageStore,
  createInMemoryPricingStore,
  createInMemorySlackSettingsStore,
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

import {
  createInMemoryApiKeyStore,
} from './memory';

describe('createInMemoryApiKeyStore', () => {
  it('create returns a plainKey and a key with keyHint', async () => {
    const store = createInMemoryApiKeyStore();
    const { key, plainKey } = await store.create('user-1', 'My Key');

    expect(plainKey).toMatch(/^ug_[0-9a-f]{64}$/);
    expect(key.keyHint).toBe(plainKey.slice(0, 12));
    expect(key.name).toBe('My Key');
    expect(key.userId).toBe('user-1');
    expect('apiKey' in key).toBe(false);
  });

  it('findUserIdByApiKey returns userId when key is valid', async () => {
    const store = createInMemoryApiKeyStore();
    const { plainKey } = await store.create('user-1', 'Test');

    const userId = await store.findUserIdByApiKey(plainKey);
    expect(userId).toBe('user-1');
  });

  it('findUserIdByApiKey returns undefined for unknown key', async () => {
    const store = createInMemoryApiKeyStore();
    const userId = await store.findUserIdByApiKey('ug_' + 'a'.repeat(64));
    expect(userId).toBeUndefined();
  });

  it('listByUserId returns keys with keyHint', async () => {
    const store = createInMemoryApiKeyStore();
    const { plainKey } = await store.create('user-1', 'Key A');
    await store.create('user-1', 'Key B');

    const keys = await store.listByUserId('user-1');
    expect(keys).toHaveLength(2);
    expect(keys[0].keyHint).toBe(plainKey.slice(0, 12));
    expect('apiKey' in keys[0]).toBe(false);
  });

  it('delete removes the key so findUserIdByApiKey returns undefined', async () => {
    const store = createInMemoryApiKeyStore();
    const { key, plainKey } = await store.create('user-1', 'Temp');

    const deleted = await store.delete('user-1', key.id);
    expect(deleted).toBe(true);

    const userId = await store.findUserIdByApiKey(plainKey);
    expect(userId).toBeUndefined();
  });

  it('delete returns false for wrong userId', async () => {
    const store = createInMemoryApiKeyStore();
    const { key } = await store.create('user-1', 'Test');

    const deleted = await store.delete('user-2', key.id);
    expect(deleted).toBe(false);
  });
});

describe('createInMemorySlackSettingsStore', () => {
  it('returns undefined for unknown org', async () => {
    const store = createInMemorySlackSettingsStore();
    expect(await store.get('org-1')).toBeUndefined();
  });

  it('upsert creates and get retrieves', async () => {
    const store = createInMemorySlackSettingsStore();
    const settings = await store.upsert({
      orgId: 'org-1',
      webhookUrl: 'https://hooks.slack.com/test',
      timezone: 'America/New_York',
      enabled: true,
    });
    expect(settings.orgId).toBe('org-1');
    expect(settings.webhookUrl).toBe('https://hooks.slack.com/test');
    expect(settings.enabled).toBe(true);

    const fetched = await store.get('org-1');
    expect(fetched?.timezone).toBe('America/New_York');
  });

  it('upsert updates existing', async () => {
    const store = createInMemorySlackSettingsStore();
    await store.upsert({ orgId: 'org-1', webhookUrl: 'https://hooks.slack.com/old', timezone: 'UTC', enabled: true });
    await store.upsert({ orgId: 'org-1', webhookUrl: 'https://hooks.slack.com/new', timezone: 'UTC', enabled: false });
    const fetched = await store.get('org-1');
    expect(fetched?.webhookUrl).toBe('https://hooks.slack.com/new');
    expect(fetched?.enabled).toBe(false);
  });

  it('delete removes settings', async () => {
    const store = createInMemorySlackSettingsStore();
    await store.upsert({ orgId: 'org-1', webhookUrl: 'https://hooks.slack.com/test', timezone: 'UTC', enabled: true });
    expect(await store.delete('org-1')).toBe(true);
    expect(await store.get('org-1')).toBeUndefined();
  });

  it('delete returns false for unknown org', async () => {
    const store = createInMemorySlackSettingsStore();
    expect(await store.delete('org-x')).toBe(false);
  });

  it('listEnabled returns only enabled settings', async () => {
    const store = createInMemorySlackSettingsStore();
    await store.upsert({ orgId: 'org-1', webhookUrl: 'https://hooks.slack.com/a', timezone: 'UTC', enabled: true });
    await store.upsert({ orgId: 'org-2', webhookUrl: 'https://hooks.slack.com/b', timezone: 'UTC', enabled: false });
    const enabled = await store.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].orgId).toBe('org-1');
  });
});
