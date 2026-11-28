/** Structured logger. Redacts anything that looks like a credential. Never pass tokens here. */
const SECRET_KEYS = /token|authorization|secret|code_verifier|cookie|password|api[-_]?key/i;

function redact(meta: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  return out;
}

function emit(level: 'info' | 'warn' | 'error', event: string, meta?: Record<string, unknown>) {
  if (process.env.LOG_LEVEL === 'silent') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...redact(meta) });
  (level === 'error' ? console.error : console.log)(line);
}

export const log = {
  info: (e: string, m?: Record<string, unknown>) => emit('info', e, m),
  warn: (e: string, m?: Record<string, unknown>) => emit('warn', e, m),
  error: (e: string, m?: Record<string, unknown>) => emit('error', e, m),
};
