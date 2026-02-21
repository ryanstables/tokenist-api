import { HttpClient } from "./http";
import { AuthResource } from "./resources/auth";
import { AdminResource } from "./resources/admin";
import { SdkResource } from "./resources/sdk";
import type { TokenistClientOptions } from "./types";

/**
 * Main entry point for the Tokenist Node.js client.
 *
 * @example
 * ```ts
 * import { TokenistClient } from "tokenist-js";
 *
 * const client = new TokenistClient({
 *   apiKey: "ug_your_api_key",
 *   baseUrl: "https://tokenist.example.com",
 * });
 *
 * // Check whether a user can make a request
 * const result = await client.sdk.check({
 *   userId: "user-123",
 *   model: "gpt-4o",
 *   requestType: "chat",
 * });
 *
 * // Retrieve usage for a specific end user
 * const usage = await client.admin.getUserUsage("user-123");
 * ```
 */
export class TokenistClient {
  /** Authentication and user account management. */
  readonly auth: AuthResource;
  /** Admin endpoints for user management, org analytics, logs, policies, and rules. */
  readonly admin: AdminResource;
  /** Server-side SDK endpoints for usage checking, recording, and logging. */
  readonly sdk: SdkResource;

  private readonly http: HttpClient;

  constructor(options: TokenistClientOptions) {
    if (!options.apiKey) {
      throw new Error("TokenistClient: apiKey is required");
    }
    if (!options.baseUrl) {
      throw new Error("TokenistClient: baseUrl is required");
    }

    this.http = new HttpClient(options.baseUrl, options.apiKey);

    this.auth = new AuthResource(this.http);
    this.admin = new AdminResource(this.http);
    this.sdk = new SdkResource(this.http);
  }

  /**
   * Manually set a JWT token to use for auth-protected endpoints.
   *
   * This is set automatically after a successful `auth.login()` or
   * `auth.register()` call. Use this method if you already hold a token (e.g.
   * loaded from a database or environment variable).
   */
  setAuthToken(token: string): void {
    this.http.setJwtToken(token);
  }

  /**
   * Clear the stored JWT token.
   * Subsequent calls to JWT-protected endpoints will throw until a new token
   * is set.
   */
  clearAuthToken(): void {
    this.http.setJwtToken(undefined);
  }

  /**
   * Return the currently stored JWT token, or `undefined` if none is set.
   */
  getAuthToken(): string | undefined {
    return this.http.getJwtToken();
  }
}
