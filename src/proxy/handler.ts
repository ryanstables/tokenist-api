import type { Logger } from '../logger';
import type { UsageStore, Blocklist } from '../storage/interfaces';
import { extractIdentity } from '../guardrails/identity';
import { checkThreshold } from '../guardrails/policy';
import { connectToUpstream } from './upstream';
import { setupRelay, type RelayHooks } from './relay';

const DEFAULT_MODEL = 'gpt-4o-realtime-preview';

export interface WebSocketHandlerDeps {
  usageStore: UsageStore;
  blocklist: Blocklist;
  openaiApiKey: string;
  logger: Logger;
  relayHooks?: RelayHooks;
}

export async function handleWebSocketUpgrade(
  request: Request,
  deps: WebSocketHandlerDeps
): Promise<Response> {
  const { usageStore, blocklist, openaiApiKey, logger, relayHooks } = deps;
  const connectionId = crypto.randomUUID();
  const connLogger = logger.child({ component: 'connection', connectionId });

  try {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/v1/realtime')) {
      connLogger.warn({ path: url.pathname }, 'Invalid path');
      return new Response('Not Found', { status: 404 });
    }

    const model = url.searchParams.get('model') || DEFAULT_MODEL;

    // Extract identity from headers
    const identityResult = extractIdentity(request);
    if (!identityResult.success) {
      connLogger.warn({ error: identityResult.error }, 'Identity extraction failed');
      return new Response(identityResult.error, { status: identityResult.code });
    }

    const { endUserId, orgId, email, name } = identityResult.identity;

    // Use client-supplied conversation ID or generate one
    const conversationId =
      request.headers.get('x-conversation-id')?.trim() || crypto.randomUUID();

    // Optional feature/product identifier
    const feature = request.headers.get('x-feature')?.trim() || undefined;

    // Determine API key: client Bearer token or server-side key
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const apiKey = bearerToken || openaiApiKey;

    if (!apiKey) {
      connLogger.warn('No API key available');
      return new Response('Unauthorized', { status: 401 });
    }

    connLogger.info({ endUserId, orgId }, 'End user identity resolved');

    // Check blocklist
    if (await blocklist.isBlocked(endUserId)) {
      const entry = await blocklist.getBlockEntry(endUserId);
      connLogger.warn({ reason: entry?.reason }, 'End user is blocked');
      return new Response('Forbidden', { status: 403 });
    }

    // Check threshold
    const thresholdCheck = await checkThreshold(usageStore, endUserId);
    if (thresholdCheck.exceeded) {
      connLogger.warn({ reason: thresholdCheck.reason }, 'End user has exceeded threshold');
      return new Response('Forbidden', { status: 403 });
    }

    connLogger.info({ model, endUserId, orgId }, 'WebSocket upgrade requested');

    // Create WebSocket pair for the client
    const pair = new WebSocketPair();
    const [clientSocket, serverSocket] = [pair[0], pair[1]];

    serverSocket.accept();

    // Connect to upstream in the background
    connectToUpstream({ model, connectionId, apiKey, logger })
      .then((upstream) => {
        connLogger.info('Client WebSocket connection established');
        setupRelay(
          serverSocket,
          upstream,
          { connectionId, endUserId, orgId, email, name, conversationId, model, feature },
          usageStore,
          logger,
          relayHooks
        );
      })
      .catch((err) => {
        connLogger.error({ error: String(err) }, 'Failed to connect to upstream');
        serverSocket.close(4502, 'Bad Gateway');
      });

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  } catch (error) {
    connLogger.error({ error: String(error) }, 'Error handling upgrade');
    return new Response('Internal Server Error', { status: 500 });
  }
}
