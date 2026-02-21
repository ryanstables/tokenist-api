import { HttpClient } from "../http";
import type {
  EndUserRecord,
  EndUserUsage,
  BlockEntry,
  BlockUserRequest,
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
  CreateRuleRequest,
  UpdateRuleRequest,
  ListRulesOptions,
  RuleHistoryEntry,
  RuleTrigger,
} from "../types";

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
   */
  listUsers(): Promise<EndUserRecord[]> {
    return this.http.get<EndUserRecord[]>("/admin/users");
  }

  /**
   * Get detailed usage for a specific end user.
   */
  getUserUsage(userId: string): Promise<EndUserUsage> {
    return this.http.get<EndUserUsage>(
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
   */
  listBlocked(): Promise<BlockEntry[]> {
    return this.http.get<BlockEntry[]>("/admin/blocked");
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
   * List all end users belonging to an organisation.
   */
  listOrgUsers(orgId: string): Promise<OrgEndUser[]> {
    return this.http.get<OrgEndUser[]>(
      `/admin/orgs/${encodeURIComponent(orgId)}/users`
    );
  }

  /**
   * List blocked users within an organisation.
   */
  listOrgBlocked(orgId: string): Promise<BlockEntry[]> {
    return this.http.get<BlockEntry[]>(
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
   */
  listRules(orgId: string, opts?: ListRulesOptions): Promise<Rule[]> {
    return this.http.get<Rule[]>(
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
   * Toggle a rule on or off.
   */
  toggleRule(orgId: string, ruleId: string): Promise<Rule> {
    return this.http.patch<Rule>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/toggle`
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
   */
  getRuleHistory(orgId: string, ruleId: string): Promise<RuleHistoryEntry[]> {
    return this.http.get<RuleHistoryEntry[]>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/history`
    );
  }

  /**
   * Get the trigger events for a rule.
   */
  getRuleTriggers(orgId: string, ruleId: string): Promise<RuleTrigger[]> {
    return this.http.get<RuleTrigger[]>(
      `/admin/orgs/${encodeURIComponent(orgId)}/rules/${encodeURIComponent(ruleId)}/triggers`
    );
  }
}
