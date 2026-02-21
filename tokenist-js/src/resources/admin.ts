import { HttpClient } from "../http";
import type {
  EndUserRecord,
  ListUsersResponse,
  UserDetailsResponse,
  BlockEntry,
  BlockUserRequest,
  ListBlockedResponse,
  ListOrgBlockedResponse,
  SetThresholdRequest,
  OrgSummary,
  OrgSummaryOptions,
  OrgEndUser,
  RequestLog,
  ListLogsOptions,
  ListLogsResponse,
  Policy,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  Rule,
  ListRulesResponse,
  CreateRuleRequest,
  UpdateRuleRequest,
  ListRulesOptions,
  RuleHistoryEntry,
  ListRuleHistoryResponse,
  RuleTrigger,
  ListRuleTriggersResponse,
} from "../types";

// Re-export so consumers can import from the resource directly if needed.
export type { EndUserRecord };

/**
 * Admin endpoints for user management, org analytics, logs, policies, and rules.
 *
 * All requests are authenticated with the API key provided to the client
 * constructor.
 */
export class AdminResource {
  constructor(private readonly http: HttpClient) {}

  // ─── Users ────────────────────────────────────────────────────────────────

  /**
   * List all end users with their current usage data.
   * Returns `{ users: EndUserRecord[] }`.
   */
  listUsers(): Promise<ListUsersResponse> {
    return this.http.get<ListUsersResponse>("/admin/users");
  }

  /**
   * Get detailed usage, threshold, and block status for a specific end user.
   */
  getUserUsage(userId: string): Promise<UserDetailsResponse> {
    return this.http.get<UserDetailsResponse>(
      `/admin/users/${encodeURIComponent(userId)}/usage`
    );
  }

  /**
   * Block an end user, optionally with a reason and/or expiration date.
   */
  blockUser(userId: string, data?: BlockUserRequest): Promise<void> {
    return this.http.post<void>(
      `/admin/users/${encodeURIComponent(userId)}/block`,
      data ?? {}
    );
  }

  /**
   * Remove a block on an end user.
   */
  unblockUser(userId: string): Promise<void> {
    return this.http.post<void>(
      `/admin/users/${encodeURIComponent(userId)}/unblock`
    );
  }

  /**
   * Set custom usage thresholds for a specific end user.
   * Pass `null` values to clear a limit.
   */
  setUserThreshold(
    userId: string,
    threshold: SetThresholdRequest
  ): Promise<void> {
    return this.http.post<void>(
      `/admin/users/${encodeURIComponent(userId)}/threshold`,
      threshold
    );
  }

  /**
   * List all currently blocked end users.
   * Returns `{ blocked: BlockEntry[] }`.
   */
  listBlocked(): Promise<ListBlockedResponse> {
    return this.http.get<ListBlockedResponse>("/admin/blocked");
  }

  // ─── Orgs ──────────────────────────────────────────────────────────────────

  /**
   * Get aggregated usage summary for an organisation.
   *
   * @param orgId  Organisation identifier.
   * @param opts   Optional period filter: "daily" | "monthly" | "rolling_24h".
   */
  getOrgSummary(orgId: string, opts?: OrgSummaryOptions): Promise<OrgSummary> {
    return this.http.get<OrgSummary>(
      `/admin/orgs/${encodeURIComponent(orgId)}/summary`,
      opts?.period ? { period: opts.period } : undefined
    );
  }

  /**
   * List end users that appear in an organisation's request logs.
   * Returns `[{ id, displayName, email }]`.
   */
  listOrgUsers(orgId: string): Promise<OrgEndUser[]> {
    return this.http.get<OrgEndUser[]>(
      `/admin/orgs/${encodeURIComponent(orgId)}/users`
    );
  }

  /**
   * List blocked users within an organisation.
   * Returns `{ blocked: BlockEntry[], count: number }`.
   */
  listOrgBlocked(orgId: string): Promise<ListOrgBlockedResponse> {
    return this.http.get<ListOrgBlockedResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/blocked`
    );
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  /**
   * List paginated request logs for an organisation.
   */
  listOrgLogs(orgId: string, opts?: ListLogsOptions): Promise<ListLogsResponse> {
    return this.http.get<ListLogsResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/logs`,
      {
        limit: opts?.limit,
        offset: opts?.offset,
      }
    );
  }

  /**
   * Get a single request log entry by ID.
   */
  getOrgLog(orgId: string, logId: string): Promise<RequestLog> {
    return this.http.get<RequestLog>(
      `/admin/orgs/${encodeURIComponent(orgId)}/logs/${encodeURIComponent(logId)}`
    );
  }

  /**
   * List paginated request logs for a specific user within an organisation.
   */
  listUserLogs(
    orgId: string,
    userId: string,
    opts?: ListLogsOptions
  ): Promise<ListLogsResponse> {
    return this.http.get<ListLogsResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/logs`,
      {
        limit: opts?.limit,
        offset: opts?.offset,
      }
    );
  }

  // ─── Policies ─────────────────────────────────────────────────────────────

  /**
   * List all policies for an organisation.
   */
  listPolicies(orgId: string): Promise<Policy[]> {
    return this.http.get<Policy[]>(
      `/admin/orgs/${encodeURIComponent(orgId)}/policies`
    );
  }

  /**
   * Create a new policy within an organisation.
   * Both `name` and `description` are required by the API.
   */
  createPolicy(orgId: string, data: CreatePolicyRequest): Promise<Policy> {
    return this.http.post<Policy>(
      `/admin/orgs/${encodeURIComponent(orgId)}/policies`,
      data
    );
  }

  /**
   * Update an existing policy.
   */
  updatePolicy(
    orgId: string,
    policyId: string,
    data: UpdatePolicyRequest
  ): Promise<Policy> {
    return this.http.put<Policy>(
      `/admin/orgs/${encodeURIComponent(orgId)}/policies/${encodeURIComponent(policyId)}`,
      data
    );
  }

  /**
   * Delete a policy.
   */
  deletePolicy(orgId: string, policyId: string): Promise<void> {
    return this.http.delete<void>(
      `/admin/orgs/${encodeURIComponent(orgId)}/policies/${encodeURIComponent(policyId)}`
    );
  }

  // ─── Rules ────────────────────────────────────────────────────────────────

  /**
   * List rules for an organisation, with optional filters.
   * Returns `{ rules: Rule[], total: number }`.
   */
  listRules(orgId: string, opts?: ListRulesOptions): Promise<ListRulesResponse> {
    return this.http.get<ListRulesResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules`,
      {
        subjectType: opts?.subjectType,
        restrictionType: opts?.restrictionType,
        enabled: opts?.enabled,
      }
    );
  }

  /**
   * Create a new rule within an organisation.
   */
  createRule(orgId: string, data: CreateRuleRequest): Promise<Rule> {
    return this.http.post<Rule>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules`,
      data
    );
  }

  /**
   * Get a single rule by ID.
   */
  getRule(orgId: string, ruleId: string): Promise<Rule> {
    return this.http.get<Rule>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}`
    );
  }

  /**
   * Update an existing rule.
   */
  updateRule(
    orgId: string,
    ruleId: string,
    data: UpdateRuleRequest
  ): Promise<Rule> {
    return this.http.put<Rule>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}`,
      data
    );
  }

  /**
   * Enable or disable a rule.
   *
   * @param enabled  Pass `true` to enable, `false` to disable.
   *
   * The API requires `{ enabled }` in the request body and returns 400 if it
   * is absent.
   */
  toggleRule(orgId: string, ruleId: string, enabled: boolean): Promise<Rule> {
    return this.http.patch<Rule>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/toggle`,
      { enabled }
    );
  }

  /**
   * Delete a rule.
   */
  deleteRule(orgId: string, ruleId: string): Promise<void> {
    return this.http.delete<void>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}`
    );
  }

  /**
   * Get the change history for a rule.
   * Returns `{ entries: RuleHistoryEntry[], total: number }`.
   */
  getRuleHistory(orgId: string, ruleId: string): Promise<ListRuleHistoryResponse> {
    return this.http.get<ListRuleHistoryResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/history`
    );
  }

  /**
   * Get the trigger events for a rule.
   * Returns `{ events: RuleTrigger[], total: number }`.
   */
  getRuleTriggers(orgId: string, ruleId: string): Promise<ListRuleTriggersResponse> {
    return this.http.get<ListRuleTriggersResponse>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/triggers`
    );
  }
}
