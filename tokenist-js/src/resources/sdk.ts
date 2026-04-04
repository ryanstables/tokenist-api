import { HttpClient } from "../http";
import type {
  SdkCheckRequest,
  SdkCheckResponse,
  SdkRecordRequest,
  SdkLogRequest,
  StartConversationRequest,
  StartConversationResponse,
  UpdateConversationRequest,
  UpdateConversationResponse,
  EndConversationResponse,
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

  /**
   * Start a new conversation. Runs all guardrail checks (blocklist, thresholds,
   * tier quota) and returns a `conversationId` to use with subsequent
   * `updateConversation` calls.
   *
   * Returns `allowed: false` when the user is blocked or has exceeded their
   * configured thresholds — in that case no conversation is created.
   */
  startConversation(
    data: StartConversationRequest
  ): Promise<StartConversationResponse> {
    return this.http.post<StartConversationResponse>(
      "/sdk/conversations",
      data
    );
  }

  /**
   * Append a request turn, response turn, or both to an existing conversation.
   *
   * Call once per LLM exchange. Token counts and cost are extracted automatically
   * from the response payload and accumulated in the usage store.
   */
  updateConversation(
    conversationId: string,
    data: UpdateConversationRequest
  ): Promise<UpdateConversationResponse> {
    return this.http.patch<UpdateConversationResponse>(
      `/sdk/conversations/${conversationId}`,
      data
    );
  }

  /**
   * Mark a conversation as ended.
   *
   * Call this when the user's session is complete (e.g. the chat window closes
   * or a logical task finishes). No further updates can be made after this.
   */
  endConversation(conversationId: string): Promise<EndConversationResponse> {
    return this.http.post<EndConversationResponse>(
      `/sdk/conversations/${conversationId}/end`,
      {}
    );
  }
}
