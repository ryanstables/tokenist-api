import { HttpClient } from "../http";
import type {
  SdkCheckRequest,
  SdkCheckResponse,
  SdkRecordRequest,
  SdkLogRequest,
} from "../types";

/**
 * Server-side SDK endpoints for integrating Tokenist into your own backend.
 *
 * These endpoints allow you to:
 * - Pre-check whether a user is allowed to make a request.
 * - Record actual token usage after a request completes.
 * - Log full request/response payloads for auditing.
 *
 * All requests are authenticated with the API key provided to the client
 * constructor.
 */
export class SdkResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Check whether an end user is allowed to make a request before forwarding
   * it to OpenAI.
   *
   * Returns `allowed: false` when the user is blocked or has exceeded their
   * configured thresholds.
   */
  check(data: SdkCheckRequest): Promise<SdkCheckResponse> {
    return this.http.post<SdkCheckResponse>("/sdk/check", data);
  }

  /**
   * Record actual token usage after a request to OpenAI completes.
   *
   * Call this after you have the real token counts from the API response to
   * keep usage totals accurate.
   */
  record(data: SdkRecordRequest): Promise<void> {
    return this.http.post<void>("/sdk/record", data);
  }

  /**
   * Log the full request and response payload for a completed OpenAI call.
   *
   * Supports both Chat Completions and Realtime API message formats.
   */
  log(data: SdkLogRequest): Promise<void> {
    return this.http.post<void>("/sdk/log", data);
  }
}
