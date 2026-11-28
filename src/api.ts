import type { ChatResponse, GroceryList, OrderPreview, OrderResult, SessionInfo, TrackResult } from '../shared/cards';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

type AuthListener = (message: string) => void;
let onAuthRequired: AuthListener = () => undefined;
export const setAuthListener = (fn: AuthListener) => {
  onAuthRequired = fn;
};

/** Stub scenario flags from ?stub=oos,price,surge (dev/demo only; ignored outside stub mode). */
function stubFlags(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('stub');
    if (q !== null) sessionStorage.setItem('stubFlags', q);
    return sessionStorage.getItem('stubFlags');
  } catch {
    return null;
  }
}

export function getStubFlags(): string[] {
  return (stubFlags() ?? '').split(',').filter(Boolean);
}
export function setStubFlags(flags: string[]) {
  try {
    sessionStorage.setItem('stubFlags', flags.join(','));
    const u = new URL(window.location.href);
    if (u.searchParams.has('stub')) {
      u.searchParams.delete('stub');
      window.history.replaceState(null, '', u.toString());
    }
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'instamart-lists' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const flags = stubFlags();
  if (flags) headers['x-stub-flags'] = flags;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong. Please try again.', data.requestId);
    if (res.status === 401 && data.error === 'auth_required') onAuthRequired(err.message);
    throw err;
  }
  return data as T;
}

export const api = {
  session: () => request<SessionInfo & { authMessage?: string }>('GET', '/api/session'),
  chat: (message: string, history: Array<{ role: 'user' | 'assistant'; text: string }>) => request<ChatResponse>('POST', '/api/chat', { message, history }),
  lists: () => request<{ lists: GroceryList[] }>('GET', '/api/lists'),
  deleteList: (id: string) => request<{ ok: true }>('DELETE', `/api/lists/${id}`),
  setBudget: (id: string, budget: number | null) => request<{ list: GroceryList }>('POST', `/api/lists/${id}/budget`, { budget }),
  exportList: (id: string) => request<{ text: string }>('GET', `/api/lists/${id}/export`),
  saveDraft: (id: string, body: { name?: string | null; items: Array<{ spinId: string; quantity: number }> }) =>
    request<{ list: GroceryList }>('POST', `/api/drafts/${id}/save`, body),
  discardDraft: (id: string) => request<{ ok: true }>('POST', `/api/drafts/${id}/discard`, {}),
  applyEdit: (id: string) => request<{ list: GroceryList }>('POST', `/api/edits/${id}/apply`, {}),
  undoEdit: (id: string) => request<{ list: GroceryList | null }>('POST', `/api/edits/${id}/undo`, {}),
  prepare: (body: { listId?: string; draftId?: string; budget?: number | null }) => request<{ preview: OrderPreview }>('POST', '/api/order/prepare', body),
  adjust: (previewId: string, action: unknown) => request<{ preview: OrderPreview }>('POST', '/api/order/adjust', { previewId, action }),
  cancel: (previewId: string) => request<{ ok: true; message: string }>('POST', '/api/order/cancel', { previewId }),
  confirm: (token: string, acceptedSubstitutions: string[]) => request<{ order: OrderResult }>('POST', '/api/order/confirm', { token, acceptedSubstitutions }),
  track: (orderId: string) => request<{ track: TrackResult }>('POST', '/api/order/track', { orderId }),
  saveOrderAsList: (name?: string) => request<{ list: GroceryList }>('POST', '/api/order/save-as-list', { name: name ?? null }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
};
