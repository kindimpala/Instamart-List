/** End-to-end API flow through the shared core in stub mode (no network). */
import { beforeAll, describe, expect, it } from 'vitest';
import { handle, type CoreRequest } from '../../server/core/app';
import { MemoryStorage, setStorage } from '../../server/core/storage';
import { resetConfig } from '../../server/core/config';
import { ATTRIBUTION_TEXT } from '../../shared/brand';

let cookie = '';
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const [p, q] = path.split('?');
  const req: CoreRequest = {
    method,
    path: p,
    query: new URLSearchParams(q ?? ''),
    headers: { cookie, 'x-requested-with': 'instamart-lists', ...extra },
    body,
    ip: '127.0.0.1',
  };
  const res = await handle(req);
  const set = res.cookies.find((c) => c.startsWith('iml_sid='));
  if (set) cookie = set.split(';')[0];
  return res;
}

beforeAll(() => {
  process.env.SWIGGY_MODE = 'stub';
  delete process.env.ANTHROPIC_API_KEY;
  resetConfig();
  setStorage(new MemoryStorage());
});

describe('API (stub mode, rules agent)', () => {
  it('requires the welcome step before using the API', async () => {
    const s = await call('GET', '/api/session');
    expect((s.json as any).signedIn).toBe(false);
    expect((await call('GET', '/api/lists')).status).toBe(401);
    const login = await call('GET', '/auth/login');
    expect(login.status).toBe(302);
    expect(((await call('GET', '/api/session')).json as any).signedIn).toBe(true);
  });

  it('blocks POSTs without the CSRF header', async () => {
    const res = await handle({ method: 'POST', path: '/api/chat', query: new URLSearchParams(), headers: { cookie }, body: { message: 'hi' }, ip: '1' });
    expect(res.status).toBe(403);
  });

  it('validates input', async () => {
    expect((await call('POST', '/api/chat', { message: '' })).status).toBe(400);
    expect((await call('POST', '/api/order/prepare', {})).status).toBe(400);
  });

  let listId = '';
  it('creates L1 from a sentence', async () => {
    const r = await call('POST', '/api/chat', { message: 'Create a list with milk, bread, 6 eggs and 1kg atta' });
    const card = (r.json as any).cards.find((c: any) => c.type === 'found_items');
    expect(card.items).toHaveLength(4);
    expect(card.badge).toBe('L1');
    const save = await call('POST', `/api/drafts/${card.draftId}/save`, {});
    listId = (save.json as any).list.id;
    expect((save.json as any).list.badge).toBe('L1');
  });

  it('edits L1 via chat with a diff, applies and undoes', async () => {
    const r = await call('POST', '/api/chat', { message: 'Add 2 bananas to L1, remove eggs, make milk 2' });
    const diff = (r.json as any).cards.find((c: any) => c.type === 'diff');
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.changed[0]).toMatchObject({ from: 1, to: 2 });
    const applied = await call('POST', `/api/edits/${diff.editId}/apply`);
    expect((applied.json as any).list.items).toHaveLength(4);
    const undone = await call('POST', `/api/edits/${diff.editId}/undo`);
    expect((undone.json as any).list.items.some((i: any) => /Eggs/.test(i.name))).toBe(true);
    const again = await call('POST', '/api/chat', { message: 'add 2 bananas to L1' });
    const d2 = (again.json as any).cards.find((c: any) => c.type === 'diff');
    await call('POST', `/api/edits/${d2.editId}/apply`);
  });

  it('rejects confirm without a token, with a forged token', async () => {
    const r1 = await call('POST', '/api/order/confirm', {});
    expect(r1.status).toBe(403);
    expect((r1.json as any).error).toBe('confirm_missing');
    const r2 = await call('POST', '/api/order/confirm', { token: 'abc.def' });
    expect(r2.status).toBe(403);
  });

  it('orders L1 with oos + price + surge, handles substitution and confirms', async () => {
    const flags = { 'x-stub-flags': 'oos,price,surge,eta' };
    const prep = await call('POST', '/api/order/prepare', { listId, budget: 100 }, flags);
    expect(prep.status).toBe(200);
    const p = (prep.json as any).preview;
    expect(p.substitutions.length).toBe(1);
    expect(p.priceChanges[0]).toMatchObject({ oldPrice: 49, newPrice: 52 });
    expect(p.bill.surgeFee).toBe(25);
    expect(p.budget.over).toBe(true);

    // pending substitution blocks confirm
    const blocked = await call('POST', '/api/order/confirm', { token: p.confirmToken }, flags);
    expect(blocked.status).toBe(409);
    expect((blocked.json as any).error).toBe('substitutions_pending');

    const ok = await call('POST', '/api/order/confirm', { token: p.confirmToken, acceptedSubstitutions: p.substitutions.map((s: any) => s.substitute.spinId) }, flags);
    expect(ok.status).toBe(200);
    const order = (ok.json as any).order;
    expect(order.orderId).toMatch(/^IM/);
    expect(order.message).toContain(ATTRIBUTION_TEXT);
    expect(order.etaText).toBe('12 mins');

    // single use
    const replay = await call('POST', '/api/order/confirm', { token: p.confirmToken, acceptedSubstitutions: p.substitutions.map((s: any) => s.substitute.spinId) }, flags);
    expect(replay.status).toBe(409);

    const track = await call('POST', '/api/order/track', { orderId: order.orderId }, flags);
    expect((track.json as any).track.etaText).toBe('12 mins');
  });

  it('hides ETA when the service omits it', async () => {
    const flags = { 'x-stub-flags': 'noeta' };
    const p = ((await call('POST', '/api/order/prepare', { listId }, flags)).json as any).preview;
    const order = ((await call('POST', '/api/order/confirm', { token: p.confirmToken }, flags)).json as any).order;
    expect(order.etaText).toBeNull();
  });

  it('cancel clears the cart and kills the token', async () => {
    const p = ((await call('POST', '/api/order/prepare', { listId })).json as any).preview;
    await call('POST', '/api/order/cancel', { previewId: p.previewId });
    const r = await call('POST', '/api/order/confirm', { token: p.confirmToken });
    expect(r.status).toBe(409);
  });

  it('exports list text with attribution', async () => {
    const r = await call('GET', `/api/lists/${listId}/export`);
    expect((r.json as any).text).toContain(ATTRIBUTION_TEXT);
  });

  it('deletes via chat only after explicit confirmation', async () => {
    const r = await call('POST', '/api/chat', { message: 'delete L1' });
    expect((r.json as any).cards[0].type).toBe('confirm_delete');
    expect(((await call('GET', '/api/lists')).json as any).lists).toHaveLength(1);
    await call('DELETE', `/api/lists/${listId}`);
    expect(((await call('GET', '/api/lists')).json as any).lists).toHaveLength(0);
  });
});
