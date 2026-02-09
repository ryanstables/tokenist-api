// Pricing per 1K tokens in USD
export interface ModelPricing {
  inputPer1K: number;
  outputPer1K: number;
  audioPer1K?: number;
}

const PRICING: Record<string, ModelPricing> = {
  // GPT-4o Realtime models
  'gpt-4o-realtime-preview': {
    inputPer1K: 0.06,
    outputPer1K: 0.24,
    audioPer1K: 0.24,
  },
  'gpt-4o-realtime-preview-2024-10-01': {
    inputPer1K: 0.06,
    outputPer1K: 0.24,
    audioPer1K: 0.24,
  },
  'gpt-4o-realtime-preview-2024-12-17': {
    inputPer1K: 0.06,
    outputPer1K: 0.24,
    audioPer1K: 0.24,
  },
  // GPT-4o mini Realtime models
  'gpt-4o-mini-realtime-preview': {
    inputPer1K: 0.01,
    outputPer1K: 0.04,
    audioPer1K: 0.04,
  },
  'gpt-4o-mini-realtime-preview-2024-12-17': {
    inputPer1K: 0.01,
    outputPer1K: 0.04,
    audioPer1K: 0.04,
  },
};

// Default pricing for unknown models
const DEFAULT_PRICING: ModelPricing = {
  inputPer1K: 0.06,
  outputPer1K: 0.24,
  audioPer1K: 0.24,
};

export function getPricing(model: string): ModelPricing {
  return PRICING[model] || DEFAULT_PRICING;
}

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
