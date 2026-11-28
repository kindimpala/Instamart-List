import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomId = (bytes = 16) => randomBytes(bytes).toString('base64url');

export function hmac(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function sha256b64url(input: string) {
  return createHash('sha256').update(input).digest('base64url');
}

/** Signs a JSON payload: base64url(payload).signature */
export function signPayload(secret: string, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

export function verifyPayload<T>(secret: string, token: string): T | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, hmac(secret, body))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
