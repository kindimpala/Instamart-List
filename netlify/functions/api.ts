/**
 * Production adapter: Netlify Function (v2, Web Request/Response) -> shared core.
 * netlify.toml rewrites /api/*, /auth/* and /stub/* here.
 */
import type { Context } from '@netlify/functions';
import { handle, type CoreRequest } from '../../server/core/app';

const PREFIX = '/.netlify/functions/api';

export default async (req: Request, context: Context): Promise<Response> => {
  const url = new URL(req.url);
  // Works whether Netlify passes the original URL or the rewritten function URL.
  const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) || '/' : url.pathname;

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let body: unknown = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const text = await req.text();
    if (text.length > 64 * 1024) return new Response(JSON.stringify({ error: 'too_large' }), { status: 413 });
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_json', message: 'Body must be JSON.' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  }

  const coreReq: CoreRequest = { method: req.method, path, query: url.searchParams, headers, body, ip: context.ip ?? 'unknown' };
  const out = await handle(coreReq);

  const h = new Headers(out.headers);
  for (const c of out.cookies) h.append('set-cookie', c);
  if (out.redirect) {
    h.set('location', out.redirect);
    return new Response(null, { status: out.status, headers: h });
  }
  h.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(out.json ?? null), { status: out.status, headers: h });
};
