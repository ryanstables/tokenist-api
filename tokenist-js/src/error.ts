/**
 * Thrown when the Tokenist API returns a non-2xx response.
 */
export class TokenistError extends Error {
  /** HTTP status code returned by the API. */
  readonly status: number;
  /** Raw response body from the API. */
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as Record<string, unknown>).error === "string"
        ? (body as Record<string, unknown>).error
        : `Tokenist API error (HTTP ${status})`;
    super(message as string);
    this.name = "TokenistError";
    this.status = status;
    this.body = body;
  }
}
