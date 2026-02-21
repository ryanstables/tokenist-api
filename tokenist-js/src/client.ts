import { HttpClient } from "./http";
import { AdminResource } from "./resources/admin";
import { SdkResource } from "./resources/sdk";
import type { TokenistClientOptions } from "./types";

/**
 * Main entry point for the Tokenist Node.js client.
 *
 * Initialise with an API key generated from your Tokenist dashboard and the
 * base URL of your deployment.
 *
 * @example
 * ```ts
 * import { TokenistClient } from "tokenist-js";
 *
 * const client = new TokenistClient({
 *   apiKey:  "ug_your_api_key",
 *   baseUrl: "https://tokenist.example.com",
 * });
 *
 * // Check whether a user can make a request
 * const result = await client.sdk.check({
 *   userId:      "user-123",
 *   model:       "gpt-4o",
 *   requestType: "chat",
 * });
 *
 * // Retrieve usage for a specific end user
 * const usage = await client.admin.getUserUsage("user-123");
 * ```
 */
export class TokenistClient {
  /** Admin endpoints: user management, org analytics, logs, policies, and rules. */
  readonly admin: AdminResource;
  /** SDK endpoints: usage checking, recording, and request logging. */
  readonly sdk: SdkResource;

  constructor(options: TokenistClientOptions) {
    if (!options.apiKey) {
      throw new Error("TokenistClient: apiKey is required");
    }
    if (!options.baseUrl) {
      throw new Error("TokenistClient: baseUrl is required");
    }

    const http = new HttpClient(options.baseUrl, options.apiKey);

    this.admin = new AdminResource(http);
    this.sdk = new SdkResource(http);
  }
}
