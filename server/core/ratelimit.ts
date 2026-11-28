/**
 * Fixed-window rate limiter (in-memory, per instance). On Netlify each function
 * instance keeps its own window, which is fine as an abuse brake for a prototype.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfter: number } {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  return w.count > limit ? { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) } : { ok: true, retryAfter: 0 };
}
