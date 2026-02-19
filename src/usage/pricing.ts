// Pricing per 1K tokens in USD (converted from OpenAI per-1M token prices)
// This module retains the static pricing lookup as a fallback.
// The primary pricing source is now the database via PricingStore.

export type { ModelPricing, DetailedTokenUsage } from '../storage/interfaces';
import type { ModelPricing, DetailedTokenUsage } from '../storage/interfaces';

// Helper: price per 1M → per 1K
const per1K = (per1M: number) => per1M / 1000;

const PRICING: Record<string, ModelPricing> = {
  // GPT-5 series
  'gpt-5.2': { inputPer1K: per1K(1.75), outputPer1K: per1K(14), cachedInputPer1K: per1K(0.175) },
  'gpt-5.1': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5-mini': { inputPer1K: per1K(0.25), outputPer1K: per1K(2), cachedInputPer1K: per1K(0.025) },
  'gpt-5-nano': { inputPer1K: per1K(0.05), outputPer1K: per1K(0.4), cachedInputPer1K: per1K(0.005) },
  'gpt-5.2-chat-latest': { inputPer1K: per1K(1.75), outputPer1K: per1K(14), cachedInputPer1K: per1K(0.175) },
  'gpt-5.1-chat-latest': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5-chat-latest': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5.2-codex': { inputPer1K: per1K(1.75), outputPer1K: per1K(14), cachedInputPer1K: per1K(0.175) },
  'gpt-5.1-codex-max': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5.1-codex': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5-codex': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },
  'gpt-5.2-pro': { inputPer1K: per1K(21), outputPer1K: per1K(168) },
  'gpt-5-pro': { inputPer1K: per1K(15), outputPer1K: per1K(120) },
  'gpt-5.1-codex-mini': { inputPer1K: per1K(0.25), outputPer1K: per1K(2), cachedInputPer1K: per1K(0.025) },
  'gpt-5-search-api': { inputPer1K: per1K(1.25), outputPer1K: per1K(10), cachedInputPer1K: per1K(0.125) },

  // GPT-4.1
  'gpt-4.1': { inputPer1K: per1K(2), outputPer1K: per1K(8), cachedInputPer1K: per1K(0.5) },
  'gpt-4.1-mini': { inputPer1K: per1K(0.4), outputPer1K: per1K(1.6), cachedInputPer1K: per1K(0.1) },
  'gpt-4.1-nano': { inputPer1K: per1K(0.1), outputPer1K: per1K(0.4), cachedInputPer1K: per1K(0.025) },

  // GPT-4o
  'gpt-4o': { inputPer1K: per1K(2.5), outputPer1K: per1K(10), cachedInputPer1K: per1K(1.25) },
  'gpt-4o-2024-05-13': { inputPer1K: per1K(5), outputPer1K: per1K(15) },
  'gpt-4o-mini': { inputPer1K: per1K(0.15), outputPer1K: per1K(0.6), cachedInputPer1K: per1K(0.075) },
  'gpt-4o-mini-search-preview': { inputPer1K: per1K(0.15), outputPer1K: per1K(0.6) },
  'gpt-4o-search-preview': { inputPer1K: per1K(2.5), outputPer1K: per1K(10) },

  // Realtime (text + audio rates from Audio tokens table per 1M → per 1K)
  'gpt-realtime': {
    inputPer1K: per1K(4),
    outputPer1K: per1K(16),
    cachedInputPer1K: per1K(0.4),
    audioInputPer1K: per1K(32),
    audioPer1K: per1K(64),
  },
  'gpt-realtime-mini': {
    inputPer1K: per1K(0.6),
    outputPer1K: per1K(2.4),
    cachedInputPer1K: per1K(0.06),
    audioInputPer1K: per1K(10),
    audioPer1K: per1K(20),
  },
  'gpt-4o-realtime-preview': {
    inputPer1K: per1K(5),
    outputPer1K: per1K(20),
    cachedInputPer1K: per1K(2.5),
    audioInputPer1K: per1K(100),
    audioPer1K: per1K(200),
  },
  'gpt-4o-mini-realtime-preview': {
    inputPer1K: per1K(0.6),
    outputPer1K: per1K(2.4),
    cachedInputPer1K: per1K(0.3),
    audioInputPer1K: per1K(10),
    audioPer1K: per1K(20),
  },

  // Audio
  'gpt-audio': { inputPer1K: per1K(2.5), outputPer1K: per1K(10), audioInputPer1K: per1K(100), audioPer1K: per1K(200) },
  'gpt-audio-mini': { inputPer1K: per1K(0.6), outputPer1K: per1K(2.4), audioInputPer1K: per1K(10), audioPer1K: per1K(20) },
  'gpt-4o-audio-preview': { inputPer1K: per1K(2.5), outputPer1K: per1K(10), audioInputPer1K: per1K(100), audioPer1K: per1K(200) },
  'gpt-4o-mini-audio-preview': { inputPer1K: per1K(0.15), outputPer1K: per1K(0.6), audioInputPer1K: per1K(10), audioPer1K: per1K(20) },

  // O-series
  'o1': { inputPer1K: per1K(15), outputPer1K: per1K(60), cachedInputPer1K: per1K(7.5) },
  'o1-pro': { inputPer1K: per1K(150), outputPer1K: per1K(600) },
  'o1-mini': { inputPer1K: per1K(1.1), outputPer1K: per1K(4.4), cachedInputPer1K: per1K(0.55) },
  'o3-pro': { inputPer1K: per1K(20), outputPer1K: per1K(80) },
  'o3': { inputPer1K: per1K(2), outputPer1K: per1K(8), cachedInputPer1K: per1K(0.5) },
  'o3-deep-research': { inputPer1K: per1K(10), outputPer1K: per1K(40), cachedInputPer1K: per1K(2.5) },
  'o3-mini': { inputPer1K: per1K(1.1), outputPer1K: per1K(4.4), cachedInputPer1K: per1K(0.55) },
  'o4-mini': { inputPer1K: per1K(1.1), outputPer1K: per1K(4.4), cachedInputPer1K: per1K(0.275) },
  'o4-mini-deep-research': { inputPer1K: per1K(2), outputPer1K: per1K(8), cachedInputPer1K: per1K(0.5) },

  // Codex / other
  'codex-mini-latest': { inputPer1K: per1K(1.5), outputPer1K: per1K(6), cachedInputPer1K: per1K(0.375) },
  'computer-use-preview': { inputPer1K: per1K(3), outputPer1K: per1K(12) },

  // Image (text tokens)
  'gpt-image-1.5': { inputPer1K: per1K(5), outputPer1K: per1K(10), cachedInputPer1K: per1K(1.25) },
  'chatgpt-image-latest': { inputPer1K: per1K(5), outputPer1K: per1K(10), cachedInputPer1K: per1K(1.25) },
  'gpt-image-1': { inputPer1K: per1K(5), outputPer1K: 0, cachedInputPer1K: per1K(1.25) },
  'gpt-image-1-mini': { inputPer1K: per1K(2), outputPer1K: 0, cachedInputPer1K: per1K(0.2) },

  // Legacy
  'chatgpt-4o-latest': { inputPer1K: per1K(5), outputPer1K: per1K(15) },
  'gpt-4-turbo-2024-04-09': { inputPer1K: per1K(10), outputPer1K: per1K(30) },
  'gpt-4-0125-preview': { inputPer1K: per1K(10), outputPer1K: per1K(30) },
  'gpt-4-1106-preview': { inputPer1K: per1K(10), outputPer1K: per1K(30) },
  'gpt-4-1106-vision-preview': { inputPer1K: per1K(10), outputPer1K: per1K(30) },
  'gpt-4-0613': { inputPer1K: per1K(30), outputPer1K: per1K(60) },
  'gpt-4-0314': { inputPer1K: per1K(30), outputPer1K: per1K(60) },
  'gpt-4-32k': { inputPer1K: per1K(60), outputPer1K: per1K(120) },
  'gpt-3.5-turbo': { inputPer1K: per1K(0.5), outputPer1K: per1K(1.5) },
  'gpt-3.5-turbo-0125': { inputPer1K: per1K(0.5), outputPer1K: per1K(1.5) },
  'gpt-3.5-turbo-1106': { inputPer1K: per1K(1), outputPer1K: per1K(2) },
  'gpt-3.5-turbo-0613': { inputPer1K: per1K(1.5), outputPer1K: per1K(2) },
  'gpt-3.5-0301': { inputPer1K: per1K(1.5), outputPer1K: per1K(2) },
  'gpt-3.5-turbo-instruct': { inputPer1K: per1K(1.5), outputPer1K: per1K(2) },
  'gpt-3.5-turbo-16k-0613': { inputPer1K: per1K(3), outputPer1K: per1K(4) },
  'davinci-002': { inputPer1K: per1K(2), outputPer1K: per1K(2) },
  'babbage-002': { inputPer1K: per1K(0.4), outputPer1K: per1K(0.4) },
};

// Default pricing for unknown models (aligned with gpt-4o-realtime-preview text rates)
const DEFAULT_PRICING: ModelPricing = {
  inputPer1K: per1K(5),
  outputPer1K: per1K(20),
  audioPer1K: per1K(80),
};

/**
 * Static pricing lookup (fallback when PricingStore is not available).
 * Prefer using PricingStore.getPricing() for database-backed pricing.
 */
export function getPricing(model: string): ModelPricing {
  return PRICING[model] || DEFAULT_PRICING;
}

/**
 * Static cost calculation (fallback when PricingStore is not available).
 * Prefer using PricingStore.calculateCost() for database-backed pricing.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K;
  return inputCost + outputCost;
}

/**
 * Static detailed cost calculation (fallback when PricingStore is not available).
 * Uses granular token breakdowns (audio, cached, text) for accurate pricing.
 * Prefer using PricingStore.calculateDetailedCost() for database-backed pricing.
 */
export function calculateDetailedCost(
  model: string,
  usage: DetailedTokenUsage
): number {
  const pricing = getPricing(model);
  let cost = 0;

  if (usage.cachedInputTokens && pricing.cachedInputPer1K) {
    cost += (usage.cachedInputTokens / 1000) * pricing.cachedInputPer1K;
    const nonCachedTextInput = (usage.textInputTokens ?? 0) - (usage.cachedInputTokens ?? 0);
    if (nonCachedTextInput > 0) {
      cost += (nonCachedTextInput / 1000) * pricing.inputPer1K;
    }
  } else if (usage.textInputTokens !== undefined) {
    cost += (usage.textInputTokens / 1000) * pricing.inputPer1K;
  } else {
    cost += (usage.inputTokens / 1000) * pricing.inputPer1K;
  }

  if (usage.audioInputTokens && pricing.audioInputPer1K) {
    cost += (usage.audioInputTokens / 1000) * pricing.audioInputPer1K;
  }

  if (usage.textOutputTokens !== undefined) {
    cost += (usage.textOutputTokens / 1000) * pricing.outputPer1K;
  } else {
    cost += (usage.outputTokens / 1000) * pricing.outputPer1K;
  }

  if (usage.audioOutputTokens && pricing.audioPer1K) {
    cost += (usage.audioOutputTokens / 1000) * pricing.audioPer1K;
  }

  return cost;
}
