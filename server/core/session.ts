/**
 * Sessions: the browser holds only a signed, httpOnly session ID. Everything else
 * (user ID, PKCE verifier/state while logging in) lives server-side in storage.
 */
import { getConfig } from './config.js';
import { hmac, randomId, safeEqual } from './crypto.js';
import { keys, type Storage } from './storage/index.js';

export const SESSION_COOKIE = 'iml_sid';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (matches Swiggy's sliding session)

export interface SessionRecord {
  userId: string;
  createdAt: string;
  /** Stub mode: user has passed the welcome screen. */
  started?: boolean;
  pkce?: { verifier: string; state: string; createdAt: number };
  flash?: string;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function serializeCookie(name: string, value: string, maxAge: number) {
  const cfg = getConfig();
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (cfg.isProduction) attrs.push('Secure');
  return attrs.join('; ');
}

function signSid(sid: string) {
  return `${sid}.${hmac(getConfig().sessionSecret, sid)}`;
}
function unsignSid(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i <= 0) return null;
  const sid = value.slice(0, i);
  return safeEqual(value.slice(i + 1), hmac(getConfig().sessionSecret, sid)) ? sid : null;
}

export interface LoadedSession {
  sid: string;
  record: SessionRecord;
  isNew: boolean;
  save(): Promise<void>;
  destroy(): Promise<void>;
  setCookie: string | null;
}

export async function loadSession(cookieHeader: string | undefined, storage: Storage): Promise<LoadedSession> {
  const sid = unsignSid(parseCookies(cookieHeader)[SESSION_COOKIE]);
  let record = sid ? await storage.get<SessionRecord>(keys.session(sid)) : null;
  const isNew = !record;
  const finalSid = record && sid ? sid : randomId(24);
  if (!record) record = { userId: `u_${randomId(12)}`, createdAt: new Date().toISOString() };
  const session: LoadedSession = {
    sid: finalSid,
    record,
    isNew,
    setCookie: isNew ? serializeCookie(SESSION_COOKIE, signSid(finalSid), SESSION_MAX_AGE) : null,
    save: () => storage.set(keys.session(finalSid), session.record),
    destroy: async () => {
      await storage.delete(keys.session(finalSid));
      session.setCookie = serializeCookie(SESSION_COOKIE, '', 0);
    },
  };
  if (isNew) await session.save();
  return session;
}
