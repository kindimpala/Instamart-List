import { describe, expect, it } from 'vitest';
import { rateLimit } from '../../server/core/ratelimit';

describe('rateLimit', () => {
  it('blocks after the limit and resets after the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, t0).ok).toBe(true);
    const blocked = rateLimit('k', 3, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(60);
    expect(rateLimit('k', 3, 60_000, t0 + 60_001).ok).toBe(true);
  });
});
