# Marketplace launch runbook (v2 flag rollout)

Companion to [DEPLOYMENT.md](DEPLOYMENT.md) and
[2026-11-06-marketplace-catalog-status.sql](db/2026-11-06-marketplace-catalog-status.sql).
Everything in **Phase 0/1 ops** is a dashboard/CLI action outside the repo —
code changes listed here are already merged.

## Flag coupling (critical)

Two independent flags must **always flip together**:

| Flag | Where | Effect |
|---|---|---|
| `SERVICE_MARKETPLACE_ENABLED` | API (tsh-api) | Registers `/api/marketplace/*` routes; v2 catalog filters `status='PUBLISHED'` only |
| `NEXT_PUBLIC_SERVICE_MARKETPLACE_ENABLED` | Web (techservicehub) | Switches pages to v2 catalog/detail/request UI — **baked at build time; changing it requires a redeploy** |

Order is API-first: the API flag can be ON while the web flag is OFF (the web
app keeps calling legacy endpoints — that combination is verified below).
Web-flag-ON with API-flag-OFF is broken by construction (marketplace fetches 404).

`WALLET_ENABLED` / `NEXT_PUBLIC_WALLET_ENABLED` follow the same pattern when the
wallet phase ships.

## Phase 0 — ops prerequisites (before any deploy)

1. **Rotate the DB password** — the neondb_owner credential was exposed in
   chat. Create a new password in the Neon dashboard → update `DATABASE_URL`
   and `DIRECT_URL` on tsh-api (Vercel Production env) → redeploy API →
   `GET /api/health` must report `db: "ok"`. Never put credentials in repo files.
2. **Snapshot** — create a Neon branch of production (or `pg_dump`). Keep it
   until post-launch verification passes; it is the DB rollback path.
3. **Test accounts** — one staging user + one admin (founder) account in
   Firebase + Neon. Production has 8 users, 0 orders, 0 payments: every
   authenticated flow must be exercised with these before/after launch.
4. **Deploy targets** — API project `tsh-api`, web project `techservicehub`.
   All `NEXT_PUBLIC_*` values bake at build time.

## Environment variables per phase

| Phase | Project | Vars |
|---|---|---|
| 0 | tsh-api | `DATABASE_URL`, `DIRECT_URL` (rotated) |
| 1a (file storage) | tsh-api | attach Vercel Blob store → `BLOB_READ_WRITE_TOKEN` |
| 1b (rate limiting) | tsh-api | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_TOKEN` |
| 1c (email) | tsh-api | `RESEND_API_KEY`, `MAIL_FROM`, `FOUNDER_NOTIFY_EMAILS` (or `SMTP_*`) |
| 3 (canonical URL) | techservicehub | `NEXT_PUBLIC_SITE_URL=https://techservicehub.vercel.app` |
| 5 (launch) | both | the two marketplace flags above (web one + redeploy) |

Single production check after any API deploy:

```bash
curl -s https://<api-domain>/api/health | jq .data
# expect: status ok, db ok, firebase ok, and .data.features:
# { serviceMarketplace, wallet, blobStorage, email, redisRateLimiting }
```

`email: "none"` = mail is intentionally deferred (contact messages are
DB-only); `blobStorage: false` = uploads return 503 `FILE_STORAGE_UNCONFIGURED`.

## Deployment sequence

1. Rotate DB password → update tsh-api env → redeploy API → health check `db: ok`.
2. Add Blob / Upstash / mail envs → API redeploy → verify
   upload ticket, rate-limit burst, founder email on a staging order.
3. Apply `docs/db/2026-11-06-marketplace-catalog-status.sql` in a transaction
   (pre-flight checks first). Flag still OFF. Verify:
   - SQL counts: exactly `PUBLISHED|true|7`, nothing else published-active.
   - Legacy catalog unaffected: `GET /api/services` returns the same 7.
   - Enable the **API** flag only → `GET /api/marketplace/services` returns
     200 with **exactly the same 7 services** (compare counts) — this is the
     API-on / web-off combination that must match before touching the web flag.
4. Merge web fixes + set `NEXT_PUBLIC_SITE_URL` → deploy web (flag still off).
   Verify: `/services` legacy, `/services/<slug>` real 404 for unknown slugs,
   security headers, sitemap/robots on the canonical domain.
5. **Only then** flip both marketplace flags → redeploy web (build bakes the
   flag) → smoke test v2 catalog/detail/request → monitor.
6. Any failed check ⇒ keep/turn the flags OFF; legacy catalog keeps working
   because the 7 rows remain active.

## Verification matrix

### Public / unauthenticated
- 20+ routes: no console errors, no failed requests.
- `/services` HTML contains 7 cards; category filter, search, all sorts,
  pagination, clear filters.
- Degraded params never 422: `?page=2`, `?page=99` (out-of-range state),
  `?page=abc` (→ 1), `?sort=bogus` (→ popular), 140-char search.
- FAQ accordion, mobile nav, anchors, contact form (success + honeypot).
- `/services/does-not-exist` → branded not-found page, server-rendered, with
  `<meta name="robots" content="noindex">` (crawl-safe). Unknown route → branded 404.
- CORS: canonical + legacy origins allowed; `evil.example` receives no ACAO header.
- Headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`, CSP **Report-Only**; `/dashboard` + `/login` carry
  `X-Robots-Tag: noindex, nofollow`.
- `sitemap.xml` / `robots.txt` use `https://techservicehub.vercel.app`; no
  `/login`, `/register`, or `/wallet` entries.

### API
- `/api/health` → status/db/firebase ok + `features` block.
- Catalog contracts: valid query 200, invalid 422, unknown service 404,
  out-of-range page 200 (empty).
- Protected endpoints → 401; `/api/marketplace/*` → 404 while the flag is off.
- Burst >60 on `/api/auth/*` → 429, consistent across replicas (Redis store).

### Authenticated (test accounts)
- Sign in → `/api/auth/me` 200; `?next=` only ever lands on internal paths
  (`?next=https://evil.example` → `/dashboard`; `//evil.example` likewise).
- Cart → persists → checkout steps → order created.
- Payment submit + screenshot upload (Blob).
- Notifications list/read.
- Admin: orders, payment review, deliverable upload, payment accounts/QR,
  messages. `/admin/payments` returns there after login (deep link).
- Founder + customer emails received.

### Database
- Migration applied in a transaction; no failed/rolled-back entries.
- 7 active+published services; 0 stray published-inactive services; no
  zero-price published service.
- Backup/branch exists; restore path rehearsed.

## Rollback

- **Web/API**: Vercel instant rollback to the previous READY deployment.
- **Database**: restore the Neon branch/snapshot, or run the inverse UPDATE in
  the SQL file's rollback section.
- **Feature flags**: turn off immediately (both); legacy catalog keeps working
  because the 7 rows stay `isActive=true`.
- Rotate credentials again if any secret leaked during debugging.

## Known follow-ups (non-blocking)

- **CSP**: currently Report-Only. After a clean production report window,
  promote `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in
  `apps/web/next.config.ts`.
- **HTTP 404 status for unknown service slugs**: the detail page renders the
  branded not-found page server-side (noindex + correct title), but the HTTP
  status remains 200. This is a structural `cacheComponents` (partial
  prerendering) limitation: runtime-decided `notFound()` fires inside the
  streamed boundary after the shell flushes, page-scope uncached I/O is a
  build error, and `dynamic = 'force-dynamic'` is rejected when
  cacheComponents is enabled. Mitigations in place: `noindex` robots meta +
  `X-Robots-Tag` for the auth area. A true 404 would require dropping
  cacheComponents, a middleware pre-fetch per slug view (hot-path API call),
  or a status-rewriting proxy — none justified today.
- **v2 field completeness for the 7 legacy services**: `serviceType` /
  `pricingModel` / `priceFrom|priceTo` / `deliveryEstimateText` are null for
  rows seeded from the legacy catalogue. The v2 card DTO tolerates nulls, but
  check the card rendering (price display, delivery text) during the step-3
  API-flag verification; set the v2 fields via admin/SQL if a card looks wrong.
- **Re-seeding prod after the migration** re-archives the 7 (seed.ts marks
  legacy slugs ARCHIVED). Don't re-run `npm run db:seed` against production
  post-migration.
- **Web test coverage**: apps/web has no test runner; the route-resolution
  checks (`/services/it-consulting-sprint/request` etc.) are manual curl steps
  in the matrix above.
- **Home canonical**: `/` and `/services` carry explicit canonicals; filter
  URLs consolidate onto `/services`. Remaining client-only pages rely on the
  `X-Robots-Tag` noindex header instead of per-page metadata.
