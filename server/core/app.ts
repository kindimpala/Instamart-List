/**
 * Framework-agnostic HTTP core. Express (local) and Netlify Functions (prod)
 * both translate to CoreRequest/CoreResponse and call handle().
 */
import { z } from 'zod';
import { withAttribution } from '../../shared/brand.js';
import type { ChatResponse, SessionInfo } from '../../shared/cards.js';
import { runAgent } from './agent/index.js';
import { beginLogin, clearToken, completeLogin, hasToken, OAuthCallbackError } from './auth/oauth.js';
import { getConfig } from './config.js';
import { randomId } from './crypto.js';
import { instamartFor, type RequestCtx } from './instamart.js';
import { applyEdit, deleteList, discardDraft, getLists, NotFoundError, saveDraft, saveItemsAsList, undoEdit, updateList } from './lists.js';
import { log } from './log.js';
import { McpAuthError, McpToolError } from './mcp/client.js';
import { adjustOrder, cancelOrder, confirmOrder, lastOrderItems, OrderError, prepareOrder, trackOrder } from './order.js';
import { rateLimit } from './ratelimit.js';
import { loadSession, type LoadedSession } from './session.js';
import { getStorage } from './storage/index.js';
import { handleStubRpc } from '../../stub/server.js';

export interface CoreRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>; // lower-case keys
  body: unknown;
  ip: string;
}

export interface CoreResponse {
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  json?: unknown;
  redirect?: string;
}

const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'instamart-lists';

const json = (status: number, body: unknown): CoreResponse => ({ status, headers: {}, cookies: [], json: body });
const redirect = (to: string): CoreResponse => ({ status: 302, headers: {}, cookies: [], redirect: to });

const ID = z.string().regex(/^[A-Za-z0-9_-]{3,64}$/);
const SPIN = z.string().min(1).max(128);
const Budget = z.number().positive().max(100000).nullable();

const schemas = {
  chat: z.object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(20).optional(),
  }),
  saveDraft: z.object({
    name: z.string().max(40).nullable().optional(),
    items: z.array(z.object({ spinId: SPIN, quantity: z.number().int().min(0).max(20) })).max(50).optional(),
  }),
  budget: z.object({ budget: Budget }),
  prepare: z.object({ listId: ID.optional(), draftId: ID.optional(), budget: Budget.optional() }).refine((v) => !!v.listId !== !!v.draftId, 'Provide listId or draftId'),
  adjust: z.object({
    previewId: ID,
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('remove'), spinId: SPIN }),
      z.object({ type: z.literal('replace'), fromSpinId: SPIN, toSpinId: SPIN }),
      z.object({ type: z.literal('budget'), limit: Budget }),
    ]),
  }),
  cancel: z.object({ previewId: ID }),
  confirm: z.object({ token: z.string().max(2048).optional(), acceptedSubstitutions: z.array(SPIN).max(50).optional() }),
  track: z.object({ orderId: z.string().min(1).max(64) }),
  saveOrder: z.object({ name: z.string().max(40).nullable().optional() }),
};

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, 'invalid_input', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

async function isSignedIn(session: LoadedSession): Promise<boolean> {
  const cfg = getConfig();
  if (cfg.mode === 'stub') return !!session.record.started;
  return hasToken(getStorage(), session.record.userId);
}

export async function handle(req: CoreRequest): Promise<CoreResponse> {
  const requestId = req.headers['x-request-id']?.slice(0, 64) || `req_${randomId(10)}`;
  const started = Date.now();
  let res: CoreResponse;
  try {
    res = await route(req, requestId);
  } catch (e) {
    res = errorResponse(e, requestId);
  }
  res.headers['x-request-id'] = requestId;
  res.headers['cache-control'] ??= 'no-store';
  log.info('http', { method: req.method, path: req.path, status: res.status, ms: Date.now() - started, requestId });
  return res;
}

function errorResponse(e: unknown, requestId: string): CoreResponse {
  if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message, requestId });
  if (e instanceof McpAuthError) return json(401, { error: 'auth_required', message: e.message, requestId });
  if (e instanceof OrderError) return json(e.status, { error: e.code, message: e.message, requestId });
  if (e instanceof NotFoundError) return json(404, { error: 'not_found', message: e.message, requestId });
  if (e instanceof McpToolError) return json(502, { error: 'instamart_error', message: e.message, requestId });
  log.error('http.unhandled', { message: (e as Error)?.message, requestId });
  return json(500, { error: 'internal', message: 'Something went wrong on our side. Please try again.', requestId });
}

async function route(req: CoreRequest, requestId: string): Promise<CoreResponse> {
  const cfg = getConfig();
  const storage = getStorage();
  const { method, path } = req;

  if (path === '/api/health') return json(200, { ok: true, mode: cfg.mode });

  // Stub MCP endpoint (only in stub mode) so external MCP tools can inspect it.
  if (path === '/stub/mcp' && method === 'POST') {
    if (cfg.mode !== 'stub') return json(404, { error: 'not_found' });
    const out = await handleStubRpc({ body: req.body, authorization: req.headers['authorization'], flagsHeader: req.headers['x-stub-flags'], store: storage });
    return json(out.status, out.body);
  }

  const session = await loadSession(req.headers['cookie'], storage);
  const withCookie = (r: CoreResponse) => {
    if (session.setCookie) r.cookies.push(session.setCookie);
    return r;
  };

  /* ----- auth routes ----- */
  if (path === '/auth/login' && method === 'GET') {
    const rl = rateLimit(`login:${req.ip}`, 20);
    if (!rl.ok) return withCookie(json(429, { error: 'rate_limited', message: 'Too many sign-in attempts. Please wait a minute.' }));
    if (cfg.mode === 'stub') {
      session.record.started = true;
      await session.save();
      return withCookie(redirect('/'));
    }
    return withCookie(redirect(await beginLogin(session, storage)));
  }
  if (path === '/auth/callback' && method === 'GET') {
    if (cfg.mode === 'stub') return withCookie(redirect('/'));
    try {
      await completeLogin(session, storage, { code: req.query.get('code'), state: req.query.get('state'), error: req.query.get('error') });
      return withCookie(redirect('/'));
    } catch (e) {
      const msg = e instanceof OAuthCallbackError ? e.message : 'Could not complete sign-in. Please try again.';
      log.warn('oauth.callback_failed', { requestId, message: (e as Error).message });
      return withCookie(redirect(`/?auth_error=${encodeURIComponent(msg)}`));
    }
  }
  if (path === '/auth/logout' && method === 'POST') {
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new HttpError(403, 'csrf', 'Missing request header.');
    await clearToken(storage, session.record.userId);
    await session.destroy();
    return withCookie(json(200, { ok: true }));
  }

  if (!path.startsWith('/api/')) return withCookie(json(404, { error: 'not_found' }));

  /* ----- API guards ----- */
  if (method !== 'GET' && req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new HttpError(403, 'csrf', 'Missing request header.');
  const [bucketName, limit] = path.startsWith('/api/chat') ? ['chat', 30] : path.startsWith('/api/order/confirm') ? ['confirm', 10] : ['api', 120];
  const rl = rateLimit(`${bucketName}:${session.record.userId}:${req.ip}`, limit);
  if (!rl.ok) {
    const r = json(429, { error: 'rate_limited', message: 'You’re going a bit fast. Please wait a moment and try again.', requestId });
    r.headers['retry-after'] = String(rl.retryAfter);
    return withCookie(r);
  }

  const signedIn = await isSignedIn(session);
  const uid = session.record.userId;
  const ctx: RequestCtx = { uid, storage, requestId, stubFlags: cfg.mode === 'stub' ? req.headers['x-stub-flags'] ?? null : null };

  if (path === '/api/session' && method === 'GET') {
    const lists = await getLists(storage, uid);
    let address: SessionInfo['address'] = null;
    if (signedIn) {
      try {
        const a = await (await instamartFor(ctx)).getDefaultAddress();
        address = { id: a.id, label: a.addressTag ?? a.addressCategory ?? 'Home', line: a.addressLine };
      } catch (e) {
        if (e instanceof McpAuthError) {
          await clearToken(storage, uid);
          return withCookie(json(200, { mode: cfg.mode, signedIn: false, address: null, listCount: lists.length, agent: cfg.anthropicApiKey ? 'llm' : 'rules', authMessage: e.message }));
        }
      }
    }
    const info: SessionInfo = { mode: cfg.mode, signedIn, address, listCount: lists.length, agent: cfg.anthropicApiKey ? 'llm' : 'rules' };
    return withCookie(json(200, info));
  }

  if (!signedIn) return withCookie(json(401, { error: 'auth_required', message: 'Please sign in to Instamart to continue.', requestId }));

  try {
    return withCookie(await apiRoutes(req, ctx));
  } catch (e) {
    if (e instanceof McpAuthError) {
      await clearToken(storage, uid);
      if (cfg.mode === 'stub') {
        session.record.started = false;
        await session.save();
      }
    }
    return withCookie(errorResponse(e, requestId));
  }
}

async function apiRoutes(req: CoreRequest, ctx: RequestCtx): Promise<CoreResponse> {
  const { method, path } = req;
  const { storage, uid } = ctx;
  let m: RegExpExecArray | null;

  if (path === '/api/chat' && method === 'POST') {
    const body = parse(schemas.chat, req.body);
    const out = await runAgent(ctx, body.message, body.history ?? []);
    const res: ChatResponse = { reply: out.reply, cards: out.cards, requestId: ctx.requestId };
    return json(200, res);
  }

  if (path === '/api/lists' && method === 'GET') return json(200, { lists: await getLists(storage, uid) });

  if ((m = /^\/api\/lists\/([A-Za-z0-9_-]+)$/.exec(path)) && method === 'DELETE') {
    await deleteList(storage, uid, m[1]);
    return json(200, { ok: true });
  }
  if ((m = /^\/api\/lists\/([A-Za-z0-9_-]+)\/budget$/.exec(path)) && method === 'POST') {
    const { budget } = parse(schemas.budget, req.body);
    const list = await updateList(storage, uid, m[1], (l) => {
      l.budget = budget;
    });
    return json(200, { list });
  }
  if ((m = /^\/api\/lists\/([A-Za-z0-9_-]+)\/export$/.exec(path)) && method === 'GET') {
    const list = (await getLists(storage, uid)).find((l) => l.id === m![1]);
    if (!list) throw new NotFoundError('List not found.');
    const lines = list.items.map((i) => `- ${i.quantity} x ${i.name} (${i.size})`);
    const text = withAttribution(`${list.badge} · ${list.name}\n${lines.join('\n')}${list.budget ? `\nBudget: ₹${list.budget}` : ''}`);
    return json(200, { text });
  }

  if ((m = /^\/api\/drafts\/([A-Za-z0-9_-]+)\/save$/.exec(path)) && method === 'POST') {
    const body = parse(schemas.saveDraft, req.body);
    const list = await saveDraft(storage, uid, m[1], body);
    return json(200, { list });
  }
  if ((m = /^\/api\/drafts\/([A-Za-z0-9_-]+)\/discard$/.exec(path)) && method === 'POST') {
    await discardDraft(storage, uid, m[1]);
    return json(200, { ok: true });
  }

  if ((m = /^\/api\/edits\/([A-Za-z0-9_-]+)\/(apply|undo)$/.exec(path)) && method === 'POST') {
    if (m[2] === 'apply') return json(200, { list: await applyEdit(storage, uid, m[1]) });
    return json(200, { list: await undoEdit(storage, uid, m[1]) });
  }

  if (path.startsWith('/api/order/')) {
    const svc = await instamartFor(ctx);
    switch (`${method} ${path}`) {
      case 'POST /api/order/prepare': {
        const b = parse(schemas.prepare, req.body);
        return json(200, { preview: await prepareOrder(ctx, svc, b) });
      }
      case 'POST /api/order/adjust': {
        const b = parse(schemas.adjust, req.body);
        return json(200, { preview: await adjustOrder(ctx, svc, b.previewId, b.action) });
      }
      case 'POST /api/order/cancel': {
        const b = parse(schemas.cancel, req.body);
        await cancelOrder(ctx, svc, b.previewId);
        return json(200, { ok: true, message: 'Order cancelled. I’ve cleared your cart.' });
      }
      case 'POST /api/order/confirm': {
        const b = parse(schemas.confirm, req.body);
        return json(200, { order: await confirmOrder(ctx, svc, b) });
      }
      case 'POST /api/order/track': {
        const b = parse(schemas.track, req.body);
        return json(200, { track: await trackOrder(ctx, svc, b.orderId) });
      }
      case 'POST /api/order/save-as-list': {
        const b = parse(schemas.saveOrder, req.body);
        const items = await lastOrderItems(ctx);
        if (!items?.length) throw new NotFoundError('There’s no recent order to save.');
        return json(200, { list: await saveItemsAsList(storage, uid, b.name ?? null, items) });
      }
    }
  }
  return json(404, { error: 'not_found', message: 'Unknown endpoint.' });
}
