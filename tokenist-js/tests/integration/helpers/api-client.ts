import { TokenistClient } from "../../../src/client";

const BASE_URL = process.env.TOKENIST_BASE_URL ?? "http://localhost:8081";

export { BASE_URL };

export interface TestOrg {
  orgId: string;
  token: string;
  apiKey: string;
  client: TokenistClient;
}

/**
 * Registers a fresh platform user, creates an API key, and returns a
 * TokenistClient scoped to that user's org. Call once per describe block.
 *
 * Each call creates a unique org so test suites don't interfere with each other.
 */
export async function bootstrapTestOrg(label: string): Promise<TestOrg> {
  const email = `integration+${label}+${Date.now()}@test.local`;
  const password = "test-password-123";

  // 1. Register a platform user (creates the org)
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!regRes.ok) {
    throw new Error(`Register failed (${regRes.status}): ${await regRes.text()}`);
  }
  const reg = (await regRes.json()) as {
    user: { userId: string; orgId: string };
    token: string;
  };

  // 2. Create an API key using the JWT
  const keyRes = await fetch(`${BASE_URL}/auth/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${reg.token}`,
    },
    body: JSON.stringify({ name: `integration-test-${label}` }),
  });
  if (!keyRes.ok) {
    throw new Error(`API key creation failed (${keyRes.status}): ${await keyRes.text()}`);
  }
  const keyData = (await keyRes.json()) as { apiKey: string };

  const client = new TokenistClient({ apiKey: keyData.apiKey, baseUrl: BASE_URL });

  return {
    orgId: reg.user.orgId,
    token: reg.token,
    apiKey: keyData.apiKey,
    client,
  };
}
