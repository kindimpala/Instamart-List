/**
 * Agent tool executors. Shared by the LLM agent and the rules-based fallback.
 * Tools return compact JSON for the model and push structured UI cards.
 * NOTE: there is deliberately no checkout tool here.
 */
import { computeBudget } from '../../../shared/budget.js';
import type { Card, GroceryList, ListItem } from '../../../shared/cards.js';
import type { InstamartService, RequestCtx } from '../instamart.js';
import { createDraft, diffCard, getLists, nextBadge, proposeEdit, resolveList, sanitizeName, saveDraft } from '../lists.js';
import { pickVariant, type ItemRequest } from '../matching.js';
import { prepareOrder } from '../order.js';

export interface ToolEnv {
  ctx: RequestCtx;
  svc: () => Promise<InstamartService>;
  cards: Card[];
}

export class ToolUserError extends Error {}

export interface ItemSpec {
  query: string;
  quantity?: number;
  size?: string | null;
  max_price?: number | null;
  spin_id?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (w: string) => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

export function matchItem(items: ListItem[], ref: string): ListItem | undefined {
  const r = norm(ref);
  const words = r.split(' ').filter((w) => w.length > 1).map(singular);
  if (!words.length) return undefined;
  const scored = items
    .map((i) => {
      const hay = norm(`${i.name} ${i.size}`);
      const hits = words.filter((w) => hay.includes(w)).length;
      return { i, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.i;
}

async function resolveItems(env: ToolEnv, specs: ItemSpec[]) {
  const svc = await env.svc();
  const addr = await svc.getDefaultAddress();
  const results = await Promise.all(
    specs.map(async (s) => {
      const req: ItemRequest = { query: s.query, quantity: s.quantity ?? 1, size: s.size, maxPrice: s.max_price, spinId: s.spin_id };
      const data = await svc.search(s.query, addr.id);
      return { spec: s, item: pickVariant(data, req) };
    }),
  );
  return results;
}

function findList(lists: GroceryList[], ref: string | undefined): GroceryList {
  const l = resolveList(lists, ref);
  if (!l) {
    throw new ToolUserError(
      lists.length
        ? `I couldn’t find a list called “${ref ?? ''}”. Your lists: ${lists.map((x) => `${x.badge} (${x.name})`).join(', ')}.`
        : 'You don’t have any saved lists yet. Try “Create a list with milk, bread and eggs”.',
    );
  }
  return l;
}

export const toolImpls = {
  async search_products(env: ToolEnv, a: { query: string }) {
    const svc = await env.svc();
    const addr = await svc.getDefaultAddress();
    const data = await svc.search(a.query, addr.id);
    return {
      results: data.products.slice(0, 5).flatMap((p) =>
        p.variations.map((v) => ({ spin_id: v.spinId, name: p.displayName, size: v.quantityDescription, price: v.price.offerPrice, in_stock: v.isInStockAndAvailable })),
      ),
    };
  },

  async draft_list(env: ToolEnv, a: { name?: string; items: ItemSpec[]; budget?: number | null }) {
    if (!a.items?.length) throw new ToolUserError('Tell me what to put on the list, e.g. “milk, bread and 6 eggs”.');
    const resolved = await resolveItems(env, a.items.slice(0, 25));
    const items = resolved.filter((r) => r.item).map((r) => r.item!);
    const notFound = resolved.filter((r) => !r.item).map((r) => r.spec.query);
    const lists = await getLists(env.ctx.storage, env.ctx.uid);
    const budget = a.budget && a.budget > 0 ? a.budget : null;
    const draft = await createDraft(env.ctx.storage, env.ctx.uid, { suggestedName: sanitizeName(a.name), items, notFound, budget });
    const estimatedTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    env.cards.push({
      type: 'found_items',
      draftId: draft.id,
      suggestedName: draft.suggestedName ?? nextBadge(lists),
      badge: nextBadge(lists),
      items,
      estimatedTotal,
      notFound,
      budget: budget ? computeBudget(budget, estimatedTotal, items, 'estimate') : null,
    });
    return {
      draft_id: draft.id,
      items: items.map((i) => ({ name: i.name, size: i.size, qty: i.quantity, price: i.price, in_stock: i.inStock })),
      not_found: notFound,
      estimated_total: estimatedTotal,
      note: 'A card with Save / Discard buttons is shown to the user. Do not repeat the items in your reply.',
    };
  },

  async save_list(env: ToolEnv, a: { draft_id: string; name?: string }) {
    const list = await saveDraft(env.ctx.storage, env.ctx.uid, a.draft_id, { name: a.name });
    env.cards.push({ type: 'notice', tone: 'success', text: `Saved as ${list.badge} · ${list.name}` });
    return { saved: { badge: list.badge, name: list.name, items: list.items.length } };
  },

  async get_lists(env: ToolEnv) {
    const lists = await getLists(env.ctx.storage, env.ctx.uid);
    env.cards.push({ type: 'lists', lists });
    return { lists: lists.map((l) => ({ badge: l.badge, name: l.name, items: l.items.map((i) => `${i.quantity} x ${i.name} ${i.size}`), budget: l.budget })) };
  },

  async edit_list(
    env: ToolEnv,
    a: { list: string; add?: ItemSpec[]; remove?: string[]; set_quantity?: Array<{ item: string; quantity: number }>; rename?: string; budget?: number | null },
  ) {
    const lists = await getLists(env.ctx.storage, env.ctx.uid);
    const list = findList(lists, a.list);
    let items = list.items.map((i) => ({ ...i }));
    const problems: string[] = [];
    for (const ref of a.remove ?? []) {
      const hit = matchItem(items, ref);
      if (hit) items = items.filter((i) => i.spinId !== hit.spinId);
      else problems.push(`“${ref}” isn’t on ${list.badge}`);
    }
    for (const sq of a.set_quantity ?? []) {
      const hit = matchItem(items, sq.item);
      if (!hit) problems.push(`“${sq.item}” isn’t on ${list.badge}`);
      else if (sq.quantity <= 0) items = items.filter((i) => i.spinId !== hit.spinId);
      else hit.quantity = Math.min(20, Math.round(sq.quantity));
    }
    if (a.add?.length) {
      for (const r of await resolveItems(env, a.add)) {
        if (!r.item) {
          problems.push(`couldn’t find “${r.spec.query}”`);
          continue;
        }
        const existing = items.find((i) => i.spinId === r.item!.spinId);
        if (existing) existing.quantity = Math.min(20, existing.quantity + r.item.quantity);
        else items.push({ spinId: r.item.spinId, productId: r.item.productId, name: r.item.name, size: r.item.size, quantity: r.item.quantity, price: r.item.price });
      }
    }
    const name = sanitizeName(a.rename) ?? list.name;
    const budget = a.budget === undefined ? list.budget : a.budget && a.budget > 0 ? a.budget : null;
    const edit = await proposeEdit(env.ctx.storage, env.ctx.uid, list, { name, items, budget });
    const card = diffCard(edit, list);
    const changed = card.added.length + card.removed.length + card.changed.length + (card.rename ? 1 : 0) + (card.budgetChange ? 1 : 0);
    if (!changed) {
      env.cards.push({ type: 'notice', tone: 'info', text: problems.length ? `No changes: ${problems.join('; ')}.` : 'No changes to make.' });
      return { changed: false, problems };
    }
    env.cards.push(card);
    return {
      edit_id: edit.id,
      added: card.added.map((i) => i.name),
      removed: card.removed.map((i) => i.name),
      quantity_changes: card.changed.map((c) => `${c.item.name}: ${c.from} -> ${c.to}`),
      rename: card.rename,
      problems,
      note: 'A diff card with Apply changes / Undo is shown. Changes are NOT applied until the user taps Apply.',
    };
  },

  async delete_list(env: ToolEnv, a: { list: string }) {
    const lists = await getLists(env.ctx.storage, env.ctx.uid);
    const list = findList(lists, a.list);
    env.cards.push({ type: 'confirm_delete', listId: list.id, listName: list.name, badge: list.badge });
    return { pending_confirmation: true, note: 'The user must tap Yes on the inline confirmation. Nothing is deleted yet.' };
  },

  async prepare_order(env: ToolEnv, a: { list?: string; draft_id?: string; budget?: number | null }) {
    const svc = await env.svc();
    let listId: string | undefined;
    if (!a.draft_id) {
      const lists = await getLists(env.ctx.storage, env.ctx.uid);
      listId = findList(lists, a.list).id;
    }
    const preview = await prepareOrder(env.ctx, svc, { listId, draftId: a.draft_id, budget: a.budget ?? undefined });
    env.cards.push({ type: 'order_preview', preview });
    return {
      to_pay: preview.bill.toPayLabel,
      surge_fee: preview.bill.surgeFee,
      substitutions: preview.substitutions.map((s) => `${s.originalName} ${s.originalSize} -> ${s.substitute.name} ${s.substitute.size}`),
      price_changes: preview.priceChanges.map((p) => `${p.name}: ₹${p.oldPrice} -> ₹${p.newPrice}`),
      unavailable: preview.unavailable.map((u) => u.name),
      budget: preview.budget ? { limit: preview.budget.limit, over: preview.budget.over } : null,
      note: 'A bill preview card is shown. Only the user can place the order by tapping Confirm order. You cannot place orders.',
    };
  },

  async get_cart(env: ToolEnv) {
    const cart = await (await env.svc()).getCart();
    return { items: cart.items.map((i) => ({ name: i.itemName, size: i.itemVariant, qty: i.quantity })), to_pay: cart.billBreakdown?.toPay?.value };
  },

  async update_cart(env: ToolEnv, a: { items: Array<{ spin_id: string; quantity: number }> }) {
    const svc = await env.svc();
    const addr = await svc.getDefaultAddress();
    const cart = await svc.updateCart(addr.id, (a.items ?? []).map((i) => ({ spinId: i.spin_id, quantity: i.quantity })));
    return { items: cart.items.length, to_pay: cart.billBreakdown?.toPay?.value };
  },

  async clear_cart(env: ToolEnv) {
    await (await env.svc()).clearCart();
    return { cleared: true };
  },
};

export type ToolName = keyof typeof toolImpls;

const itemSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Product to search for, e.g. "toned milk", "atta"' },
    quantity: { type: 'integer', minimum: 1, maximum: 20 },
    size: { type: 'string', description: 'Requested pack size if the user said one, e.g. "1 kg", "500 ml", "12 pcs"' },
    max_price: { type: 'number', description: 'Max unit price in ₹ if the user asked for cheap options' },
    spin_id: { type: 'string', description: 'Exact spinId from search_products if you already picked a variant' },
  },
  required: ['query'],
};

export const TOOL_SCHEMAS = [
  { name: 'search_products', description: 'Search the Instamart catalogue at the user’s delivery address. Returns variants with spin_id, size, price and stock.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'draft_list', description: 'Build a new grocery list from items the user asked for. Picks the best variant by size and price and shows a "Found these for you" card with Save/Discard. Use for any "create/make a list" request.', input_schema: { type: 'object', properties: { name: { type: 'string', description: 'List name if the user gave one' }, items: { type: 'array', items: itemSchema }, budget: { type: 'number', description: 'Budget in ₹ if the user gave one' } }, required: ['items'] } },
  { name: 'save_list', description: 'Save a drafted list. Only when the user explicitly says to save it in chat.', input_schema: { type: 'object', properties: { draft_id: { type: 'string' }, name: { type: 'string' } }, required: ['draft_id'] } },
  { name: 'get_lists', description: 'Show the user’s saved lists.', input_schema: { type: 'object', properties: {} } },
  { name: 'edit_list', description: 'Propose edits to a saved list (add items, remove items, change quantities, rename, set or clear budget). Shows a diff card; the user applies it.', input_schema: { type: 'object', properties: { list: { type: 'string', description: 'Badge like "L1" or list name' }, add: { type: 'array', items: itemSchema }, remove: { type: 'array', items: { type: 'string' } }, set_quantity: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, quantity: { type: 'integer', minimum: 0 } }, required: ['item', 'quantity'] } }, rename: { type: 'string' }, budget: { type: ['number', 'null'], description: '₹ budget, or null to clear' } }, required: ['list'] } },
  { name: 'delete_list', description: 'Ask the user to confirm deleting a list (shows inline Yes/No). Nothing is deleted until they tap Yes.', input_schema: { type: 'object', properties: { list: { type: 'string' } }, required: ['list'] } },
  { name: 'prepare_order', description: 'Prepare an order for a saved list (or a draft): checks availability, swaps out-of-stock items, fills the cart and shows the bill preview with a Confirm button. This does NOT place the order.', input_schema: { type: 'object', properties: { list: { type: 'string' }, draft_id: { type: 'string' }, budget: { type: 'number', description: '₹ budget for this order if the user gave one' } } } },
  { name: 'get_cart', description: 'Read the current Instamart cart.', input_schema: { type: 'object', properties: {} } },
  { name: 'update_cart', description: 'Replace the Instamart cart with the given items (spin_id from search).', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { spin_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } }, required: ['spin_id', 'quantity'] } } }, required: ['items'] } },
  { name: 'clear_cart', description: 'Empty the Instamart cart.', input_schema: { type: 'object', properties: {} } },
] as const;
