import type { Logger } from '../logger';
import type { UsageStore } from '../storage/interfaces';
import {
  estimateUpstreamMessageTokens,
  extractResponseUsage,
} from '../usage/estimator';
import { checkThreshold } from '../guardrails/policy';

export interface RelayContext {
  connectionId: string;
  endUserId: string;
  orgId?: string;
  email?: string;
  name?: string;
  conversationId: string;
  model: string;
  feature?: string;
  periodKey?: string;
}

export interface RelayHooks {
  onClientMessage?: (data: string, context: RelayContext) => void;
  onUpstreamMessage?: (data: string, context: RelayContext) => void;
  onThresholdExceeded?: (context: RelayContext, reason: string) => void;
}

export function setupRelay(
  client: WebSocket,
  upstream: WebSocket,
  context: RelayContext,
  store: UsageStore,
  logger: Logger,
  hooks: RelayHooks = {}
): void {
  const relayLogger = logger.child({
    component: 'relay',
    connectionId: context.connectionId,
    endUserId: context.endUserId,
  });

  // Client → Upstream
  client.addEventListener('message', async (event) => {
    const message = typeof event.data === 'string' ? event.data : '';

    if (hooks.onClientMessage) {
      try {
        hooks.onClientMessage(message, context);
      } catch (error) {
        relayLogger.error({ error }, 'Error in client message hook');
      }
    }

    if (upstream.readyState === WebSocket.READY_STATE_OPEN) {
      upstream.send(message);
      relayLogger.trace({ direction: 'client→upstream' }, 'Message relayed');
    }
  });

  // Upstream → Client
  upstream.addEventListener('message', async (event) => {
    const message = typeof event.data === 'string' ? event.data : '';

    const actualUsage = extractResponseUsage(message);
    if (actualUsage) {
      relayLogger.debug(
        {
          inputTokens: actualUsage.inputTokens,
          outputTokens: actualUsage.outputTokens,
          totalTokens: actualUsage.totalTokens,
          inputTokenDetails: actualUsage.inputTokenDetails,
          outputTokenDetails: actualUsage.outputTokenDetails,
        },
        'OpenAI usage received (response.done)'
      );
      if (actualUsage.inputTokens > 0 || actualUsage.outputTokens > 0) {
        const usage = await store.updateUsage(
          context.endUserId,
          context.model,
          actualUsage.inputTokens,
          actualUsage.outputTokens,
          context.periodKey
        );
        const thresholdCheck = await checkThreshold(store, context.endUserId, usage);
        if (thresholdCheck.exceeded) {
          relayLogger.warn({ reason: thresholdCheck.reason }, 'Threshold exceeded');
          if (hooks.onThresholdExceeded) {
            hooks.onThresholdExceeded(context, thresholdCheck.reason!);
          }
          client.close(4004, 'Threshold exceeded');
          upstream.close(1000, 'Threshold exceeded');
          return;
        }
      }
    } else {
      const estimate = estimateUpstreamMessageTokens(message);
      if (estimate.outputTokens > 0) {
        const usage = await store.updateUsage(
          context.endUserId,
          context.model,
          0,
          estimate.outputTokens,
          context.periodKey
        );
        relayLogger.debug(
          { outputTokens: estimate.outputTokens, totalCost: usage.costUsd },
          'Output tokens counted (Tiktoken fallback)'
        );
        const thresholdCheck = await checkThreshold(store, context.endUserId, usage);
        if (thresholdCheck.exceeded) {
          relayLogger.warn({ reason: thresholdCheck.reason }, 'Threshold exceeded');
          if (hooks.onThresholdExceeded) {
            hooks.onThresholdExceeded(context, thresholdCheck.reason!);
          }
          client.close(4004, 'Threshold exceeded');
          upstream.close(1000, 'Threshold exceeded');
          return;
        }
      }
    }

    if (hooks.onUpstreamMessage) {
      try {
        hooks.onUpstreamMessage(message, context);
      } catch (error) {
        relayLogger.error({ error }, 'Error in upstream message hook');
      }
    }

    if (client.readyState === WebSocket.READY_STATE_OPEN) {
      client.send(message);
      relayLogger.trace({ direction: 'upstream→client' }, 'Message relayed');
    }
  });

  // Handle upstream close - close client
  upstream.addEventListener('close', (event) => {
    relayLogger.debug({ code: event.code, reason: event.reason }, 'Upstream closed');
    if (client.readyState === WebSocket.READY_STATE_OPEN) {
      client.close(event.code, event.reason);
    }
  });

  // Handle upstream error
  upstream.addEventListener('error', (event) => {
    relayLogger.error({ error: (event as ErrorEvent).message ?? 'unknown' }, 'Upstream error');
    if (client.readyState === WebSocket.READY_STATE_OPEN) {
      client.close(4502, 'Upstream error');
    }
  });

  // Handle client close - close upstream
  client.addEventListener('close', (event) => {
    relayLogger.debug({ code: event.code, reason: event.reason }, 'Client closed');
    if (upstream.readyState === WebSocket.READY_STATE_OPEN) {
      upstream.close(event.code, event.reason);
    }
  });

  // Handle client error
  client.addEventListener('error', (event) => {
    relayLogger.error({ error: (event as ErrorEvent).message ?? 'unknown' }, 'Client error');
    if (upstream.readyState === WebSocket.READY_STATE_OPEN) {
      upstream.close();
    }
  });
}
