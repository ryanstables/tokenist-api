import { HttpClient } from "./http";
import { AdminResource } from "./resources/admin";
import { SdkResource } from "./resources/sdk";
import type {
  TokenistClientOptions,
  SdkCheckRequest,
  SdkCheckResponse,
  SdkRecordRequest,
  SdkLogRequest,
} from "./types";

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
 * const result = await client.check({
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

  private readonly _sdk: SdkResource;

  constructor(options: TokenistClientOptions) {
    if (!options.apiKey) {
      throw new Error("TokenistClient: apiKey is required");
    }

    const baseUrl = options.baseUrl ?? "https://api.tokenist.dev";
    const http = new HttpClient(baseUrl, options.apiKey);

    this.admin = new AdminResource(http);
    this._sdk = new SdkResource(http);
  }

  /**
   * Check whether an end user is allowed to make a request before forwarding
   * it to OpenAI. Returns `allowed: false` when the user is blocked or has
   * exceeded their configured thresholds.
   */
  check(data: SdkCheckRequest): Promise<SdkCheckResponse> {
    return this._sdk.check(data);
  }

  /**
   * Record actual token usage after a request to OpenAI completes. Call this
   * after you have the real token counts from the API response to keep usage
   * totals accurate.
   */
  record(data: SdkRecordRequest): Promise<void> {
    return this._sdk.record(data);
  }

  /**
   * Log the full request and response payload for a completed OpenAI call.
   * Supports both Chat Completions and Realtime API message formats.
   */
  log(data: SdkLogRequest): Promise<void> {
    return this._sdk.log(data);
  }
}
