/** PKCE helpers (RFC 7636, S256 only). */
import { randomBytes } from 'node:crypto';
import { sha256b64url } from '../crypto.js';

const UNRESERVED = /^[A-Za-z0-9\-._~]{43,128}$/;

export function createCodeVerifier(): string {
  // 32 random bytes -> 43 base64url chars (within 43..128, unreserved charset).
  return randomBytes(32).toString('base64url');
}

export function isValidCodeVerifier(v: string): boolean {
  return UNRESERVED.test(v);
}

export function codeChallengeS256(verifier: string): string {
  if (!isValidCodeVerifier(verifier)) throw new Error('Invalid code_verifier');
  return sha256b64url(verifier);
}

export function createState(): string {
  return randomBytes(24).toString('base64url');
}

export interface AuthorizeParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const u = new URL(p.authorizationEndpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('code_challenge', p.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', p.state);
  u.searchParams.set('scope', p.scope ?? 'mcp:tools');
  return u.toString();
}
