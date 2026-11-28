/**
 * One-time confirmation tokens. Issued with a bill preview, required by
 * POST /api/order/confirm. The model never sees or produces these, so a model
 * reply alone can never place an order.
 */
import type { CartData } from '../../shared/instamart.js';
import { getConfig } from './config.js';
import { randomId, sha256b64url, signPayload, verifyPayload } from './crypto.js';
import { keys, type Storage } from './storage/index.js';

export interface ConfirmClaims {
  typ: 'order-confirm';
  jti: string;
  uid: string;
  pid: string; // previewId
  ch: string; // cart hash at preview time
  exp: number; // epoch ms
}

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

export class ConfirmTokenError extends Error {
  constructor(public code: 'missing' | 'invalid' | 'expired' | 'used' | 'wrong_user', message: string) {
    super(message);
  }
}

export function cartHash(cart: Pick<CartData, 'items' | 'billBreakdown'>): string {
  const lines = [...cart.items].map((i) => `${i.spinId}:${i.quantity}`).sort().join('|');
  return sha256b64url(`${lines}#${cart.billBreakdown?.toPay?.value ?? ''}`);
}

export function issueConfirmToken(uid: string, previewId: string, hash: string, now = Date.now()) {
  const claims: ConfirmClaims = { typ: 'order-confirm', jti: randomId(16), uid, pid: previewId, ch: hash, exp: now + CONFIRM_TTL_MS };
  return { token: signPayload(getConfig().sessionSecret, claims), claims };
}

/** Validates signature, owner, expiry and single use. Does not consume. */
export async function verifyConfirmToken(storage: Storage, token: unknown, uid: string, now = Date.now()): Promise<ConfirmClaims> {
  if (typeof token !== 'string' || !token) throw new ConfirmTokenError('missing', 'Order confirmation token is required. Tap “Confirm order” on a bill preview.');
  const claims = verifyPayload<ConfirmClaims>(getConfig().sessionSecret, token);
  if (!claims || claims.typ !== 'order-confirm') throw new ConfirmTokenError('invalid', 'This confirmation is not valid.');
  if (claims.uid !== uid) throw new ConfirmTokenError('wrong_user', 'This confirmation belongs to a different session.');
  if (claims.exp < now) throw new ConfirmTokenError('expired', 'This bill preview has expired. Please review the bill again.');
  if (await storage.get(keys.usedConfirm(claims.jti))) throw new ConfirmTokenError('used', 'This order was already confirmed or cancelled.');
  return claims;
}

export async function consumeConfirmToken(storage: Storage, claims: ConfirmClaims) {
  await storage.set(keys.usedConfirm(claims.jti), { usedAt: Date.now(), exp: claims.exp });
}
