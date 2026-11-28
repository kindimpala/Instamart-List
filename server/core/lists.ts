/** Saved lists, pending drafts ("Found these for you") and pending edits (diffs). */
import type { Card, DraftItem, GroceryList, ListItem } from '../../shared/cards.js';
import { randomId } from './crypto.js';
import { keys, type Storage } from './storage/index.js';

export class NotFoundError extends Error {}

const TTL_MS = 24 * 60 * 60 * 1000;

export async function getLists(storage: Storage, uid: string): Promise<GroceryList[]> {
  return (await storage.get<GroceryList[]>(keys.lists(uid))) ?? [];
}
async function putLists(storage: Storage, uid: string, lists: GroceryList[]) {
  await storage.set(keys.lists(uid), lists);
}

export function nextBadge(lists: GroceryList[]): string {
  const used = new Set(lists.map((l) => l.badge));
  for (let i = 1; ; i++) if (!used.has(`L${i}`)) return `L${i}`;
}

const norm = (s: string) => s.toLowerCase().replace(/["'“”‘’]/g, '').replace(/\s+/g, ' ').trim();

/** Resolve "L1", "weekly staples", "my weekly staples list" to a list. */
export function resolveList(lists: GroceryList[], ref: string | null | undefined): GroceryList | null {
  if (!ref) return null;
  const r = norm(ref).replace(/^(my|the)\s+/, '').replace(/\s+list$/, '');
  return (
    lists.find((l) => l.badge.toLowerCase() === r) ??
    lists.find((l) => l.id === ref) ??
    lists.find((l) => norm(l.name) === r) ??
    lists.find((l) => r.length > 2 && norm(l.name).includes(r)) ??
    null
  );
}

export function sanitizeName(name: string | null | undefined): string | null {
  const n = (name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return n || null;
}

/* ---------- drafts ---------- */

export interface Draft {
  id: string;
  suggestedName: string | null;
  items: DraftItem[];
  notFound: string[];
  budget: number | null;
  createdAt: number;
}

export async function createDraft(storage: Storage, uid: string, d: Omit<Draft, 'id' | 'createdAt'>): Promise<Draft> {
  const draft: Draft = { ...d, id: `d_${randomId(9)}`, createdAt: Date.now() };
  await storage.set(keys.draft(uid, draft.id), draft);
  return draft;
}

export async function getDraft(storage: Storage, uid: string, id: string): Promise<Draft> {
  const d = await storage.get<Draft>(keys.draft(uid, id));
  if (!d || Date.now() - d.createdAt > TTL_MS) throw new NotFoundError('That suggestion has expired. Ask me to build the list again.');
  return d;
}

export async function discardDraft(storage: Storage, uid: string, id: string) {
  await storage.delete(keys.draft(uid, id));
}

/**
 * Saves a draft as a list. The client may change quantities or swap to one of the
 * alternatives we showed, but prices always come from the stored service response.
 */
export async function saveDraft(
  storage: Storage,
  uid: string,
  draftId: string,
  input: { name?: string | null; items?: Array<{ spinId: string; quantity: number }> },
): Promise<GroceryList> {
  const draft = await getDraft(storage, uid, draftId);
  const known = new Map<string, ListItem>();
  for (const it of draft.items) {
    known.set(it.spinId, { spinId: it.spinId, productId: it.productId, name: it.name, size: it.size, quantity: it.quantity, price: it.price });
    for (const a of it.alternatives) known.set(a.spinId, { spinId: a.spinId, productId: a.productId, name: a.name, size: a.size, quantity: it.quantity, price: a.price });
  }
  const chosen = input.items ?? draft.items.map((i) => ({ spinId: i.spinId, quantity: i.quantity }));
  const items: ListItem[] = [];
  for (const c of chosen) {
    const base = known.get(c.spinId);
    if (!base) throw new NotFoundError('One of the items is no longer part of this suggestion.');
    if (c.quantity < 1) continue;
    const existing = items.find((i) => i.spinId === c.spinId);
    if (existing) existing.quantity += c.quantity;
    else items.push({ ...base, quantity: Math.min(20, Math.round(c.quantity)) });
  }
  if (!items.length) throw new NotFoundError('The list is empty. Add at least one item.');
  const lists = await getLists(storage, uid);
  const now = new Date().toISOString();
  const badge = nextBadge(lists);
  const list: GroceryList = {
    id: `l_${randomId(9)}`,
    badge,
    name: sanitizeName(input.name) ?? draft.suggestedName ?? badge,
    items,
    budget: draft.budget,
    createdAt: now,
    updatedAt: now,
    lastOrderedAt: null,
  };
  lists.push(list);
  await putLists(storage, uid, lists);
  await discardDraft(storage, uid, draftId);
  return list;
}

export async function saveItemsAsList(storage: Storage, uid: string, name: string | null, items: ListItem[]): Promise<GroceryList> {
  const lists = await getLists(storage, uid);
  const now = new Date().toISOString();
  const badge = nextBadge(lists);
  const list: GroceryList = { id: `l_${randomId(9)}`, badge, name: sanitizeName(name) ?? badge, items, budget: null, createdAt: now, updatedAt: now, lastOrderedAt: now };
  lists.push(list);
  await putLists(storage, uid, lists);
  return list;
}

export async function deleteList(storage: Storage, uid: string, id: string) {
  const lists = await getLists(storage, uid);
  const next = lists.filter((l) => l.id !== id);
  if (next.length === lists.length) throw new NotFoundError('List not found.');
  await putLists(storage, uid, next);
}

export async function updateList(storage: Storage, uid: string, id: string, patch: (l: GroceryList) => void): Promise<GroceryList> {
  const lists = await getLists(storage, uid);
  const l = lists.find((x) => x.id === id);
  if (!l) throw new NotFoundError('List not found.');
  patch(l);
  l.updatedAt = new Date().toISOString();
  await putLists(storage, uid, lists);
  return l;
}

/* ---------- edits (diff) ---------- */

export interface PendingEdit {
  id: string;
  listId: string;
  baseUpdatedAt: string;
  next: { name: string; items: ListItem[]; budget: number | null };
  previous: { name: string; items: ListItem[]; budget: number | null };
  applied: boolean;
  appliedUpdatedAt?: string;
  createdAt: number;
}

export function diffCard(edit: PendingEdit, list: GroceryList): Extract<Card, { type: 'diff' }> {
  const prev = edit.previous.items;
  const next = edit.next.items;
  const prevMap = new Map(prev.map((i) => [i.spinId, i]));
  const nextMap = new Map(next.map((i) => [i.spinId, i]));
  return {
    type: 'diff',
    editId: edit.id,
    listId: list.id,
    listName: `${list.badge} · ${edit.previous.name}`,
    rename: edit.next.name !== edit.previous.name ? { from: edit.previous.name, to: edit.next.name } : null,
    added: next.filter((i) => !prevMap.has(i.spinId)),
    removed: prev.filter((i) => !nextMap.has(i.spinId)),
    changed: next
      .filter((i) => prevMap.has(i.spinId) && prevMap.get(i.spinId)!.quantity !== i.quantity)
      .map((i) => ({ item: i, from: prevMap.get(i.spinId)!.quantity, to: i.quantity })),
    unchanged: next.filter((i) => prevMap.has(i.spinId) && prevMap.get(i.spinId)!.quantity === i.quantity),
    budgetChange: edit.next.budget !== edit.previous.budget ? { from: edit.previous.budget, to: edit.next.budget } : null,
  };
}

export async function proposeEdit(
  storage: Storage,
  uid: string,
  list: GroceryList,
  next: { name: string; items: ListItem[]; budget: number | null },
): Promise<PendingEdit> {
  const edit: PendingEdit = {
    id: `e_${randomId(9)}`,
    listId: list.id,
    baseUpdatedAt: list.updatedAt,
    next,
    previous: { name: list.name, items: list.items, budget: list.budget },
    applied: false,
    createdAt: Date.now(),
  };
  await storage.set(keys.edit(uid, edit.id), edit);
  return edit;
}

async function getEdit(storage: Storage, uid: string, id: string) {
  const e = await storage.get<PendingEdit>(keys.edit(uid, id));
  if (!e || Date.now() - e.createdAt > TTL_MS) throw new NotFoundError('That change has expired. Ask me again.');
  return e;
}

export async function applyEdit(storage: Storage, uid: string, id: string): Promise<GroceryList> {
  const e = await getEdit(storage, uid, id);
  if (e.applied) throw new NotFoundError('These changes are already applied.');
  const lists = await getLists(storage, uid);
  const l = lists.find((x) => x.id === e.listId);
  if (!l) throw new NotFoundError('List not found.');
  if (l.updatedAt !== e.baseUpdatedAt) throw new NotFoundError('This list changed since I suggested these edits. Ask me again.');
  const updated = await updateList(storage, uid, e.listId, (x) => {
    x.name = e.next.name;
    x.items = e.next.items;
    x.budget = e.next.budget;
  });
  e.applied = true;
  e.appliedUpdatedAt = updated.updatedAt;
  await storage.set(keys.edit(uid, id), e);
  return updated;
}

/** Undo: discards a pending edit, or reverts an applied one if nothing changed since. */
export async function undoEdit(storage: Storage, uid: string, id: string): Promise<GroceryList | null> {
  const e = await getEdit(storage, uid, id);
  if (!e.applied) {
    await storage.delete(keys.edit(uid, id));
    return null;
  }
  const lists = await getLists(storage, uid);
  const l = lists.find((x) => x.id === e.listId);
  if (!l) throw new NotFoundError('List not found.');
  if (l.updatedAt !== e.appliedUpdatedAt) throw new NotFoundError('The list has changed again since, so I can’t undo this safely.');
  const reverted = await updateList(storage, uid, e.listId, (x) => {
    x.name = e.previous.name;
    x.items = e.previous.items;
    x.budget = e.previous.budget;
  });
  await storage.delete(keys.edit(uid, id));
  return reverted;
}
