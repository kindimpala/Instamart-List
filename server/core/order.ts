/**
 * Order pipeline: list -> availability check (+ substitutions, price changes)
 * -> update_cart -> bill -> preview + one-time confirmation token.
 * Checkout happens only in confirmOrder(), reached only from POST /api/order/confirm.
 */
import { withAttribution } from '../../shared/brand.js';
import { computeBudget } from '../../shared/budget.js';
import type { Alternative, ListItem, OrderPreview, OrderResult, PriceChange, Substitution, TrackResult } from '../../shared/cards.js';
import type { CartData } from '../../shared/instamart.js';
import { parseBill } from './bill.js';
import { getConfig } from './config.js';
import { cartHash, consumeConfirmToken, ConfirmTokenError, issueConfirmToken, verifyConfirmToken } from './confirmToken.js';
import { randomId } from './crypto.js';
import type { InstamartService, RequestCtx } from './instamart.js';
import { getDraft, getLists, updateList } from './lists.js';
import { allVariants, cheaperOptions, findSubstitute } from './matching.js';
import { McpToolError } from './mcp/client.js';
import { keys } from './storage/index.js';
import { STUB_HOME } from '../../stub/server.js';

export class OrderError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface WorkingLine extends ListItem {}

interface StoredPreview {
  preview: Omit<OrderPreview, 'confirmToken' | 'expiresAt'>;
  uid: string;
  jti: string;
  working: WorkingLine[];
  alternatives: Record<string, Alternative[]>;
  budgetLimit: number | null;
  createdAt: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const paymentLabel = (cart: CartData) => cart.availablePaymentMethods?.[0] ?? null;

async function finalisePreview(
  ctx: RequestCtx,
  stored: Omit<StoredPreview, 'preview' | 'jti' | 'createdAt'> & { previewId: string; source: OrderPreview['source']; address: OrderPreview['address']; substitutions: Substitution[]; priceChanges: PriceChange[]; unavailable: OrderPreview['unavailable'] },
  cart: CartData,
): Promise<OrderPreview> {
  const warnings: string[] = [];
  let working = stored.working;
  let { substitutions, unavailable } = stored;
  for (const r of cart.removedOutOfStockItems ?? []) {
    const line = working.find((w) => w.spinId === r.spinId);
    working = working.filter((w) => w.spinId !== r.spinId);
    substitutions = substitutions.filter((s) => s.substitute.spinId !== r.spinId);
    unavailable = [...unavailable, { name: r.itemName, size: line?.size ?? '', reason: 'Out of stock' }];
  }
  for (const r of cart.reducedQuantityItems ?? []) {
    warnings.push(`${r.itemName}: quantity reduced from ${r.requestedQuantity} to ${r.cappedQuantity}${r.reason ? ` (${r.reason})` : ''}.`);
  }
  if (cart.cartWarning) warnings.push(cart.cartWarning);
  const bill = parseBill(cart.billBreakdown);
  if (!bill) throw new OrderError(502, 'no_bill', 'Instamart did not return a bill for this cart. Please try again.');
  if (!cart.items.length) throw new OrderError(409, 'empty_cart', 'None of the items in this list can be delivered right now.');

  const budget =
    stored.budgetLimit !== null
      ? computeBudget(
          stored.budgetLimit,
          bill.toPay,
          working.map((w) => ({ ...w, alternatives: stored.alternatives[w.spinId] ?? [] })),
          'bill',
        )
      : null;

  const preview: StoredPreview['preview'] = {
    previewId: stored.previewId,
    source: stored.source,
    items: cart.items.map((i) => ({ spinId: i.spinId, name: i.itemName, size: i.itemVariant ?? '', quantity: i.quantity, lineTotal: i.discountedFinalPrice })),
    address: stored.address,
    payment: paymentLabel(cart),
    bill,
    substitutions,
    priceChanges: stored.priceChanges.filter((p) => working.some((w) => w.spinId === p.spinId)),
    unavailable,
    warnings,
    budget,
  };
  const { token, claims } = issueConfirmToken(ctx.uid, stored.previewId, cartHash(cart));
  const record: StoredPreview = {
    preview,
    uid: ctx.uid,
    jti: claims.jti,
    working,
    alternatives: stored.alternatives,
    budgetLimit: stored.budgetLimit,
    createdAt: Date.now(),
  };
  await ctx.storage.set(keys.preview(ctx.uid, stored.previewId), record);
  return { ...preview, confirmToken: token, expiresAt: new Date(claims.exp).toISOString() };
}

export async function prepareOrder(
  ctx: RequestCtx,
  svc: InstamartService,
  input: { listId?: string; draftId?: string; budget?: number | null },
): Promise<OrderPreview> {
  let source: OrderPreview['source'];
  let items: ListItem[];
  let listBudget: number | null = null;
  if (input.listId) {
    const list = (await getLists(ctx.storage, ctx.uid)).find((l) => l.id === input.listId);
    if (!list) throw new OrderError(404, 'not_found', 'List not found.');
    source = { kind: 'list', id: list.id, name: `${list.badge} · ${list.name}` };
    items = list.items;
    listBudget = list.budget;
  } else if (input.draftId) {
    const d = await getDraft(ctx.storage, ctx.uid, input.draftId);
    source = { kind: 'draft', id: d.id, name: d.suggestedName ?? 'Your items' };
    items = d.items;
    listBudget = d.budget;
  } else throw new OrderError(400, 'bad_request', 'Choose a list to order.');
  if (!items.length) throw new OrderError(409, 'empty_list', 'This list is empty.');

  const addr = await svc.getDefaultAddress();
  const address = { id: addr.id, label: addr.addressTag ?? addr.addressCategory ?? 'Delivery address', line: addr.addressLine };
  const searches = await mapLimit(items, 4, (it) => svc.search(it.name, addr.id));

  const working: WorkingLine[] = [];
  const substitutions: Substitution[] = [];
  const priceChanges: PriceChange[] = [];
  const unavailable: OrderPreview['unavailable'] = [];
  const alternatives: Record<string, Alternative[]> = {};

  items.forEach((item, idx) => {
    const data = searches[idx];
    const hit = allVariants(data).find((x) => x.v.spinId === item.spinId);
    if (hit && hit.v.isInStockAndAvailable) {
      const price = hit.v.price.offerPrice;
      if (price !== item.price) priceChanges.push({ spinId: item.spinId, name: item.name, size: item.size, oldPrice: item.price, newPrice: price });
      working.push({ ...item, price });
      alternatives[item.spinId] = cheaperOptions(data, { spinId: item.spinId, price });
      return;
    }
    const sub = findSubstitute(data, item);
    if (sub && !working.some((w) => w.spinId === sub.spinId)) {
      substitutions.push({ originalSpinId: item.spinId, originalName: item.name, originalSize: item.size, substitute: sub, quantity: item.quantity });
      working.push({ spinId: sub.spinId, productId: sub.productId, name: sub.name, size: sub.size, quantity: item.quantity, price: sub.price });
      alternatives[sub.spinId] = cheaperOptions(data, sub);
    } else {
      unavailable.push({ name: item.name, size: item.size, reason: hit ? 'Out of stock' : 'Not available at your address' });
    }
  });
  if (!working.length) throw new OrderError(409, 'nothing_available', 'None of the items in this list are available right now.');

  const cart = await svc.updateCart(addr.id, working.map((w) => ({ spinId: w.spinId, quantity: w.quantity })));
  return finalisePreview(
    ctx,
    {
      previewId: `p_${randomId(9)}`,
      source,
      address,
      substitutions,
      priceChanges,
      unavailable,
      uid: ctx.uid,
      working,
      alternatives,
      budgetLimit: input.budget ?? listBudget,
    },
    cart,
  );
}

async function loadPreview(ctx: RequestCtx, previewId: string): Promise<StoredPreview> {
  const p = await ctx.storage.get<StoredPreview>(keys.preview(ctx.uid, previewId));
  if (!p) throw new OrderError(410, 'preview_gone', 'This bill preview has expired. Please start the order again.');
  return p;
}

export type AdjustAction =
  | { type: 'remove'; spinId: string }
  | { type: 'replace'; fromSpinId: string; toSpinId: string }
  | { type: 'budget'; limit: number | null };

export async function adjustOrder(ctx: RequestCtx, svc: InstamartService, previewId: string, action: AdjustAction): Promise<OrderPreview> {
  const stored = await loadPreview(ctx, previewId);
  // Invalidate the old confirmation token: the bill is about to change.
  await ctx.storage.set(keys.usedConfirm(stored.jti), { usedAt: Date.now(), reason: 'superseded' });
  let working = [...stored.working];
  let substitutions = [...stored.preview.substitutions];
  let budgetLimit = stored.budgetLimit;
  if (action.type === 'remove') {
    working = working.filter((w) => w.spinId !== action.spinId);
    substitutions = substitutions.filter((s) => s.substitute.spinId !== action.spinId);
  } else if (action.type === 'replace') {
    const alt = (stored.alternatives[action.fromSpinId] ?? []).find((a) => a.spinId === action.toSpinId);
    const idx = working.findIndex((w) => w.spinId === action.fromSpinId);
    if (!alt || idx < 0) throw new OrderError(400, 'bad_replacement', 'That replacement is no longer available.');
    working[idx] = { spinId: alt.spinId, productId: alt.productId, name: alt.name, size: alt.size, price: alt.price, quantity: working[idx].quantity };
    stored.alternatives[alt.spinId] = (stored.alternatives[action.fromSpinId] ?? []).filter((a) => a.price < alt.price);
  } else {
    budgetLimit = action.limit;
  }
  if (!working.length) {
    await svc.clearCart();
    await ctx.storage.delete(keys.preview(ctx.uid, previewId));
    throw new OrderError(409, 'empty_cart', 'All items were removed, so I cleared the cart.');
  }
  const addr = stored.preview.address;
  const cart = await svc.updateCart(addr.id, working.map((w) => ({ spinId: w.spinId, quantity: w.quantity })));
  return finalisePreview(
    ctx,
    {
      previewId,
      source: stored.preview.source,
      address: addr,
      substitutions,
      priceChanges: stored.preview.priceChanges,
      unavailable: stored.preview.unavailable,
      uid: ctx.uid,
      working,
      alternatives: stored.alternatives,
      budgetLimit,
    },
    cart,
  );
}

export async function cancelOrder(ctx: RequestCtx, svc: InstamartService, previewId: string) {
  const stored = await ctx.storage.get<StoredPreview>(keys.preview(ctx.uid, previewId));
  if (stored) await ctx.storage.set(keys.usedConfirm(stored.jti), { usedAt: Date.now(), reason: 'cancelled' });
  await ctx.storage.delete(keys.preview(ctx.uid, previewId));
  await svc.clearCart();
}

/** The ONLY code path that calls checkout. */
export async function confirmOrder(
  ctx: RequestCtx,
  svc: InstamartService,
  input: { token?: unknown; acceptedSubstitutions?: string[] },
): Promise<OrderResult> {
  let claims;
  try {
    claims = await verifyConfirmToken(ctx.storage, input.token, ctx.uid);
  } catch (e) {
    if (e instanceof ConfirmTokenError) throw new OrderError(e.code === 'used' ? 409 : 403, `confirm_${e.code}`, e.message);
    throw e;
  }
  const stored = await loadPreview(ctx, claims.pid);
  if (stored.jti !== claims.jti) throw new OrderError(409, 'confirm_superseded', 'The bill changed. Please review the latest bill.');
  const accepted = new Set(input.acceptedSubstitutions ?? []);
  const pending = stored.preview.substitutions.filter((s) => !accepted.has(s.substitute.spinId));
  if (pending.length) throw new OrderError(409, 'substitutions_pending', 'Please accept or remove the substituted items first.');

  const cart = await svc.getCart();
  if (cartHash(cart) !== claims.ch) throw new OrderError(409, 'cart_changed', 'Your cart or bill changed since the preview. Please review it again.');

  await consumeConfirmToken(ctx.storage, claims); // consume before checkout: never place twice
  let result;
  try {
    result = await svc.checkout(stored.preview.address.id, stored.preview.payment ?? undefined);
  } catch (e) {
    if (e instanceof McpToolError) throw new OrderError(502, 'checkout_failed', `Instamart couldn’t place the order: ${e.message}`);
    throw e;
  }
  const { data, message } = result;
  await ctx.storage.delete(keys.preview(ctx.uid, claims.pid));
  if (stored.preview.source.kind === 'list') {
    await updateList(ctx.storage, ctx.uid, stored.preview.source.id, (l) => {
      l.lastOrderedAt = new Date().toISOString();
    }).catch(() => undefined);
  }
  await ctx.storage.set(keys.lastOrder(ctx.uid), { orderId: data.orderId, items: stored.working, at: Date.now() });

  const etaText = typeof (data as any).etaText === 'string' && (data as any).etaText ? String((data as any).etaText) : null;
  const serviceMsg = (message ?? 'Instamart order placed successfully').replace(/\.$/, '');
  return {
    orderId: data.orderId,
    status: data.status,
    paymentMethod: data.paymentMethod,
    total: typeof data.cartTotal === 'number' ? data.cartTotal : null,
    addressLine: data.deliveryAddress ?? stored.preview.address.line,
    etaText,
    message: withAttribution(`${serviceMsg}. Order ID: ${data.orderId}.${etaText ? ` Arriving in ${etaText}.` : ''}`),
    source: stored.preview.source,
    offerSaveAsList: stored.preview.source.kind === 'draft' || stored.preview.substitutions.length > 0,
  };
}

export async function trackOrder(_ctx: RequestCtx, svc: InstamartService, orderId: string): Promise<TrackResult> {
  const cfg = getConfig();
  const coords = cfg.trackCoords ?? (cfg.mode === 'stub' ? { lat: STUB_HOME.lat, lng: STUB_HOME.lng } : null);
  if (coords) {
    const t = await svc.track(orderId, coords.lat, coords.lng);
    return {
      orderId: t.orderId,
      statusMessage: t.status.statusMessage,
      subStatusMessage: t.status.subStatusMessage ?? null,
      etaText: t.status.etaText ?? (typeof t.status.etaMinutes === 'number' ? `${t.status.etaMinutes} mins` : null),
    };
  }
  // No coordinates available: fall back to order history status.
  const orders = await svc.call<{ orders: Array<{ orderId: string; currentStatus: string; statusMessage?: string; estimatedDeliveryTime?: string }> }>('get_orders', { activeOnly: true });
  const o = orders.orders.find((x) => x.orderId === orderId);
  if (!o) throw new OrderError(404, 'order_not_found', 'I couldn’t find that order.');
  return { orderId, statusMessage: o.statusMessage ?? o.currentStatus, subStatusMessage: null, etaText: o.estimatedDeliveryTime ?? null };
}

export async function lastOrderItems(ctx: RequestCtx): Promise<ListItem[] | null> {
  const lo = await ctx.storage.get<{ items: ListItem[] }>(keys.lastOrder(ctx.uid));
  return lo?.items ?? null;
}
