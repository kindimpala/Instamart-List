import { beforeEach, describe, expect, it } from 'vitest';
import { cartHash, CONFIRM_TTL_MS, consumeConfirmToken, issueConfirmToken, verifyConfirmToken } from '../../server/core/confirmToken';
import { MemoryStorage } from '../../server/core/storage';

const cart = {
  items: [{ spinId: 'a', quantity: 1 }, { spinId: 'b', quantity: 2 }] as any,
  billBreakdown: { lineItems: [], toPay: { label: 'To Pay', value: '₹100' } },
};

describe('confirmation-token guard', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('accepts a valid token once', async () => {
    const { token } = issueConfirmToken('u1', 'p1', cartHash(cart));
    const claims = await verifyConfirmToken(storage, token, 'u1');
    expect(claims.pid).toBe('p1');
    await consumeConfirmToken(storage, claims);
    await expect(verifyConfirmToken(storage, token, 'u1')).rejects.toMatchObject({ code: 'used' });
  });

  it('rejects a missing token', async () => {
    await expect(verifyConfirmToken(storage, undefined, 'u1')).rejects.toMatchObject({ code: 'missing' });
    await expect(verifyConfirmToken(storage, '', 'u1')).rejects.toMatchObject({ code: 'missing' });
  });

  it('rejects a forged or tampered token', async () => {
    const { token } = issueConfirmToken('u1', 'p1', 'h');
    const [body] = token.split('.');
    await expect(verifyConfirmToken(storage, `${body}.forged`, 'u1')).rejects.toMatchObject({ code: 'invalid' });
    const evil = Buffer.from(JSON.stringify({ typ: 'order-confirm', jti: 'x', uid: 'u1', pid: 'p1', ch: 'h', exp: Date.now() + 1e9 })).toString('base64url');
    await expect(verifyConfirmToken(storage, `${evil}.${token.split('.')[1]}`, 'u1')).rejects.toMatchObject({ code: 'invalid' });
  });

  it("rejects another user's token", async () => {
    const { token } = issueConfirmToken('u1', 'p1', 'h');
    await expect(verifyConfirmToken(storage, token, 'u2')).rejects.toMatchObject({ code: 'wrong_user' });
  });

  it('rejects an expired token', async () => {
    const issuedAt = Date.now() - CONFIRM_TTL_MS - 1000;
    const { token } = issueConfirmToken('u1', 'p1', 'h', issuedAt);
    await expect(verifyConfirmToken(storage, token, 'u1')).rejects.toMatchObject({ code: 'expired' });
  });

  it('cart hash changes when quantities or totals change', () => {
    const h1 = cartHash(cart);
    expect(cartHash({ ...cart, items: [...cart.items].reverse() })).toBe(h1);
    expect(cartHash({ ...cart, items: [{ spinId: 'a', quantity: 2 }, { spinId: 'b', quantity: 2 }] as any })).not.toBe(h1);
    expect(cartHash({ ...cart, billBreakdown: { lineItems: [], toPay: { label: 'To Pay', value: '₹125' } } })).not.toBe(h1);
  });
});
