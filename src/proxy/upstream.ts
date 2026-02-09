import type { Logger } from '../logger';

const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime';

export interface UpstreamOptions {
  model: string;
  connectionId: string;
  apiKey: string;
  logger: Logger;
}

export async function connectToUpstream(
  options: UpstreamOptions
): Promise<WebSocket> {
  const { model, connectionId, apiKey, logger } = options;
  const connLogger = logger.child({ component: 'upstream', connectionId });

  const url = `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(model)}`;
  connLogger.debug({ url }, 'Connecting to OpenAI upstream');

  const resp = await fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  const ws = resp.webSocket;
  if (!ws) {
    throw new Error(`Failed to establish WebSocket connection: ${resp.status}`);
  }

  ws.accept();

  connLogger.info('Connected to OpenAI upstream');

  ws.addEventListener('error', (event) => {
    connLogger.error({ error: (event as ErrorEvent).message ?? 'unknown' }, 'Upstream connection error');
  });

  ws.addEventListener('close', (event) => {
    connLogger.info(
      { code: event.code, reason: event.reason },
      'Upstream connection closed'
    );
  });

  return ws;
}
