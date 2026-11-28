# Deploying to Netlify

The same `server/core` code runs locally (Express) and on Netlify (one function at `netlify/functions/api.ts`). `netlify.toml` already holds the build command, publish directory, API rewrites, SPA fallback and security headers.

## 1. Create the site

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project →** pick the repo.
3. The build settings are read from `netlify.toml` (`npm run build`, publish `dist`, functions from `netlify/functions`). Leave them as they are.

Or with the CLI:

```bash
npm i -g netlify-cli
netlify login
netlify init        # link or create the site
```

## 2. Set environment variables

Site configuration → Environment variables (or `netlify env:set NAME value`):

| Variable | Demo deploy (stub) | Staging / production |
|---|---|---|
| `SWIGGY_MODE` | `stub` | `staging`, then `production` |
| `SESSION_SECRET` | recommended | **required**, 32+ random chars (`openssl rand -base64 48`) |
| `SWIGGY_REDIRECT_URI` | not used | `https://<your-site>.netlify.app/auth/callback` (exact) |
| `ANTHROPIC_API_KEY` | optional | optional (rules agent without it) |
| `ANTHROPIC_MODEL` | optional | e.g. `claude-sonnet-5-5` |
| `STUB_FLAGS` | optional | not used |

Storage switches to Netlify Blobs automatically on Netlify (no setup needed). Cookies get the `Secure` flag automatically.

Mark `SESSION_SECRET` and `ANTHROPIC_API_KEY` as secret values. Never commit `.env`.

## 3. Deploy

```bash
netlify deploy --build          # draft URL
netlify deploy --build --prod   # production
```

Check:

```bash
curl https://<your-site>.netlify.app/api/health
# {"ok":true,"mode":"stub"}
```

Then open the site, tap **Continue in demo mode**, and run through [DEMO.md](DEMO.md).

## 4. Move to staging, then production

1. Email builders@swiggy.in with your redirect URIs (exact match, no wildcards):
   - `http://localhost:3000/auth/callback`
   - `https://<your-site>.netlify.app/auth/callback`
2. Once allowlisted, set `SWIGGY_MODE=staging`, `SWIGGY_REDIRECT_URI`, `SESSION_SECRET`, and redeploy.
3. Sign in with your Swiggy account. On first sign-in the server reads `/.well-known/oauth-authorization-server`, registers a client once, and caches the `client_id` in Blobs. If Swiggy gave you a client ID, set `SWIGGY_CLIENT_ID` instead.
4. Test search, cart, bill and tracking on staging. Check the items in README’s “Known gaps” (tool list, `track_order` coordinates, payment options).
5. Set `SWIGGY_MODE=production` and redeploy.

## Local production check

```bash
npm run build
npm start      # serves dist/ + API on http://localhost:3000 with NODE_ENV=production
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `SESSION_SECRET must be set` in function logs | Set a 32+ char `SESSION_SECRET` (required outside stub mode) |
| Redirect error at Swiggy sign-in | `SWIGGY_REDIRECT_URI` must match the allowlisted URI character for character |
| “Sign-in link expired” | The PKCE state is single use and valid for 10 minutes; start again |
| Users bounced back to welcome | Token expired or revoked (401). Signing in again fixes it |
| 429 from `/api/*` | App rate limit; wait a minute |

Each response has an `x-request-id` header. Search for it in Netlify function logs, and quote it to Swiggy if needed (unexpected tool failures are also sent to `report_error` with that ID).
