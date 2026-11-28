/**
 * Local dev adapter: Express on http://localhost:3000 serving the API (via the
 * shared core) and the React app (Vite middleware in dev, dist/ in production).
 */
import express from 'express';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { handle, type CoreRequest } from './core/app.js';
import { getConfig } from './core/config.js';

function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadDotEnv();
  const cfg = getConfig();
  const port = Number(process.env.PORT ?? 3000);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));

  app.all(['/api/*', '/auth/*', '/stub/*'], async (req, res) => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    const coreReq: CoreRequest = {
      method: req.method,
      path: req.path,
      query: new URLSearchParams(req.url.split('?')[1] ?? ''),
      headers,
      body: req.body,
      ip: req.ip ?? 'unknown',
    };
    const out = await handle(coreReq);
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    if (out.cookies.length) res.setHeader('set-cookie', out.cookies);
    if (out.redirect) return res.redirect(out.status, out.redirect);
    res.status(out.status).json(out.json ?? null);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.listen(port, () => {
    console.log(`\n  Instamart Lists running at http://localhost:${port}`);
    console.log(`  SWIGGY_MODE=${cfg.mode}  agent=${cfg.anthropicApiKey ? `Claude (${cfg.anthropicModel})` : 'rules (no ANTHROPIC_API_KEY)'}\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
