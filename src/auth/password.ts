const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  const hash = await deriveKey(password, salt);
  return `${bufferToBase64(salt.buffer as ArrayBuffer)}:${bufferToBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;

  const salt = base64ToBuffer(saltB64);
  const expectedHash = base64ToBuffer(hashB64);
  const derivedHash = new Uint8Array(await deriveKey(password, salt));

  if (derivedHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHash.length; i++) {
    diff |= derivedHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}
