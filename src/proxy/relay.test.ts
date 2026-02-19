import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupRelay, type RelayContext } from './relay';
import type { UsageStore, PricingStore } from '../storage/interfaces';
import { createInMemoryUsageStore, createInMemoryPricingStore } from '../storage/memory';
import type { Logger } from '../logger';
import { calculateDetailedCost, calculateCost } from '../usage/pricing';

// Cloudflare Workers WebSocket uses static READY_STATE_OPEN = 1
// Polyfill for test environment
if (typeof globalThis.WebSocket !== 'undefined') {
  (globalThis.WebSocket as unknown as Record<string, unknown>).READY_STATE_OPEN ??= 1;
} else {
  (globalThis as unknown as Record<string, unknown>).WebSocket = { READY_STATE_OPEN: 1 } as unknown;
}

// Mock WebSocket for testing
function createMockWebSocket() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  return {
    readyState: 1, // READY_STATE_OPEN
    addEventListener(type: string, handler: (event: unknown) => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(handler);
      listeners.set(type, existing);
    },
    send: vi.fn(),
    close: vi.fn(),
    _emit(type: string, data: unknown) {
      const handlers = listeners.get(type) ?? [];
      for (const handler of handlers) {
        handler(data);
      }
    },
  } as unknown as WebSocket & { _emit: (type: string, data: unknown) => void };
}

// Minimal logger
const logger: Logger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

const baseContext: RelayContext = {
  connectionId: 'conn-1',
  endUserId: 'user-1',
  orgId: 'org-1',
  conversationId: 'conv-1',
  model: 'gpt-4o-realtime-preview',
};

function makeResponseDoneEvent(usage: Record<string, unknown>) {
  return JSON.stringify({
    type: 'response.done',
    event_id: 'evt_test',
    response: {
      id: 'resp_test',
      status: 'completed',
      usage,
    },
  });
}

describe('setupRelay', () => {
  let client: ReturnType<typeof createMockWebSocket>;
  let upstream: ReturnType<typeof createMockWebSocket>;

  beforeEach(() => {
    client = createMockWebSocket();
    upstream = createMockWebSocket();
    vi.clearAllMocks();
  });

  it('passes requestCost to updateUsage when response.done has audio token details', async () => {
    const store = createInMemoryUsageStore();
    const pricingStore = createInMemoryPricingStore();
    const updateUsageSpy = vi.spyOn(store, 'updateUsage');

    setupRelay(client, upstream, baseContext, store, logger, {}, pricingStore);

    const message = makeResponseDoneEvent({
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
    });

    upstream._emit('message', { data: message });

    // Wait for async handlers
    await vi.waitFor(() => {
      expect(updateUsageSpy).toHaveBeenCalled();
    });

    const callArgs = updateUsageSpy.mock.calls[0];
    expect(callArgs[0]).toBe('user-1'); // endUserId
    expect(callArgs[1]).toBe('gpt-4o-realtime-preview'); // model
    expect(callArgs[2]).toBe(3200); // inputTokens
    expect(callArgs[3]).toBe(1800); // outputTokens
    // callArgs[4] = periodKey
    // callArgs[5] = requestCost — should be defined
    const requestCost = callArgs[5] as number;
    expect(requestCost).toBeDefined();
    expect(requestCost).toBeGreaterThan(0);

    // Verify it's the detailed cost (higher than text-only)
    const textOnlyCost = calculateCost('gpt-4o-realtime-preview', 3200, 1800);
    expect(requestCost).toBeGreaterThan(textOnlyCost);
  });

  it('does not pass requestCost when no token details available', async () => {
    const store = createInMemoryUsageStore();
    const pricingStore = createInMemoryPricingStore();
    const updateUsageSpy = vi.spyOn(store, 'updateUsage');

    setupRelay(client, upstream, baseContext, store, logger, {}, pricingStore);

    const message = makeResponseDoneEvent({
      total_tokens: 1000,
      input_tokens: 600,
      output_tokens: 400,
    });

    upstream._emit('message', { data: message });

    await vi.waitFor(() => {
      expect(updateUsageSpy).toHaveBeenCalled();
    });

    const callArgs = updateUsageSpy.mock.calls[0];
    expect(callArgs[5]).toBeUndefined(); // requestCost should be undefined
  });

  it('uses static calculateDetailedCost when no pricingStore provided', async () => {
    const store = createInMemoryUsageStore();
    const updateUsageSpy = vi.spyOn(store, 'updateUsage');

    // No pricingStore — should use static fallback
    setupRelay(client, upstream, baseContext, store, logger, {});

    const message = makeResponseDoneEvent({
      total_tokens: 2000,
      input_tokens: 1200,
      output_tokens: 800,
      input_token_details: {
        text_tokens: 200,
        audio_tokens: 1000,
      },
      output_token_details: {
        text_tokens: 300,
        audio_tokens: 500,
      },
    });

    upstream._emit('message', { data: message });

    await vi.waitFor(() => {
      expect(updateUsageSpy).toHaveBeenCalled();
    });

    const requestCost = updateUsageSpy.mock.calls[0][5] as number;
    expect(requestCost).toBeDefined();
    expect(requestCost).toBeGreaterThan(0);

    // Verify it matches the static calculateDetailedCost
    const expectedCost = calculateDetailedCost('gpt-4o-realtime-preview', {
      inputTokens: 1200,
      outputTokens: 800,
      textInputTokens: 200,
      audioInputTokens: 1000,
      textOutputTokens: 300,
      audioOutputTokens: 500,
    });
    expect(requestCost).toBeCloseTo(expectedCost);
  });

  it('relays upstream messages to client', async () => {
    const store = createInMemoryUsageStore();
    setupRelay(client, upstream, baseContext, store, logger, {});

    const message = JSON.stringify({ type: 'response.text.delta', delta: 'hello' });
    upstream._emit('message', { data: message });

    // Wait for async handler to complete
    await vi.waitFor(() => {
      expect(client.send).toHaveBeenCalledWith(message);
    });
  });

  it('relays client messages to upstream', () => {
    const store = createInMemoryUsageStore();
    setupRelay(client, upstream, baseContext, store, logger, {});

    const message = JSON.stringify({ type: 'conversation.item.create', item: { type: 'message' } });
    client._emit('message', { data: message });

    expect(upstream.send).toHaveBeenCalledWith(message);
  });

  it('accumulates cost correctly across multiple response.done events', async () => {
    const store = createInMemoryUsageStore();
    const pricingStore = createInMemoryPricingStore();

    setupRelay(client, upstream, baseContext, store, logger, {}, pricingStore);

    // First response
    upstream._emit('message', {
      data: makeResponseDoneEvent({
        total_tokens: 1000,
        input_tokens: 600,
        output_tokens: 400,
        input_token_details: { text_tokens: 100, audio_tokens: 500 },
        output_token_details: { text_tokens: 100, audio_tokens: 300 },
      }),
    });

    await vi.waitFor(async () => {
      const usage = await store.getUsage('user-1');
      expect(usage).toBeDefined();
      expect(usage!.inputTokens).toBe(600);
    });

    const firstUsage = await store.getUsage('user-1');
    const firstCost = firstUsage!.costUsd;

    // Second response
    upstream._emit('message', {
      data: makeResponseDoneEvent({
        total_tokens: 500,
        input_tokens: 300,
        output_tokens: 200,
        input_token_details: { text_tokens: 50, audio_tokens: 250 },
        output_token_details: { text_tokens: 50, audio_tokens: 150 },
      }),
    });

    await vi.waitFor(async () => {
      const usage = await store.getUsage('user-1');
      expect(usage!.inputTokens).toBe(900);
    });

    const secondUsage = await store.getUsage('user-1');
    expect(secondUsage!.costUsd).toBeGreaterThan(firstCost);
    // Costs should be additive (accumulated)
    expect(secondUsage!.inputTokens).toBe(900);
    expect(secondUsage!.outputTokens).toBe(600);
  });
});
