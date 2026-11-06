# Production deployment runbook

## Canonical URLs

| App | URL | Vercel project | Project ID | Root directory |
| --- | --- | --- | --- | --- |
| Web | https://techservicehub.vercel.app | `techservicehub` | `prj_kWJ6c7wBIN3KMCN6fvarYZV3kmFg` | `apps/web` |
| API | https://tsh-api-mu.vercel.app/api | `tsh-api` | `prj_WSPOKE9ZliB3deYy1VQdgHFTHq8G` | `apps/api` |

Legacy web aliases (`tsh-web-three`, `tsh-web-sandy`, `tsh-web-rahan-hexa`) 308-redirect
to the canonical domain, and their origins stay on the API allow-list so old
bookmarks never hit a CORS wall.

- Vercel team: `RAHAN-HEXA` (`team_O1oPgRz3daZh9vouQVNfzzn5`)
- Health check: https://tsh-api-mu.vercel.app/api/health

## Environment contract (Production)

| Project | Variable | Value |
| --- | --- | --- |
| `techservicehub` | `NEXT_PUBLIC_API_URL` | `https://tsh-api-mu.vercel.app/api` |
| `tsh-api` | `CORS_ORIGINS` | `https://techservicehub.vercel.app,https://tsh-web-three.vercel.app,https://tsh-web-sandy.vercel.app,https://tsh-web-rahan-hexa.vercel.app,https://techservicehub-rahan-hexa.vercel.app` |
| `tsh-api` | `ADMIN_PANEL_URL` | `https://techservicehub.vercel.app` |

Notes:

- `NEXT_PUBLIC_API_URL` is inlined into the client bundle at build time. Change it
  first, then redeploy the web project; restarts alone do not pick it up.
- `CORS_ORIGINS` is a comma-separated allow-list. No trailing slashes.
- Production variables are marked sensitive; `vercel env pull` writes empty
  values for them. Verify behaviour, not the pulled file.
- Never put secrets in `NEXT_PUBLIC_*` variables.

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
