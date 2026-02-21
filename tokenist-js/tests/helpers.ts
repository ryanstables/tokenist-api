/**
 * Test helpers – simple fetch mock utilities.
 *
 * We mock the global `fetch` so that no real HTTP calls are made during tests.
 */

export interface MockResponse {
  status?: number;
  body?: unknown;
  contentType?: string;
}

/**
 * Install a mock `fetch` on `globalThis` that returns the given response for
 * the next call. Returns a jest spy so you can assert on it.
 */
export function mockFetch(response: MockResponse): jest.SpyInstance {
  const { status = 200, body = {}, contentType = "application/json" } = response;

  const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response);

  return spy;
}

/**
 * Assert that the mocked fetch was called with the expected URL and options.
 */
export function expectFetchCall(
  spy: jest.SpyInstance,
  expectedUrl: string,
  expectedOptions?: {
    method?: string;
    bodyContaining?: Record<string, unknown>;
    authHeader?: string;
  }
): void {
  expect(spy).toHaveBeenCalledTimes(1);
  const [url, options] = spy.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(expectedUrl);

  if (expectedOptions?.method) {
    expect(options.method).toBe(expectedOptions.method);
  }

  if (expectedOptions?.bodyContaining) {
    const parsed = JSON.parse(options.body as string);
    expect(parsed).toMatchObject(expectedOptions.bodyContaining);
  }

  if (expectedOptions?.authHeader) {
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(expectedOptions.authHeader);
  }
}
