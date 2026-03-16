/**
 * Retry a condition function until it returns a truthy value or the timeout
 * elapses. Useful for eventually-consistent assertions (e.g. waiting for
 * sentiment analysis labels to appear on a log entry).
 */
export async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const { intervalMs = 500, timeoutMs = 15000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null && result !== undefined) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`poll() timed out after ${timeoutMs}ms`);
}
