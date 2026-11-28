/**
 * OAuth 2.1 + PKCE against Swiggy's authorization server (staging/production).
 * Discovery (RFC 8414) -> dynamic client registration (RFC 7591, cached) ->
 * authorize -> token (JSON body) -> refresh with rotation.
 */
import { getConfig } from '../config.js';
import { log } from '../log.js';
import { McpAuthError } from '../mcp/client.js';
import { keys, type Storage } from '../storage/index.js';
import { buildAuthorizeUrl, codeChallengeS256, createCodeVerifier, createState } from './pkce.js';
import type { LoadedSession } from '../session.js';

interface AsMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

const PKCE_MAX_AGE_MS = 10 * 60 * 1000;

let metadataCache: AsMetadata | null = null;

async function discover(fetchImpl: typeof fetch = fetch): Promise<AsMetadata> {
  if (metadataCache) return metadataCache;
  const { authBase } = getConfig();
  const res = await fetchImpl(`${authBase}/.well-known/oauth-authorization-server`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`OAuth discovery failed (${res.status})`);
  const m = (await res.json()) as AsMetadata;
  metadataCache = {
    authorization_endpoint: m.authorization_endpoint ?? `${authBase}/auth/authorize`,
    token_endpoint: m.token_endpoint ?? `${authBase}/auth/token`,
    registration_endpoint: m.registration_endpoint ?? `${authBase}/auth/register`,
  };
  return metadataCache;
}

async function getClientId(storage: Storage, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { redirectUri } = getConfig();
  if (process.env.SWIGGY_CLIENT_ID) return process.env.SWIGGY_CLIENT_ID;
  const cached = await storage.get<{ client_id: string }>(keys.oauthClient(redirectUri));
  if (cached?.client_id) return cached.client_id;
  const meta = await discover(fetchImpl);
  const res = await fetchImpl(meta.registration_endpoint!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Instamart Lists',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp:tools',
    }),
  });
  if (!res.ok) throw new Error(`Client registration failed (${res.status})`);
  const reg = (await res.json()) as { client_id: string };
  await storage.set(keys.oauthClient(redirectUri), { client_id: reg.client_id });
  log.info('oauth.registered_client');
  return reg.client_id;
}

/** GET /auth/login: returns the Swiggy authorize URL and stores PKCE material in the session. */
export async function beginLogin(session: LoadedSession, storage: Storage): Promise<string> {
  const { redirectUri } = getConfig();
  const meta = await discover();
  const clientId = await getClientId(storage);
  const verifier = createCodeVerifier();
  const state = createState();
  session.record.pkce = { verifier, state, createdAt: Date.now() };
  await session.save();
  return buildAuthorizeUrl({
    authorizationEndpoint: meta.authorization_endpoint,
    clientId,
    redirectUri,
    codeChallenge: codeChallengeS256(verifier),
    state,
  });
}

export class OAuthCallbackError extends Error {}

/** GET /auth/callback: verifies state, exchanges the single-use code, stores the token. */
export async function completeLogin(
  session: LoadedSession,
  storage: Storage,
  params: { code?: string | null; state?: string | null; error?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const pkce = session.record.pkce;
  delete session.record.pkce; // single use, whatever happens next
  await session.save();
  if (params.error) throw new OAuthCallbackError('Sign-in was cancelled or denied.');
  if (!pkce || !params.state || params.state !== pkce.state) throw new OAuthCallbackError('Sign-in link expired or was tampered with. Please try again.');
  if (Date.now() - pkce.createdAt > PKCE_MAX_AGE_MS) throw new OAuthCallbackError('Sign-in took too long. Please try again.');
  if (!params.code) throw new OAuthCallbackError('Missing authorization code.');

  const { redirectUri } = getConfig();
  const meta = await discover(fetchImpl);
  const clientId = await getClientId(storage, fetchImpl);
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      code_verifier: pkce.verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
    }),
  });
  if (!res.ok) throw new OAuthCallbackError('Could not complete sign-in with Swiggy. Please try again.');
  const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  await saveToken(storage, session.record.userId, tok);
}

async function saveToken(storage: Storage, uid: string, tok: { access_token: string; refresh_token?: string; expires_in?: number }) {
  const stored: StoredToken = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in ?? 432000) * 1000, // default 5 days
  };
  await storage.set(keys.token(uid), stored);
}

export async function clearToken(storage: Storage, uid: string) {
  await storage.delete(keys.token(uid));
}

/** Returns a usable access token, refreshing when <=60s remain. Throws McpAuthError if re-login is needed. */
export async function getAccessToken(storage: Storage, uid: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const tok = await storage.get<StoredToken>(keys.token(uid));
  if (!tok) throw new McpAuthError('Please sign in to Instamart to continue.');
  if (tok.expires_at - Date.now() > 60_000) return tok.access_token;
  if (!tok.refresh_token || tok.expires_at <= Date.now()) {
    await clearToken(storage, uid);
    throw new McpAuthError();
  }
  const meta = await discover(fetchImpl);
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: await getClientId(storage, fetchImpl) }),
  });
  if (!res.ok) {
    await clearToken(storage, uid);
    throw new McpAuthError();
  }
  const next = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  await saveToken(storage, uid, { ...next, refresh_token: next.refresh_token ?? tok.refresh_token });
  return next.access_token;
}

export async function hasToken(storage: Storage, uid: string) {
  return !!(await storage.get<StoredToken>(keys.token(uid)));
}
