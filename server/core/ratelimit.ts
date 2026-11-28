/**
 * Fixed-window rate limiter (in-memory, per instance). On Netlify each function
 * instance keeps its own window, which is fine as an abuse brake for a prototype.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/** RATE_LIMIT_MULTIPLIER (e.g. 10) loosens limits for automated test runs only. */
const MULT = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1) || 1);

export function rateLimit(key: string, baseLimit: number, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfter: number } {
  const limit = baseLimit * MULT;
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  return w.count > limit ? { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) } : { ok: true, retryAfter: 0 };
}
