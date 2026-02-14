import type { UserIdentity } from '../types/user';

export interface IdentityResult {
  success: true;
  identity: UserIdentity;
}

export interface IdentityError {
  success: false;
  error: string;
  code: number;
}

export type ExtractIdentityResult = IdentityResult | IdentityError;

export function extractIdentity(request: Request): ExtractIdentityResult {
  const userId = request.headers.get('x-user-id');

  if (!userId || userId.trim() === '') {
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
      userId: userId.trim(),
      orgId: orgId ? orgId.trim() : undefined,
      email: email ? email.trim() : undefined,
      name: name ? name.trim() : undefined,
    },
  };
}
