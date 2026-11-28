import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, codeChallengeS256, createCodeVerifier, createState, isValidCodeVerifier } from '../../server/core/auth/pkce';

describe('PKCE helpers', () => {
  it('creates RFC 7636 compliant verifiers', () => {
    for (let i = 0; i < 20; i++) {
      const v = createCodeVerifier();
      expect(v.length).toBeGreaterThanOrEqual(43);
      expect(v.length).toBeLessThanOrEqual(128);
      expect(isValidCodeVerifier(v)).toBe(true);
    }
    expect(createCodeVerifier()).not.toBe(createCodeVerifier());
  });

  it('S256 is base64url(sha256(verifier)) without padding', () => {
    const v = createCodeVerifier();
    const expected = createHash('sha256').update(v).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(codeChallengeS256(v)).toBe(expected);
  });

  it('rejects invalid verifiers', () => {
    expect(() => codeChallengeS256('short')).toThrow();
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier('has spaces in it '.repeat(4))).toBe(false);
  });

  it('creates unpredictable state values', () => {
    expect(createState()).not.toBe(createState());
    expect(createState().length).toBeGreaterThanOrEqual(32);
  });

  it('builds the authorize URL with all required parameters', () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: 'https://mcp.swiggy.com/auth/authorize',
        clientId: 'client_123',
        redirectUri: 'http://localhost:3000/auth/callback',
        codeChallenge: 'abc',
        state: 'xyz',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://mcp.swiggy.com/auth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client_123',
      redirect_uri: 'http://localhost:3000/auth/callback',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'mcp:tools',
    });
  });
});
