# TechService Hub

Dual-founder IT solutions & academic project services platform. Customers browse a
service marketplace, pick a project lead (Founder A — engineering / Founder B — design
& docs), submit requirements with files, pay via manual BDT verification
(bKash/Nagad/Rocket/bank), and track their project through a seven-stage pipeline.

## Stack

| Layer    | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Web      | Next.js 16 (App Router, Turbopack, cacheComponents), Tailwind v4, shadcn/ui, Framer Motion, SWR, React Hook Form + Zod, Firebase JS SDK |
| API      | Express 5, Firebase Admin (ID-token auth), Prisma 6, Zod, pino, express-rate-limit |
| DB       | Neon PostgreSQL (pooled `DATABASE_URL` + direct `DIRECT_URL` for migrations) |
| Files    | Vercel Blob — private store, server-minted upload tickets, short-lived signed downloads (graceful 503 when unconfigured) |
| Shared   | `@tsh/shared` — types, Zod schemas, constants (order pipeline, transitions, upload limits), money utils |

## Monorepo layout

```
apps/web        Next.js app (src/app, route groups: (site) marketing+app, (auth) mascot screens)
apps/api        Express API (controllers → services → Prisma; validated() middleware)
packages/shared Compiled to dist/ — both apps resolve the built output
```

## Production deployments

| App | URL | Vercel project | Root directory |
| --- | --- | --- | --- |
| Web | https://techservicehub.vercel.app | `techservicehub` | `apps/web` |
| API | https://tsh-api-mu.vercel.app/api | `tsh-api` | `apps/api` |

Web and API are cross-wired through Vercel Production env vars:
`NEXT_PUBLIC_API_URL` (web) points at the API base URL, and `CORS_ORIGINS`
(API) allows the web origin. Because `NEXT_PUBLIC_*` values are inlined at
build time, changing them requires a new web deployment.

Deploys run from Git: pushing `main` to
`RAYHAN-HEXA/DuoForgeIt-Client` builds the web project and pushing `main` to
`RAYHAN-HEXA/DuoForgeIt-Server` builds the API project. See
`docs/DEPLOYMENT.md` for the full runbook.

## Running locally

```bash
npm install                  # workspaces + prisma generate (postinstall)
npm run db:migrate           # apply Prisma migrations (apps/api/.env)
npm run db:seed              # seed founders, 7 categories, services, testimonials
npm run dev                  # api on :5000 + web on :3000 (concurrently)
```

Shared package note: `@tsh/shared` is consumed as compiled `dist/` by both apps.
Both dev scripts run a `predev` build of the shared package; after editing
`packages/shared/src`, restart `npm run dev` (or run `npm run build -w @tsh/shared`).

### Environment

- `apps/api/.env` — `DATABASE_URL`, `DIRECT_URL`, `FIREBASE_PROJECT_ID` +
  service-account creds (`FIREBASE_SERVICE_ACCOUNT_BASE64` or cert vars),
  `BLOB_READ_WRITE_TOKEN` (from a private Vercel Blob store),
  `SEED_FOUNDER_A_EMAIL`/`SEED_FOUNDER_B_EMAIL` (see `.env.example`). The API
  boots without Firebase/Blob and reports gaps on `/api/health`.
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL` + Firebase web config
  (see `.env.local.example`).

### Promoting a founder to admin

Founder users are pre-seeded with `firebaseUid: null` and role ADMIN. The first
time the real founder signs in with a matching **verified** Firebase email, the
auth-sync endpoint claims the row — no self-service role escalation is possible.

## Key API surface

- `POST /api/auth/sync` · `GET /api/auth/me` — Firebase ID token → Neon profile
- `GET /api/public/homepage` · `GET /api/services[/:slug]` · `GET /api/categories`
- `POST /api/contact` — public contact form; saves to the admin inbox and emails both founders
- `GET/POST/PATCH/DELETE /api/cart(/items/:itemId)` — server-computed totals
- `POST /api/orders` — idempotent checkout (`TSH-YYYY-NNNNNN`, snapshot pricing,
  transactional); `GET /api/orders[/:id]`; cancel/payment/revision/review/attachment subroutes
- `POST /api/uploads/blob/token` — scoped private Vercel Blob upload ticket (503 `FILE_STORAGE_UNCONFIGURED` until configured)
- `GET /api/notifications` (+ read)
- `/api/admin/*` — stats & analytics, order moderation (legal `ORDER_TRANSITIONS`
  enforced), founder reassignment, payment verification, deliverables, revisions,
  customers, contact inbox, site content — every sensitive action audited

## Verification

```bash
npm run typecheck   # tsc in all three workspaces
npm run lint        # eslint (shared, api, web)
npm test            # vitest: money math, order rules, API envelope/RBAC smoke
npm run build       # shared dist → api tsc → next build (23 routes, PPR)
```
