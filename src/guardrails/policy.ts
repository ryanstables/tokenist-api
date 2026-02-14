import type { UsageStore } from '../storage/interfaces';
import type { EndUserUsage } from '../types/user';

export interface ThresholdCheck {
  exceeded: boolean;
  reason?: string;
}

export async function checkThreshold(
  store: UsageStore,
  endUserId: string,
  usage?: EndUserUsage | null
): Promise<ThresholdCheck> {
  const resolvedUsage = usage ?? (await store.getUsage(endUserId));
  const threshold = await store.getThreshold(endUserId);

  if (!resolvedUsage) {
    return { exceeded: false };
  }

  if (threshold.maxCostUsd !== undefined && resolvedUsage.costUsd >= threshold.maxCostUsd) {
    return {
      exceeded: true,
      reason: `Cost limit exceeded: $${resolvedUsage.costUsd.toFixed(4)} >= $${threshold.maxCostUsd.toFixed(2)}`,
    };
  }

  if (
    threshold.maxTotalTokens !== undefined &&
    threshold.maxTotalTokens > 0 &&
    resolvedUsage.totalTokens >= threshold.maxTotalTokens
  ) {
    return {
      exceeded: true,
      reason: `Token limit exceeded: ${resolvedUsage.totalTokens} >= ${threshold.maxTotalTokens}`,
    };
  }

  return { exceeded: false };
}
