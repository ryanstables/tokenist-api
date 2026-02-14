import type { EndUserIdentity } from '../types/user';

export interface IdentityResult {
  success: true;
  identity: EndUserIdentity;
}

export interface IdentityError {
  success: false;
  error: string;
  code: number;
}

export type ExtractIdentityResult = IdentityResult | IdentityError;

/**
 * Extracts end-user identity from request headers.
 * External headers (x-user-id etc.) are unchanged; internally we map to endUserId.
 */
export function extractIdentity(request: Request): ExtractIdentityResult {
  const endUserId = request.headers.get('x-user-id');

  if (!endUserId || endUserId.trim() === '') {
    return {
      success: false,
      error: 'Missing or invalid x-user-id header',
      code: 401,
    };
  }

  const orgId = request.headers.get('x-org-id');
  const email = request.headers.get('x-user-email');
  const name = request.headers.get('x-user-name');

  return {
    success: true,
    identity: {
      endUserId: endUserId.trim(),
      orgId: orgId ? orgId.trim() : undefined,
      email: email ? email.trim() : undefined,
      name: name ? name.trim() : undefined,
    },
  };
}
