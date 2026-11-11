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
- The API root (`https://tsh-api-mu.vercel.app/`) returns a small JSON service
  card. All real routes live under `/api/*`; a root 404 means the root-landing
  function is missing (see Troubleshooting below).

## Environment contract (Production)

Full contract lives in `apps/api/.env.example` (with comments). The load-bearing
variables and their 2026-11-07 production state:

| Project | Variable | Value / state |
| --- | --- | --- |
| `techservicehub` | `NEXT_PUBLIC_API_URL` | `https://tsh-api-mu.vercel.app/api` |
| `techservicehub` | `NEXT_PUBLIC_SITE_URL` | `https://techservicehub.vercel.app` |
| `techservicehub` | `NEXT_PUBLIC_FIREBASE_*` (6) | Firebase web config |
| `techservicehub` | `NEXT_PUBLIC_SERVICE_MARKETPLACE_ENABLED` | **`true` since 2026-11-07** (build-time baked — needs a fresh web build) |
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
the API was redeployed, and again 2026-11-11: registration 500'd because
`20261111120000_email_otp_registration_gate` shipped without being applied).
Since the 2026-11-11 fix, `P2021/P2022` surface as a distinct 503
`DB_SCHEMA_MISMATCH` instead of an opaque 500 — seeing that code in the wild
means exactly one thing: apply the pending migration.

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

### When 5432 is blocked but 443 works — SQL over HTTPS

The black-holed-5432 machine (2026-11-11) could still reach Neon over HTTPS,
so the migration was applied through Neon's HTTP query proxy with
`@neondatabase/serverless` instead of waiting for a clean network:

```bash
mkdir /tmp/neon-fix && cd /tmp/neon-fix && npm init -y >/dev/null && npm i @neondatabase/serverless
cat > check.mjs <<'EOF'
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
// <repo> = the monorepo root; DIRECT_URL comes from apps/api/.env (query params stripped)
const url = readFileSync('<repo>/apps/api/.env', 'utf8')
  .match(/^DIRECT_URL="?([^"\n]+)"?$/m)[1].split('?')[0];
const sql = neon(url);
console.log(JSON.stringify(await sql`SELECT migration_name FROM _prisma_migrations ORDER BY 1`));
EOF
node check.mjs
```

Plain DDL statements run through `sql.query(...)` (the tagged-template form
rejects non-parameterized strings). For additive migrations a committed
idempotent manual-apply script is the cleaner route —
`apps/api/scripts/apply-migration-20261111120000.sql` is the template: exact
DDL of the migration plus the `_prisma_migrations` bookkeeping row (with the
sha256 checksum of the real migration.sql), every statement guarded, safe to
paste into the Neon Console SQL Editor or run over the HTTP proxy.

## Git flow

Both remotes mirror the full monorepo, but only `origin` triggers
deployments now. **`tsh-api` was reconnected (2026-11-11) to the
`DuoForgeIt-Client` repo** — its production build log reads
`Cloning github.com/RAYHAN-HEXA/DuoForgeIt-Client (Branch: main)` — so a
single push deploys BOTH apps:

| Remote | Repository | Vercel project(s) |
| --- | --- | --- |
| `origin` | `RAYHAN-HEXA/DuoForgeIt-Client` | `techservicehub` (web) **and** `tsh-api` (api) |
| `server` | `RAYHAN-HEXA/DuoForgeIt-Server` | none (legacy; can lag `main`) |

```bash
git push origin main   # triggers BOTH the web and the API production builds
git push server main    # keeps the server mirror in sync (no deploy)
```

Production Branch is `main` for both projects. Pushes to other branches create
Preview deployments only.

## Verification

```bash
# API root: expect 200 + the service card (not Vercel's 404 page)
curl -sS https://tsh-api-mu.vercel.app/

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

## Troubleshooting — API shows "page does not exist"

Vercel's generic 404 page means the request never reached the Express app.
Work through these in order:

1. **Find which URL is failing.**

   ```bash
   curl -sS -i https://tsh-api-mu.vercel.app/            # root
   curl -sS -i https://tsh-api-mu.vercel.app/api/health  # real endpoint
   ```

   - Root 200 + health 200 → working (root is the JSON service card).
   - Root 404 + health 200 → the deployment predates the root-landing
     function; push the fix and let Vercel rebuild.
   - Both 404 → continue below.

2. **Confirm the production deployment exists and owns the alias.**

   ```bash
   vercel ls tsh-api --scope team_O1oPgRz3daZh9vouQVNfzzn5
   vercel inspect https://tsh-api-mu.vercel.app --scope team_O1oPgRz3daZh9vouQVNfzzn5
   ```

   Expect `● Ready`, `target production`, the alias `tsh-api-mu.vercel.app`,
   and a build line containing `λ api/[...path]`. If no function is listed,
   the build never produced `dist/app.js` — read the build log with
   `vercel inspect <deployment-url> --logs`.

3. **Check the local project link.** `apps/api/.vercel/project.json` must point
   at the current project `prj_VW7s1sjXMAixBKaSw8GbzNsoUDBa`. If it still
   contains the old (deleted) id, relink before any manual deploy:

   ```bash
   cd apps/api
   vercel link --project tsh-api --scope team_O1oPgRz3daZh9vouQVNfzzn5
   ```

4. **Reattach the domain if the project was recreated.** Add
   `tsh-api-mu.vercel.app` under Project → Settings → Domains (or
   `vercel domains add tsh-api-mu.vercel.app tsh-api`), then point it at the
   current production deployment:

   ```bash
   vercel alias set <production-deployment-url> tsh-api-mu.vercel.app \
     --scope team_O1oPgRz3daZh9vouQVNfzzn5
   ```

5. **If only `/api/*` is 404 while the function exists,** confirm the rewrites
   in `apps/api/vercel.json` still map `/api/(.*)` → `/api/[...path]` and that
   `/` → `/api`. If `outputDirectory` ever causes Vercel to drop the function,
   remove that setting and redeploy — the function imports `dist/app.js`
   directly.

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
