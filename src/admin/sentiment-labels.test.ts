import { describe, it, expect } from 'vitest';
import { createAdminRoutes } from './routes';
import {
  createInMemoryUsageStore,
  createInMemoryBlocklist,
  createInMemoryUserStore,
  createInMemoryApiKeyStore,
  createInMemoryRequestLogStore,
  createInMemoryPricingStore,
  createInMemoryLabelStore,
} from '../storage/memory';
import { createLogger } from '../logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const JWT_SECRET = 'test-secret';

function createTestApp() {
  return createAdminRoutes({
    usageStore: createInMemoryUsageStore(),
    blocklist: createInMemoryBlocklist(),
    userStore: createInMemoryUserStore(),
    apiKeyStore: createInMemoryApiKeyStore(),
    requestLogStore: createInMemoryRequestLogStore(),
    sentimentLabelStore: createInMemoryLabelStore(),
    pricingStore: createInMemoryPricingStore(),
    logger: createLogger('error'),
    jwtSecret: JWT_SECRET,
  });
}

describe('GET /admin/orgs/:orgId/sentiment-labels', () => {
  it('returns 200 with 7 default labels', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels')
    );

    expect(res.status).toBe(200);
    const body: Json = await res.json();
    expect(Array.isArray(body.labels)).toBe(true);
    expect(body.labels).toHaveLength(7);
  });
});

describe('POST /admin/orgs/:orgId/sentiment-labels', () => {
  it('creates a label and returns 201', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'custom-label',
          displayName: 'Custom Label',
          description: 'A custom sentiment label for testing',
          color: '#ff5733',
          sortOrder: 10,
        }),
      })
    );

    expect(res.status).toBe(201);
    const body: Json = await res.json();
    expect(body.name).toBe('custom-label');
    expect(body.displayName).toBe('Custom Label');
    expect(body.color).toBe('#ff5733');
    expect(body.orgId).toBe('org-1');
    expect(body.id).toBeTruthy();
  });

  it('returns 400 for invalid color (not a hex)', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'bad-label',
          displayName: 'Bad Label',
          description: 'Testing invalid color',
          color: 'not-a-hex',
          sortOrder: 0,
        }),
      })
    );

    expect(res.status).toBe(400);
    const body: Json = await res.json();
    expect(body.error).toBeTruthy();
  });
});

describe('PUT /admin/orgs/:orgId/sentiment-labels/:labelId', () => {
  it('updates display name and returns 200', async () => {
    const app = createTestApp();

    // First create a label
    const createRes = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'update-me',
          displayName: 'Original Name',
          description: 'Will be updated',
          color: '#aabbcc',
          sortOrder: 5,
        }),
      })
    );
    const created: Json = await createRes.json();
    const labelId = created.id;

    // Now update it
    const updateRes = await app.fetch(
      new Request(`http://localhost/admin/orgs/org-1/sentiment-labels/${labelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Updated Name' }),
      })
    );

    expect(updateRes.status).toBe(200);
    const body: Json = await updateRes.json();
    expect(body.displayName).toBe('Updated Name');
    expect(body.name).toBe('update-me');
  });

  it('returns 404 for unknown label id', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels/nonexistent-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'New Name' }),
      })
    );

    expect(res.status).toBe(404);
    const body: Json = await res.json();
    expect(body.error).toBe('not found');
  });
});

describe('DELETE /admin/orgs/:orgId/sentiment-labels/:labelId', () => {
  it('deletes a label and returns 200 with { ok: true }', async () => {
    const app = createTestApp();

    // First create a label to delete
    const createRes = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'delete-me',
          displayName: 'Delete Me',
          description: 'Will be deleted',
          color: '#123456',
          sortOrder: 99,
        }),
      })
    );
    const created: Json = await createRes.json();
    const labelId = created.id;

    // Now delete it
    const deleteRes = await app.fetch(
      new Request(`http://localhost/admin/orgs/org-1/sentiment-labels/${labelId}`, {
        method: 'DELETE',
      })
    );

    expect(deleteRes.status).toBe(200);
    const body: Json = await deleteRes.json();
    expect(body.ok).toBe(true);
  });

  it('returns 404 for unknown label id', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/admin/orgs/org-1/sentiment-labels/nonexistent-id', {
        method: 'DELETE',
      })
    );

    expect(res.status).toBe(404);
    const body: Json = await res.json();
    expect(body.error).toBe('not found');
  });
});
