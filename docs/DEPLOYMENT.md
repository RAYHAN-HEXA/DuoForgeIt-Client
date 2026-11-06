# Production deployment runbook

## Canonical URLs

| App | URL | Vercel project | Project ID | Root directory |
| --- | --- | --- | --- | --- |
| Web | https://techservicehub.vercel.app | `techservicehub` | `prj_kWJ6c7wBIN3KMCN6fvarYZV3kmFg` | `apps/web` |
| API | https://tsh-api-mu.vercel.app/api | `tsh-api` | `prj_VW7s1sjXMAixBKaSw8GbzNsoUDBa` | `apps/api` |

Legacy web aliases (`tsh-web-three`, `tsh-web-sandy`, `tsh-web-rahan-hexa`) 308-redirect
to the canonical domain, and their origins stay on the API allow-list so old
bookmarks never hit a CORS wall.

- Vercel team: `RAHAN-HEXA` (`team_O1oPgRz3daZh9vouQVNfzzn5`)
- Health check: https://tsh-api-mu.vercel.app/api/health

## Environment contract (Production)

Full contract lives in `apps/api/.env.example` (with comments). The load-bearing
variables and their 2026-11-07 production state:

| Project | Variable | Value / state |
| --- | --- | --- |
| `techservicehub` | `NEXT_PUBLIC_API_URL` | `https://tsh-api-mu.vercel.app/api` |
| `techservicehub` | `NEXT_PUBLIC_SITE_URL` | `https://techservicehub.vercel.app` |
| `techservicehub` | `NEXT_PUBLIC_FIREBASE_*` (6) | Firebase web config |
| `techservicehub` | `NEXT_PUBLIC_SERVICE_MARKETPLACE_ENABLED` | **unset** until launch (build-time baked) |
| `tsh-api` | `DATABASE_URL` / `DIRECT_URL` | Neon pooled / direct (sensitive) |
| `tsh-api` | `CORS_ORIGINS` | canonical + 4 legacy web origins, comma-separated |
| `tsh-api` | `ADMIN_PANEL_URL` | `https://techservicehub.vercel.app` |
| `tsh-api` | `FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT_BASE64` | Firebase Admin |
| `tsh-api` | `BLOB_READ_WRITE_TOKEN` | injected via the connected Blob store |
| `tsh-api` | `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `FOUNDER_NOTIFY_EMAILS` | Gmail SMTP (founder alerts + customer email) |
| `tsh-api` | `SERVICE_MARKETPLACE_ENABLED` | **`true` since 2026-11-07** (API routes on, web still legacy) |
| `tsh-api` | `WALLET_ENABLED` | unset (off — wallet phase not shipped) |
| `tsh-api` | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_TOKEN` | **unset** (in-memory limiter fallback) |

Notes:

- `NEXT_PUBLIC_*` is inlined into the client bundle at build time. Changing one
  needs a fresh **build** (git push) — an env-only `vercel redeploy` reuses the
  old bundle. Server-read env vars do pick up on env-only redeploys.
- `CORS_ORIGINS` is a comma-separated allow-list. No trailing slashes.
- Production variables are marked sensitive; `vercel env pull` writes empty
  values for them. Verify behaviour, not the pulled file.
- Never put secrets in `NEXT_PUBLIC_*` variables.
- `/api/health` `.data.features` is the single deploy check:
  `{ serviceMarketplace, wallet, blobStorage, email, redisRateLimiting }`.

## Database migrations — GATE before every API deploy

**Always run `npx prisma migrate deploy` against the production database
BEFORE (or with) any `tsh-api` redeploy.** Deploying API code whose Prisma
client expects unapplied migrations produces raw `P2022/P2021` errors on
reads that select the new columns — surfacing as generic "Internal server
error" 500s on customer flows (this happened 2026-11-06: checkout 500'd
because `manual_payments_v2` + `blob_storage_paths` were never applied while
the API was redeployed).

```bash
cd apps/api
npx prisma migrate status     # expect: "Database schema is up to date"
npx prisma migrate deploy     # applies pending migrations from prisma/migrations
```

Requires a machine that can reach Neon on 5432 (`DIRECT_URL`). Neon direct
endpoints are IPv6-first; if a network drops Postgres payloads after the TCP
handshake (nc connects, no protocol response — VPN/ISP/security-software
interception), switch networks (e.g. phone hotspot) or run the deploy from
CI. Check state in the Neon console at any time:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name;
```

## Git flow

Both remotes mirror the full monorepo and both are connected to Vercel:

| Remote | Repository | Vercel project |
| --- | --- | --- |
| `origin` | `RAYHAN-HEXA/DuoForgeIt-Client` | `techservicehub` (web) |
| `server` | `RAYHAN-HEXA/DuoForgeIt-Server` | `tsh-api` (api) |

```bash
git push origin main   # triggers the web production build
git push server main   # triggers the API production build
```

Production Branch is `main` for both projects. Pushes to other branches create
Preview deployments only.

## Verification

```bash
# API health: expect 200 + status/db/firebase ok
curl -sS https://tsh-api-mu.vercel.app/api/health

# CORS preflight from the web origin: expect 204 + matching allow-origin
curl -sS -i -X OPTIONS https://tsh-api-mu.vercel.app/api/services \
  -H 'Origin: https://techservicehub.vercel.app' \
  -H 'Access-Control-Request-Method: GET' | grep -i access-control-allow-origin

# A non-allowed origin must NOT receive an allow-origin header (no 500).
# Only the browser blocks the response; the API itself answers normally.
curl -sS -i -X OPTIONS https://tsh-api-mu.vercel.app/api/services \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: GET' | grep -ci access-control-allow-origin  # 0

# Web is up
curl -sS -o /dev/null -w '%{http_code}\n' https://techservicehub.vercel.app

# Catalog is server-rendered: HTML must already contain real service names
curl -sS https://techservicehub.vercel.app/services | grep -c 'Custom Software Project'  # >= 1

# Legacy web aliases 308-redirect to the canonical domain
curl -sS -o /dev/null -D - https://tsh-web-three.vercel.app | grep -iE 'HTTP/|location'

# Deployment status
vercel ls techservicehub --scope team_O1oPgRz3daZh9vouQVNfzzn5
vercel ls tsh-api --scope team_O1oPgRz3daZh9vouQVNfzzn5
```

Data-rendering notes:

- `/services` streams page 1 from the server and reuses it as SWR fallback, so
  the grid is present in the first HTML. A hard reload is only needed after
  deploying a build that changed the catalogue rendering.
- The API client tolerates Firebase token-bootstrap failures: public endpoints
  are still requested unauthenticated instead of erroring in the UI.

Manual browser check:

- DevTools → Network → `api` requests go to `tsh-api-mu.vercel.app`
- Console has no CORS errors
- Firebase sign-in succeeds and `GET /api/auth/me` returns 200

## Manual deploys (fallback)

Only when Git deploys are unavailable. Run from the app directory, never the
repo root:

```bash
vercel --prod --yes --cwd apps/api   --scope team_O1oPgRz3daZh9vouQVNfzzn5
vercel --prod --yes --cwd apps/web   --scope team_O1oPgRz3daZh9vouQVNfzzn5
```

Redeploy an existing deployment (for env-only changes):

```bash
vercel redeploy <deployment-url> --target production \
  --scope team_O1oPgRz3daZh9vouQVNfzzn5
```

## Rollback

```bash
# Preferred: revert the commit and let Git redeploy
git revert --no-edit <sha>
git push origin main && git push server main

# Or promote a previous ready deployment
vercel rollback https://techservicehub.vercel.app --scope team_O1oPgRz3daZh9vouQVNfzzn5
vercel rollback https://tsh-api-mu.vercel.app --scope team_O1oPgRz3daZh9vouQVNfzzn5
```
