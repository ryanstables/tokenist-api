import * as jose from 'jose';

export interface JWTPayload {
  userId: string;
  email: string;
  orgId?: string;
}

export async function generateToken(
  payload: JWTPayload,
  secret: string,
  expiresIn: string = '7d'
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      orgId: payload.orgId as string | undefined,
    };
  } catch {
    return null;
  }
}
