# TechService Hub — Payment Integration Technical Report

| | |
|---|---|
| **Document** | Payment Integration Technical Report (Phase 1 Analysis + Phase 2 Design) |
| **Project** | TechService Hub — two-founder IT services platform |
| **Date** | 2026-11-05 |
| **Scope** | SSLCOMMERZ gateway integration for order payments; direct bKash reserved as future gateway |
| **Status** | Phase 1 ✅ verified analysis · Phase 2 ✅ design complete · **Phase 3 (implementation) awaiting approval** |
| **Constraint honored** | Phases 1–2 are read-only: no code, no packages, no migrations, no gateway transactions |

---

## Table of Contents

- [Part A — Phase 1: Complete Codebase Analysis](#part-a--phase-1-complete-codebase-analysis)
  - [1. Executive Summary](#1-executive-summary)
  - [2. Verified Technology Stack](#2-verified-technology-stack)
  - [3. Project Directory Structure](#3-project-directory-structure)
  - [4. Existing Database Architecture](#4-existing-database-architecture)
  - [5. Existing Customer Order Workflow](#5-existing-customer-order-workflow)
  - [6. Authentication and Authorization](#6-authentication-and-authorization)
  - [7. Existing Payment Functionality](#7-existing-payment-functionality)
  - [8. Missing Payment Features](#8-missing-payment-features)
  - [9. Security Assessment](#9-security-assessment)
  - [10. Existing Files Requiring Modification](#10-existing-files-requiring-modification)
  - [11. Potential New Files](#11-potential-new-files)
  - [12. Recommended Payment Architecture](#12-recommended-payment-architecture)
  - [13. Technical Risks and Dependencies](#13-technical-risks-and-dependencies)
  - [14. Recommended Implementation Roadmap](#14-recommended-implementation-roadmap)
- [Part B — Phase 2: Payment Architecture and Database Design](#part-b--phase-2-payment-architecture-and-database-design)
  - [B1. Design Decisions](#b1--design-decisions)
  - [B2. Database Design](#b2--database-design)
  - [B3. Payment Status Lifecycle](#b3--payment-status-lifecycle)
  - [B4. API Contract](#b4--api-contract)
  - [B5. Core Flows](#b5--core-flows)
  - [B6. Gateway Adapter Interface](#b6--gateway-adapter-interface)
  - [B7. Idempotency and Race-Safety Design](#b7--idempotency-and-race-safety-design)
  - [B8. Web Integration Design](#b8--web-integration-design)
  - [B9. Admin Integration Design](#b9--admin-integration-design)
  - [B10. Environment Contract](#b10--environment-contract-api-additions)
  - [B11. Security Controls → Phase 1 Risk Map](#b11--security-controls--phase-1-risk-map)
  - [B12. Technical Risks and Operational Constraints](#b12--technical-risks-and-operational-constraints)
  - [B13. Testing Plan](#b13--testing-plan)
  - [B14. Phase 3 Implementation Map](#b14--phase-3-implementation-map)
- [Appendix A — Verified SSLCOMMERZ v4 API Facts](#appendix-a--verified-sslcommerz-v4-api-facts)
- [Appendix B — Open Items for Approval](#appendix-b--open-items-for-approval)
- [Appendix C — Sources](#appendix-c--sources)

---

# Part A — Phase 1: Complete Codebase Analysis

> Everything in Part A was verified by direct file inspection on 2026-11-05. Facts are cited
> with file paths, function names, and schema evidence. Statements that could not be verified
> from code are explicitly labeled **[Assumption]** or **[Could not verify]**.

---

## 1. Executive Summary

The project is **TechService Hub** — a two-founder IT-services marketplace (Next.js 16 web +
Express 5 API + Neon PostgreSQL/Prisma 6 + Firebase Auth), deployed on Vercel as two projects.

**Headline finding: the codebase was explicitly designed for the integration requested.**
The PRD (`docs/PRD.html`, FR-18) reserves `Payment.provider` / `Payment.providerRef` columns
precisely so a gateway "slots in without migration churn," and both PRDs list *"Automated
payment gateway integration"* as out-of-scope-for-now with those hooks reserved. The current
payment system is **manual BDT verification** (customer submits bKash/Nagad/Rocket/bank TrxID →
founder verifies in admin panel), and it is fully implemented and functional.

A substantial **Wallet subsystem (Addendum v1.1)** exists in the database schema and shared
constants, but has **zero runtime implementation** — no routes, no controllers, no services,
no UI. The marketplace v2 "request → quotation → pay" flow is implemented only up to request
submission; quotation and payment stages have schema but no API.

**Integration feasibility: HIGH.** The architectural seams are already in place (provider
fields, idempotent orders, server-side money math, audit logging, notification service,
transactional patterns, flag-gated features). The main design decisions for Phase 2 were:
(a) how to represent a card-payment gateway in the `PaymentMethod` enum, (b) where gateway
session/attempt state lives, and (c) making payment status transitions race-safe for
concurrent callback + IPN delivery — the current `reviewPayment` uses a check-then-write
pattern without a DB transaction guard, which is acceptable for 2 human admins but must be
hardened for automated webhook concurrency.

---

## 2. Verified Technology Stack

All verified from `package.json` files at repo root and in each workspace.

| Layer | Technology | Evidence |
|---|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`), Node ≥ 24, TS 5.7 | root `package.json` |
| Web | Next.js **16.4.3** (App Router, Turbopack, cacheComponents/PPR), React 19.3, Tailwind v4, shadcn/radix-ui, SWR 2.5, react-hook-form, zod 4.1, Firebase JS SDK 13, sonner, framer-motion | `apps/web/package.json` |
| API | Express **5.3.0**, Prisma client **6.19.3**, firebase-admin **13.10.0**, zod **4.6.7**, pino + pino-http, helmet 8.3, express-rate-limit 7.5.1, cors, nodemailer 10.3.1, decimal.js-light, vitest + supertest | `apps/api/package.json` |
| Shared | `@tsh/shared` — types, Zod schemas, domain constants, BigInt-cents money utils. **Consumed as a vendored copy** (`apps/*/src/vendor-shared`) synced by `scripts/vendor-shared.sh` on dev/build | `packages/shared/`, `VENDORED.md` |
| Database | Neon PostgreSQL — pooled `DATABASE_URL` + direct `DIRECT_URL` (PgBouncer-aware), Prisma 6, `binaryTargets: ["native", "rhel-openssl-3.0.x"]` for Vercel | `apps/api/prisma/schema.prisma:13-24` |
| Auth | Firebase Authentication (email/password + Google) → ID token → firebase-admin `verifyIdToken`; roles/status live only in Postgres | `apps/api/src/services/token.service.ts`, `apps/api/src/middleware/auth.ts` |
| Files | Cloudinary signed client-side uploads; Postgres stores references only | `apps/api/src/utils/cloudinary.ts`, `apps/web/src/lib/api.ts:91-106` |
| Email | Resend REST API or SMTP (nodemailer), **best-effort founder alerts only** | `apps/api/src/services/mail.service.ts` |
| Deployment | **Vercel** — API = one catch-all serverless function `apps/api/api/[...path].js` importing compiled `dist/app.js`; rewrite `/api/(.*)`. Web = separate Vercel project | `apps/api/vercel.json` |

**Money convention (critical for payments):** `Decimal(12,2)` in Postgres → **serialized as
strings** over the API → **BigInt integer-cents math** in `apps/api/src/utils/money.ts` and
`apps/api/src/services/order.service.ts:198-221` (`computeTotal`, `moneyToCents`,
`centsToMoney`). No floats ever touch money. The gateway layer must follow the same convention.

---

## 3. Project Directory Structure

```
├── apps/
│   ├── api/                      Express 5 REST API (@tsh/api)
│   │   ├── api/[...path].js      Vercel serverless entry (whole app as one function)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     Single source of truth for DB
│   │   │   ├── seed.ts           Founders, catalog, marketplace services, wallet config seed
│   │   │   └── migrations/       5 migrations (latest: 20261104210000_service_marketplace_and_wallet)
│   │   ├── scripts/              set-role.ts, provision-accounts.ts, purge-service-data.ts
│   │   └── src/
│   │       ├── app.ts            createApp(): helmet → CORS → json(1mb) → pinoHttp → /api router → errorHandler
│   │       ├── server.ts         Local dev listener (tsx watch)
│   │       ├── catalogue.ts      Marketplace v2 seed catalog (PRD §C/§D pricing)
│   │       ├── config/           env.ts (zod-parsed env contract), prisma.ts, firebase.ts
│   │       ├── middleware/       auth.ts, validate.ts (Zod → req.validated), error.ts, rate-limit.ts
│   │       ├── routes/index.ts   ALL route mounting (single file, sub-routers)
│   │       ├── controllers/      auth, catalog, cart, order, admin, marketplace, user,
│   │       │                     notification, contact, upload
│   │       ├── services/         order.service/rules, cart, admin, marketplace, mail,
│   │       │                     notification, token, user, user-sync
│   │       ├── repositories/     catalog.repository.ts
│   │       ├── utils/            money.ts, mappers.ts (DTO mapping), ApiError.ts, envelope.ts,
│   │       │                     audit.ts, cloudinary.ts, logger.ts
│   │       ├── tests/            vitest: app (envelope/RBAC smoke), domain, money, catalogue, env
│   │       └── vendor-shared/    Vendored @tsh/shared copy (d.ts + js)
│   └── web/                      Next.js 16 app (@tsh/web)
│       └── src/
│           ├── app/
│           │   ├── (auth)/       login, register, forgot-password, reset-password
│           │   ├── (site)/       page (home), services/[slug](/request), cart, checkout,
│           │   │                 orders(/[id]), dashboard, profile, notifications,
│           │   │                 admin/(orders/[id], payments, customers, messages)
│           │   ├── layout.tsx, error.tsx, not-found.tsx, robots.ts, sitemap.ts
│           ├── components/       order-tracker, status-badge, guards, founder-picker,
│           │                     marketplace/, site/, ui/ (shadcn)
│           ├── hooks/            use-auth.tsx, use-cart.tsx, use-mascot-form.ts
│           ├── lib/              api.ts (typed fetch client), server-api.ts, firebase.ts, feature-flags.ts
│           └── vendor-shared/    Vendored @tsh/shared copy
├── packages/shared/              @tsh/shared source (constants, schemas, types, utils)
├── docs/                         PRD v1.0 + PRD-Addendum v1.1 Wallet (HTML + PDF)
└── scripts/vendor-shared.sh      Syncs shared → vendor copies
```

**Responsibilities of key directories:** `controllers` parse `req.validated` and orchestrate;
`services` own business rules + Prisma access; `middleware/validate.ts` guarantees every
request body/query/params is Zod-parsed before handlers run; `utils/mappers.ts` is the single
DTO layer that converts `Decimal` → string; `vendor-shared` is the deployed form of
`packages/shared` — **any shared-package change for payments must be synced to both vendored
copies** (this is an easily-missed step; `apps/api/src/vendor-shared/VENDORED.md` documents
the mechanism).

---

## 4. Existing Database Architecture

Verified against `apps/api/prisma/schema.prisma` (1,013 lines) and migrations
`20261031162538_init` → `20261104210000_service_marketplace_and_wallet` (which created all
wallet/marketplace tables, including the partial unique index `deposit_trx_unique_per_method`
at migration line 494).

### 4.1 Identity & roles

**`User`** (`schema.prisma:267-308`) — `id` UUID PK, `firebaseUid` unique (nullable until
claim), `email` unique, `role` `UserRole` (`CUSTOMER | ADMIN`) default CUSTOMER,
`accountStatus` (`ACTIVE | SUSPENDED`), plus relations to orders, wallet, deposits, etc.
**Roles and status live only here and are never accepted from clients** (schema comment,
lines 262-265; enforced in `auth.ts`). There are no other admin/role tables — RBAC is a
single enum on `User`.

### 4.2 Catalog & cart

- **`Service`** (`schema.prisma:352-399`) — `basePrice Decimal(12,2)`, `deliveryDays Int`,
  legacy `isActive` + v2 `status ServiceStatus`, pricing-model fields
  (`priceFrom/priceTo/priceNote`), `options ServiceOption[]`.
- **`ServiceOption`** (`schema.prisma:401-422`) — `priceDelta Decimal(12,2)`, `daysDelta Int`,
  `groupKey` (single-select per group except `extras`).
- **`Cart` / `CartItem` / `CartItemOption`** (`schema.prisma:426-460`) — one cart per user
  (unique `userId`), unique `[cartId, serviceId]` (dedupe), option links. **Cart stores no
  money** — totals are always computed server-side from live catalog (`cart.service.ts:36-87`).

### 4.3 Orders

**`Order`** (`schema.prisma:464-515`) — columns relevant to payments:

| Column | Type / Constraint | Payment relevance |
|---|---|---|
| `totalAmount` | `Decimal(12,2)`, NOT NULL | The single source of truth for what a customer owes |
| `idempotencyKey` | `String @unique` | Duplicate-submission guard, minted client-side per checkout attempt |
| `orderNumber` | `String @unique` (`TSH-YYYY-NNNNNN`) | Display/reference identifier |
| `amountPaid` | `Decimal?` (nullable) | **v2 wallet path only**; legacy orders leave null |
| `amountRefunded` | `Decimal(12,2) @default(0)` | Refund cap field — exists, **no code writes it today** |
| `paymentStatus` | `OrderPaymentStatus?` (`PAID/PARTIALLY_REFUNDED/REFUNDED`) | Null = legacy manual path (schema comment line 54) |
| `requestId` / `acceptedQuotationId` (unique) | nullable FKs | v2 quotation-paid orders; `acceptedQuotationId` unique enforces one order per quotation |
| `serviceSnapshot` | `Json?` | Frozen pricing snapshot rule (R4) |

**`OrderItem`** (`schema.prisma:517-534`) — snapshot pricing: `serviceName VarChar(160)`,
`basePrice`, `quantity`, `lineTotal` — "never join to the live catalog for money."
**`OrderItemOptionSnapshot`** (536-545) freezes per-option deltas. **`OrderStatusHistory`**
(602-614) is the append-only legacy timeline; **`StatusHistory`** (862-874) is the
polymorphic v2 timeline.

### 4.4 Payments (existing)

**`Payment`** (`schema.prisma:620-640`) — the table the gateway integration extends:

```
id                 UUID PK
orderId            FK → Order, onDelete: Cascade
method             PaymentMethod: BKASH | NAGAD | ROCKET | BANK_TRANSFER
status             PaymentStatus: PENDING | SUBMITTED | VERIFIED | REJECTED | REFUNDED  (default PENDING)
amount             Decimal(12,2)
transactionId      String?          — customer-submitted TrxID (manual path)
screenshotPublicId String?          — reserved, unused today
adminNote          String?
verifiedById       FK → User (SetNull), verifiedAt  — set only on admin VERIFIED
provider           String @default("MANUAL")        ← gateway adapter slot
providerRef        String?                          ← gateway session/val_id slot
createdAt/updatedAt
Indexes: [orderId], [status, createdAt]
```

Schema header comment (lines 616-618): *"Manual BDT verification in v1. `provider`/
`providerRef` exist from day one so a gateway adapter (SSLCOMMERZ, Stripe, …) later is
additive-only."*

### 4.5 Wallet & related (schema-complete, runtime-absent)

All created by migration `20261104210000`:

- **`Wallet`** (891-907) — `userId @unique`, `balance`, `heldBalance`, `status`
  (ACTIVE/FROZEN/CLOSED), **`version Int`** documented as "optimistic-lock counter bumped on
  every balance mutation."
- **`WalletTransaction`** (910-928) — immutable append-only ledger (`balanceBefore/
  balanceAfter`, `type WalletTxType`, `direction`, `refType/refId`).
- **`DepositRequest`** (933-960) — manual deposits with `trxIdNormalized` + **partial unique
  index on `(method, trxIdNormalized) WHERE status <> 'DECLINED'`** (added in raw SQL — an
  existing precedent for exact duplicate-payment prevention to be reused).
- **`WithdrawalRequest`** (964-986), **`PaymentMethodConfig`** (989-1006, PK = `WalletMethod`
  — per-method receiving account, min/max, fees), **`WalletSetting`** (1009-1013, key/value JSON).
- Related enums in shared constants: `DEFAULT_WALLET_LIMITS`
  (`packages/shared/src/constants/index.ts:385-395`).

### 4.6 How order totals are calculated (verified end-to-end)

1. Cart preview: `cart.service.ts:serializeCart` → `unitPrice(base, ΣpriceDelta)` →
   `lineTotal` → `sumMoney` (all BigInt cents, `utils/money.ts`).
2. Checkout: client sends **only** `serviceId/quantity/optionIds` (`checkoutSchema`,
   `packages/shared/src/schemas/index.ts:119-138`) — no money fields exist in the schema.
3. `order.service.ts:checkout()` re-fetches services/options server-side, validates every
   option belongs to the service, computes total via `computeTotal()` in BigInt cents, and
   writes order + snapshot items **in one `prisma.$transaction`** with `idempotencyKey`
   replay and P2002 retry (`MAX_CHECKOUT_ATTEMPTS = 4`).
4. Manual payment: `order.controller.ts:submitPayment` sets
   `amount = order.totalAmount.toString()` — **the client cannot influence the payment amount**.

---

## 5. Existing Customer Order Workflow

Traced function-by-function:

| # | Step | Verified implementation |
|---|---|---|
| 1 | Browse services | `GET /api/services` + `/services/:slug` + `/categories` + `/public/homepage` (`routes/index.ts:82-97` → `catalog.controller.ts`; v2 variant behind `serviceMarketplaceEnabled` flag at `routes/index.ts:101-133`) |
| 2 | Add to cart | `use-cart.tsx` → `POST /api/cart/items` (`cartItemAddSchema`) → `cart.service.ts:addItem` (dedupe, option group rules, server totals) |
| 3 | Checkout wizard | `apps/web/src/app/(site)/checkout/checkout-content.tsx` — 8 steps (Review → Requirements → Files → Deadline → Lead → Pricing → Payment method → Submit). Payment step (step 6, lines 355-384) only *remembers the method* in `sessionStorage`; **no money moves at checkout** |
| 4 | Order creation | `POST /api/orders` (`routes/index.ts:154`) → `order.controller.create` (`order.controller.ts:23-74`) → `order.service.checkout` (transactional, idempotent) |
| 5 | Post-order notifications | In-app `notifyUser` + best-effort founder email `notifyFounders` (`order.controller.ts:36-68`) |
| 6 | Redirect | `router.replace('/orders/${order.id}')` (`checkout-content.tsx:181`) |
| 7 | Pay manually | Order page `PaymentSection` (`orders/[id]/page.tsx:337-396`) → `POST /api/orders/:id/payments` `{method, transactionId}` → `order.controller.submitPayment` (`order.controller.ts:146-208`) creates `Payment{status: SUBMITTED, amount: order.totalAmount}` — **never marks the order paid** |
| 8 | Admin verification | `/admin/payments` page (`admin/payments/page.tsx:31-42`) → `PATCH /api/admin/payments/:id {decision: VERIFIED\|REJECTED}` → `admin.controller.reviewPayment` → `admin.service.reviewPayment` (`admin.service.ts:215-236`) — writes `verifiedById/verifiedAt`, guards already-`VERIFIED`/`REFUNDED`, audit `PAYMENT.VERIFY`, customer notification |
| 9 | Order progression | `PATCH /api/admin/orders/:id/status` → `admin.service.changeOrderStatus` enforces `ORDER_TRANSITIONS` via `order.rules.ts:assertTransition`; timestamps + history + audit + notification (`admin.controller.ts:78-103`) |

Status machine: `packages/shared/src/constants/index.ts:84-99` (`ORDER_TRANSITIONS`) —
7-stage pipeline `SUBMITTED → UNDER_REVIEW → APPROVED → IN_PROGRESS → QUALITY_REVIEW →
COMPLETED → DELIVERED` plus `REJECTED/CANCELLED` terminals, and a separate
`ORDER_TRANSITIONS_V2` map (106-112) for quotation-paid orders starting at `PAID_SCHEDULED`
with `V2_REFUNDABLE_ON_CANCEL` (115-119).

**Notification system (verified):** in-app only for customers (`notification.service.ts` —
never throws); email is **founders-only** (`mail.service.ts:69-76`). Customers do **not**
receive email receipts today — receipts are the order page's `payments` list (`toOrderDto`
includes `payments: order.payments.map(toPaymentDto)`, `mappers.ts:264`).

---

## 6. Authentication and Authorization

Verified in `apps/api/src/middleware/auth.ts`, `services/token.service.ts`,
`controllers/auth.controller.ts`, `apps/web/src/hooks/use-auth.tsx`:

- **No sessions, no JWTs of our own** — pure Firebase ID tokens in `Authorization: Bearer`.
  `verifyBearerToken()` calls `firebaseAuth.verifyIdToken(token, false)`; roles inside the
  token are explicitly ignored ("informational only").
- Every authenticated request re-loads the `User` row from Postgres by `firebaseUid` →
  `req.authUser` (`authenticate`, `auth.ts:33-58`). Suspended accounts get 403
  `ACCOUNT_SUSPENDED`.
- `requireAdmin` (`auth.ts:61-66`) gates `/api/admin/*` (mounted `routes/index.ts:242`).
- **Ownership enforcement:** all customer order access goes through
  `getOwnOrder(customerId, orderId)` (`order.service.ts:237-244`) — a `findFirst` on
  `{id, customerId}`; cross-customer access returns 404, not 403 (no existence leak).
- Web side: `AuthProvider` registers a `tokenProvider` with `lib/api.ts` so every fetch
  attaches a fresh `getIdToken()`.
- CORS (`app.ts:27-37`): allowlist from `CORS_ORIGINS`, `credentials: false`, **and
  explicitly allows no-Origin (server-to-server) requests** — convenient for gateway
  IPN/webhook posts, which send no Origin header.
- Rate limits (`rate-limit.ts`): `apiLimiter` 600 req/15 min/IP on all of `/api`;
  `authLimiter` 60/15 min on auth/marketplace/uploads/contact. **Note for Phase 2:** the IPN
  endpoint sits under `apiLimiter`; gateway callbacks come from a small set of provider IPs,
  so a dedicated budget/exemption is specified in Part B.

**Payment-integration fit:** payment endpoints reuse `authenticate` + `getOwnOrder` verbatim
for all customer-facing routes; only the IPN/webhook routes are public — they use their own
verification scheme (server-to-server validation call against the gateway, i.e., trust the
gateway's API response, not the HTTP caller).

---

## 7. Existing Payment Functionality (classified)

| Feature | Status | Evidence |
|---|---|---|
| Payment data model | ✅ **Implemented** | `Payment` model + `PaymentMethod`/`PaymentStatus` enums (`schema.prisma:74-87, 620-640`) |
| Manual payment submission (customer) | ✅ Implemented | `POST /api/orders/:id/payments`, `paymentSubmitSchema` (`schemas/index.ts:142-145`), `order.controller.submitPayment` |
| Admin payment verification queue | ✅ Implemented | `GET/PATCH /api/admin/payments` (`routes/index.ts:224-229`), `admin.service.reviewPayment`, UI `admin/payments/page.tsx` |
| Customer payment UI + retry-on-rejection | ✅ Implemented | `PaymentSection` pre-fills rejected TrxID for resubmission (`orders/[id]/page.tsx:77, 338`) |
| Payment DTOs (worst-status-wins ranking) | ✅ Implemented | `mappers.ts:toPaymentDto/toAdminPaymentDto/toOrderSummaryDto:284` |
| Idempotent order creation | ✅ Implemented | `Order.idempotencyKey @unique` + `checkout()` replay logic |
| Gateway adapter hooks (columns only) | ✅ Implemented (as reserved fields) | `provider @default("MANUAL")`, `providerRef` — **unused today**; grep confirms zero writes |
| Audit trail on payment actions | ✅ Implemented | `PAYMENT.VERIFY` audit in `admin.controller.ts:152-159`; `AuditLog` model |
| In-app + founder-email notifications on pay/verify | ✅ Implemented | `order.controller.ts:164-190`, `admin.controller.ts:160-169` |
| Wallet subsystem (deposit/withdraw/ledger/settings) | ⚠️ **Partially implemented** — schema, migrations, seed (`seed.ts:582-596` `PaymentMethodConfig` upserts), shared constants/types, `WALLET_ENABLED` flags exist; **zero routes, controllers, services, or UI** (grep across `apps/api/src` and `apps/web/src` confirms: wallet appears only in constants/types/env-flag/catalog-seed/mappers comments) |
| Marketplace v2 request flow | ⚠️ Partial — request creation + file staging implemented (`marketplace.service.ts:createRequest:331-485`, `routes/index.ts:101-133`); **quotation endpoints do not exist** (grep for "quotation" in controllers/routes: zero hits), quotation→order→payment chain unimplemented |
| Refund functionality | ❌ **Not implemented** — `REFUNDED` exists only as an enum value, a guard in `reviewPayment` (`admin.service.ts:224`), and a display ranking (`mappers.ts:284`). No code path ever writes status `REFUNDED`, `amountPaid`, `amountRefunded`, or `OrderPaymentStatus` |
| Gateway integration (SSLCOMMERZ/bKash API) | ❌ Not implemented — no SDK dependency, no init/callback/IPN routes, no env vars, no checkout redirect. Grep for `sslcommerz\|sslcz\|gateway\|webhook\|ipn` across API source returns only comments/DTO names |
| Receipts (email/invoice) | ❌ Not implemented — in-app notifications + order-page payment list only |
| Payment history (customer) | ✅ Effectively implemented — every `OrderDto` embeds full `payments[]` history |
| Screenshot upload for payments | ⚠️ Partial — `screenshotPublicId` column + `hasScreenshot` in DTO exist; `submitPayment` always writes `hasScreenshot: false` (`order.controller.ts:199`); no upload path wired |

---

## 8. Missing Payment Features (delta for the integration)

1. **Gateway session/initiation** — create a gateway payment, get a redirect URL.
2. **Checkout redirection + return handling** — success/fail/cancel landing pages that hand
   off to server-side verification.
3. **Server-side transaction verification** — the hard requirement: never mark paid from the
   browser redirect; verify via gateway Validation/Query API.
4. **IPN/webhook endpoint** — public, auth-exempt, verification-protected, idempotent.
5. **Gateway-aware payment statuses** — current `PENDING → SUBMITTED → VERIFIED/REJECTED` is
   close but has no distinct `FAILED` vs `CANCELLED` semantics and no automated writer of
   `VERIFIED`.
6. **Automated refund execution** — everything needed (columns, enum, PRD REF-01…REF-05
   rules) exists on paper; zero implementation.
7. **Race-safe status transitions** — required once automated callbacks (not just humans)
   mutate payment state.
8. **Receipts** — customer emails and/or printable invoice.
9. **Admin gateway-payment management** — provider column in the queue, refund action,
   reconciliation view.
10. **New env-var contract** — `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` (+ sandbox
    flag/callback URLs), following the optional-at-boot pattern in `config/env.ts`.

---

## 9. Security Assessment

### 9.1 Existing controls inherited

- **Client-side amount manipulation: already impossible.** `checkoutSchema` and
  `paymentSubmitSchema` contain no money fields; totals are recomputed server-side
  (`checkout()`), and the payment row's amount is copied from `order.totalAmount`
  (`order.controller.ts:154-161`).
- **Unauthorized access:** ownership via `getOwnOrder`; admin surface fully behind
  `authenticate + requireAdmin`; roles re-read from DB every request.
- **Duplicate order creation:** `idempotencyKey` unique + replay (`checkout()` lines 70-78).
- **Injection/oversized payloads:** Zod on every route (`validate()` middleware), 1 MB JSON
  cap, helmet, CORS allowlist, rate limits.
- **Duplicate TrxID precedent:** the wallet design already solved manual duplicate-deposit
  via partial unique index `deposit_trx_unique_per_method` — reused for gateway val_ids.
- **Credential hygiene:** all secrets server-side in `env.ts` (Zod-parsed, fail-fast); web
  app has only `NEXT_PUBLIC_*` Firebase config; `.env`/`.env.local` gitignored.

### 9.2 Risks the integration must address

| Risk | Current exposure | Required control (resolved in Part B) |
|---|---|---|
| **Trusting frontend redirect** | N/A yet — but the whole manual flow is "human verifies," so nothing prevents a future shortcut | Treat success/fail/cancel pages as **presentation only**; payment becomes `VERIFIED` exclusively after a server-to-server Validation API call (IPN and/or callback-triggered) |
| **Unverified/invalid callbacks** | `app.ts` accepts no-Origin requests (needed for IPN) — meaning **anyone** can POST to a future IPN route | IPN must authenticate the *content*: immediately call SSLCOMMERZ's server-side Validation API with the sessionkey/val_id before trusting anything; compare `val_id`+amount+currency against our own `Payment` row |
| **Duplicate payment processing** | Multiple `SUBMITTED` payments per order are legal today (manual retry pattern); nothing prevents two gateway payments for one order | Enforce one *active* gateway payment per order (partial unique index on `orderId WHERE provider <> 'MANUAL' AND status IN ('PENDING','SUBMITTED')`) + idempotency on gateway sessionkey/val_id |
| **Duplicate webhook deliveries** | None yet | Idempotent handler: unique index on gateway transaction reference + conditional status transitions (second delivery matches 0 rows and no-ops) |
| **Race conditions / DB consistency** | `admin.service.reviewPayment` is **check-then-write without a transaction** (`admin.service.ts:221-234`) — fine for 2 admins, unsafe as a template for concurrent IPN + callback + admin actions | All automated payment-state writes are conditional updates inside `prisma.$transaction`, same pattern the codebase already uses for checkout/attachment-claiming |
| **Incorrect order ownership at callback time** | Callback URLs carry order/payment references — guessable unless made unguessable | Random 16-char gateway `tran_id` in callback URLs, never the sequential `orderNumber`; re-verify ownership server-side |
| **Amount/currency mismatch** | Gateway returns `store_amount`/currency | Server compares gateway amount to `Payment.amount` and `Order.totalAmount` (string-decimal comparison, never float) |
| **Credential exposure** | None | Add gateway creds to `env.ts` optional-at-boot; **never** `NEXT_PUBLIC_*`; the API is the only party that talks to the gateway |
| **Payment status manipulation** | Statuses only writable by server code today | Keep it that way: web app only ever *reads* payment state (it does today) |
| **Rate limiting on IPN** | `apiLimiter` (600/15 min/IP) applies to everything under `/api` | Gateway retries could be throttled → missed webhooks. Budget a dedicated limiter for the IPN path |
| **Replay of old successful callbacks** | N/A | Status-guard transitions make replays no-ops |

---

## 10. Existing Files Requiring Modification (Phase 3)

| File | Current responsibility | Why payment integration touches it |
|---|---|---|
| `apps/api/src/config/env.ts` | Zod env contract, feature flags (`serviceMarketplaceEnabled`, `walletEnabled`) | Add `SSLCOMMERZ_*` vars + payments flag; expose a `paymentsGatewayEnabled` const |
| `apps/api/src/routes/index.ts` | All route mounting | Mount the payments router (customer init, public callback/IPN routes outside `authenticate`, admin refund endpoints) |
| `apps/api/src/controllers/order.controller.ts` | Checkout + `submitPayment` (manual) | Add gateway-init response shape; possibly branch submit flow per provider |
| `apps/api/src/services/order.service.ts` | Checkout transaction, `getOwnOrder`, `customerCancel` | Gateway success must update order/payment atomically; `customerCancel` may trigger refund hooks for gateway-paid orders |
| `apps/api/src/services/admin.service.ts` | `reviewPayment`, stats (revenue from `Payment.status='VERIFIED'`) | Gateway-verified payments flow into stats automatically — verify; add refund service function |
| `apps/api/src/utils/mappers.ts` | `toPaymentDto` etc. | Expose `provider`/`instrument` fields to UI |
| `packages/shared/src/constants/index.ts` (+ both `vendor-shared` copies via `scripts/vendor-shared.sh`) | `PaymentMethod`, `PaymentStatus`, `PAYMENT_MODES`, transitions | New method value, gateway status semantics, refund-related codes |
| `packages/shared/src/schemas/index.ts` (± vendor copies) | `paymentSubmitSchema`, `checkoutSchema` | Payment-init request schema |
| `packages/shared/src/types/index.ts` (± vendor copies) | `PaymentDto`, `OrderSummaryDto` | New DTO fields |
| `apps/api/prisma/schema.prisma` | Canonical schema | Additive migration: gateway attempt fields on `Payment`, unique indexes for idempotency |
| `apps/web/src/app/(site)/checkout/checkout-content.tsx` | 8-step checkout | Offer "Pay online" path that calls init and redirects to gateway |
| `apps/web/src/app/(site)/orders/[id]/page.tsx` | Order detail + `PaymentSection` | Render gateway payment state, retry affordances, poll/refresh on return |
| `apps/web/src/app/(site)/admin/payments/page.tsx` | Manual verification queue | Show provider, handle gateway-verified rows, add refund action |
| `apps/web/.env.local.example` | Documents public env vars | Document new `NEXT_PUBLIC_*` feature flag only (no secrets) |
| `apps/api/src/tests/*` | Vitest suites | Money/state-machine tests for new transitions |

**Dependencies note:** shared-package changes require running `bash scripts/vendor-shared.sh`
(the `predev`/`prebuild` hooks do this automatically — `apps/api/package.json:19-22`),
otherwise both apps compile against stale vendored types.

---

## 11. Potential New Files

**API:**
- `apps/api/src/services/gateways/types.ts` — `PaymentGateway` interface (init / verify /
  refund) so bKash-direct later plugs in behind the same contract.
- `apps/api/src/services/gateways/sslcommerz.client.ts` — SSLCOMMERZ HTTP client (sandbox/
  production base URLs, session init, Validation API, refund API), BigInt-cents ↔ gateway
  amount formatting.
- `apps/api/src/services/payment.service.ts` — orchestration: create session, consume
  callbacks/IPN idempotently, transition statuses transactionally, trigger notifications/audit.
- `apps/api/src/controllers/payment.controller.ts` — init + callback handlers + IPN handler.
- `apps/api/src/routes/payments.ts` — or an extension block in `routes/index.ts` (codebase
  currently uses a single routes file; either fits).
- One Prisma migration folder for the additive schema changes.

**Web:**
- `apps/web/src/app/(site)/payment/success|fail|cancel/page.tsx` (or query-param handling on
  `/orders/[id]`) — landing pages that surface state; verification itself stays server-side.

---

## 12. Recommended Payment Architecture (summary; full design in Part B)

Designed to **respect the existing architecture** (controllers → services → Prisma;
validated routes; envelope DTOs; vendor-shared sync):

1. **Gateway abstraction:** a narrow `PaymentGateway` interface; `SslcommerzGateway` as first
   implementation; future `BkashGateway` slots in. Persist `Payment.provider = 'SSLCOMMERZ'`
   — exactly what the reserved columns were designed for (PRD FR-18).
2. **DB shape (additive-only):** extend `Payment` with gateway attempt fields; add unique
   index on gateway references and a partial unique "one active gateway attempt per order."
3. **Payment lifecycle:** `PENDING` (session created) → `VERIFIED` (confirmed via
   server-to-server Validation API) / `REJECTED` (failed/cancelled/expired). Only `VERIFIED`
   counts as revenue (admin stats already compute on `status='VERIFIED'` —
   `admin.service.ts:35-38`, so gateway payments land in existing dashboards for free).
4. **Verification flow:** both the return callback AND the IPN trigger the same idempotent
   `settleGatewayPayment()` — first writer wins via conditional updates; the loser no-ops.
   Frontend redirect never flips state.
5. **Webhook/IPN:** public route under `/api/payments/ipn`, no `authenticate`, own
   rate-limit budget, immediate server-side validation, 2xx-fast-ack; full `audit` entry per
   event.
6. **Idempotency strategy:** reuse the two proven patterns already in this codebase — unique
   idempotency keys (checkout) and partial-unique-index dedupe (deposit TrxID).
7. **Refund workflow:** admin-initiated gateway refund API call → `Payment.status = REFUNDED`
   → `Order.amountRefunded` incremented — matching Addendum REF-01…REF-05.
8. **Admin integration:** extend the existing `/admin/payments` queue with provider/instrument
   columns and a refund action; every action audited like `PAYMENT.VERIFY` today.
9. **Compatibility guarantee:** the manual path (`provider='MANUAL'`) continues untouched;
   `Order.paymentStatus` stays null for legacy orders.

---

## 13. Technical Risks and Dependencies

1. **Vercel serverless constraints:** the entire API is one function (`api/[...path].js`) —
   no background workers; IPN handling must be request-scoped (fine for this design). Cold
   starts make fast IPN 2xx-acks more important.
2. **Public IPN reachability:** sandbox testing needs a publicly reachable callback URL —
   localhost won't receive callbacks; test via Vercel preview/production or a tunnel.
   **[Assumption — depends on SSLCOMMERZ account type; merchant credentials not requested
   per Phase 1 rules]**
3. **`PaymentMethod` enum rigidity:** Postgres enum extension requires a migration; UI badge
   components (`status-badge.tsx`) switch on method strings.
4. **Vendor-shared drift:** forgetting `scripts/vendor-shared.sh` sync after editing
   `packages/shared` produces type mismatches that surface only at build time.
5. **Wallet interplay:** if WALLET lands later, gateway refunds should credit wallet (schema
   exists) — keep the refund service behind an interface to avoid rework.
6. **Express 5 route parsing:** wildcard syntax changed (`app.ts:47-50` comment); new routes
   must follow current conventions.
7. **Uncommitted working tree:** the repo has extensive uncommitted modifications (per git
   status) — establish a clean commit baseline before Phase 2/3 migrations so schema changes
   are attributable. (Noted; no action taken.)
8. **Two-admin trust model:** payment verification currently requires human judgment against
   bKash/Nagad records; gateway payments remove that step for card flows but manual + gateway
   rows will coexist in one queue.

---

## 14. Recommended Implementation Roadmap

- **Stage 0 — Baseline:** commit current work; confirm sandbox credentials path (not
  requested in Phase 1).
- **Stage 1 — Schema:** additive Prisma migration (gateway fields, unique/partial-unique
  indexes); regenerate client.
- **Stage 2 — Gateway client + service:** `sslcommerz.client.ts` behind the gateway
  interface; `payment.service.ts` with transactional, idempotent state machine; env contract.
- **Stage 3 — API routes:** init (authenticated, ownership-checked), callback processing,
  public IPN with dedicated limiter; shared schemas/types + vendor sync.
- **Stage 4 — Web:** checkout "Pay online" option, return landing pages, order-page state
  polling, empty/failure affordances.
- **Stage 5 — Admin:** provider-aware verification queue, refund workflow, audit actions;
  stats validation.
- **Stage 6 — Hardening & tests:** duplicate-webhook replay tests, concurrent
  callback-vs-admin race tests, amount-mismatch tests; sandbox end-to-end pass
  (success/fail/cancel/IPN-outage paths); then production credentials.

---

# Part B — Phase 2: Payment Architecture and Database Design

> Design only — no code written, no migrations run. Every design element cites the Phase 1
> code evidence it builds on. SSLCOMMERZ behavior is grounded in the official v4 docs
> ([developer.sslcommerz.com/doc/v4](https://developer.sslcommerz.com/doc/v4),
> [IPN reference](https://sandbox-gw.sslcommerz.com/doc/v4/ipn.html)); residual uncertainties
> are flagged for Stage 2 verification against the sandbox.

---

## B1 — Design Decisions

Each decision follows the codebase's own precedents (Part A §12): reserved
`provider`/`providerRef` columns (PRD FR-18), partial-unique-index deduplication
(`deposit_trx_unique_per_method`), conditional-update state guards, string-decimal money.

### D1 — `PaymentMethod` enum: add a single `SSLCOMMERZ` value

| Option | Verdict |
|---|---|
| **a. Add `SSLCOMMERZ` to `PaymentMethod`; store the actual rail (VISA / BKASH / NAGAD…) in a new `instrument` column** | ✅ **Chosen** |
| b. Enum per rail (VISA, MASTERCARD, …) | Rejected — brittle; gateway reports strings like `"VISA-Brac bank"` that would need constant mapping churn |
| c. Make `method` nullable, rely on `instrument` | Rejected — breaks `NOT NULL` contract and every existing DTO/UI consumer |

`method = 'SSLCOMMERZ'` means "paid through the gateway"; `instrument` records what the
customer actually used, exactly as the gateway reports it post-verification. UI badge
components (`status-badge.tsx`) need one new case.

### D2 — Gateway state lives on the existing `Payment` row (no new table)

The schema comment (`schema.prisma:616-618`) and PRD FR-18 explicitly designed `Payment` as
the gateway record. One row per gateway attempt, same as one row per manual TrxID submission.
Retries create new rows — matching the manual flow's resubmission pattern. No join table, no
new query surface.

### D3 — Gateway `tran_id` is a new generated column, **not** the Payment UUID

Docs constrain `tran_id` to **30 characters**; a UUID is 36. Re-init with a reused `tran_id`
can also create *multiple* gateway records, so each attempt gets a fresh unique `tranId`
(16 chars: `TSHG` + 12 base36 random chars) with a DB unique index + P2002 collision-retry —
the exact pattern `nextOrderNumber()` already uses (`order.service.ts:41-46, 185-191`).

### D4 — Callbacks and IPN terminate at the **API**; the web app only displays state

SSLCOMMERZ POSTs to `success/fail/cancel_url`. Next.js App Router pages are GET-only, so
making web pages callback targets would force awkward form-POST handlers. Instead: callbacks
hit public API routes, which run server-side verification **first**, then
`302 → $PAYMENT_RETURN_BASE_URL/payment/{success|fail|cancel}?order=…`. Verification
therefore happens even if the customer closes the tab before the redirect — and the browser
redirect is, by construction, never the source of truth.

### D5 — Reuse the existing `PaymentStatus` enum; add no new statuses

- `PENDING` — session created at gateway
- `SUBMITTED` — reserved for the manual flow; **gateway flow jumps PENDING → VERIFIED/REJECTED
  directly** (verification is synchronous on callback/IPN)
- `VERIFIED` — confirmed via server-to-server Validation API (`status ∈ {VALID, VALIDATED}`)
  + amount match
- `REJECTED` — attempt failed/cancelled/expired; `failureReason` column distinguishes
  (`GATEWAY_FAILED`, `CANCELLED_BY_CUSTOMER`, `EXPIRED`, `VALIDATION_INVALID`, `SESSION_EXPIRED`).
  Retry = new `Payment` row, exactly like manual resubmission after rejection.

No enum migration for statuses, no changes to `toOrderSummaryDto` ranking logic
(`mappers.ts:284`).

### D6 — Gateway-verified payment does **not** auto-advance the order

Identical to the manual flow: `VERIFIED` payment ≠ order status change. Founders still drive
`SUBMITTED → UNDER_REVIEW` manually via the existing `ORDER_TRANSITIONS` pipeline. This
preserves the current workflow, and `admin.service.getStats` already counts revenue from
`status='VERIFIED'` (`admin.service.ts:35-38`), so gateway revenue lands in the existing
dashboard with zero changes.

---

## B2 — Database Design

### B2.1 Prisma schema diff (additive-only)

```prisma
enum PaymentMethod {
  BKASH
  NAGAD
  ROCKET
  BANK_TRANSFER
  SSLCOMMERZ        // NEW — gateway-rail payments; instrument column records the actual rail
}

model Payment {
  // … all existing columns unchanged …

  // ── Gateway attempt fields (provider = 'SSLCOMMERZ'); null for MANUAL rows ──
  tranId        String?  @unique   // 16-char merchant tran_id sent to the gateway (D3)
  sessionKey    String?  @unique   // gateway sessionkey from init response
  paymentUrl    String?            // GatewayPageURL — lets init return an existing fresh attempt
  valId         String?  @unique   // gateway validation id — proof of payment, refund key
  bankTranId    String?            // bank-side id — REQUIRED by the refund API
  instrument    String?            // card_type as reported by gateway (e.g. "VISA-Brac bank")
  gatewayStatus String?            // raw last gateway status (VALID/FAILED/CANCELLED/EXPIRED/…) — diagnostics
  failureReason String?            // GATEWAY_FAILED | CANCELLED_BY_CUSTOMER | EXPIRED | VALIDATION_INVALID | SESSION_EXPIRED
  riskFlag      String?            // risk_title when risk_level=1 — surfaced to admins

  // ── Refund tracking (admin-initiated; gateway rails) ──
  refundRefId   String?  @unique   // our unique refund_trans_id — gateway-side idempotency key
  refundAmount  Decimal? @db.Decimal(12, 2)
  refundStatus  String?            // processing | refunded | cancelled (gateway vocabulary)
  refundedAt    DateTime?

  // new indexes
  @@index([provider, status])
}
```

Plus one **partial unique index in raw migration SQL** (Prisma can't express it; precedent:
`deposit_trx_unique_per_method`, migration line 494):

```sql
-- Exactly one live gateway attempt per order at any time
CREATE UNIQUE INDEX "payment_one_active_gateway_per_order"
  ON "Payment"("orderId")
  WHERE provider <> 'MANUAL' AND status IN ('PENDING', 'SUBMITTED');
```

### B2.2 Migration sketch (single migration, e.g. `202611XX_gateway_payments`)

```sql
ALTER TYPE "PaymentMethod" ADD VALUE 'SSLCOMMERZ';
-- (Postgres 12+/Neon: ADD VALUE may run inside the migration transaction as long
--  as the new value is not referenced by rows in the same transaction — satisfied here.)

ALTER TABLE "Payment" ADD COLUMN "tranId"        TEXT;
ALTER TABLE "Payment" ADD COLUMN "sessionKey"    TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentUrl"    TEXT;
ALTER TABLE "Payment" ADD COLUMN "valId"         TEXT;
ALTER TABLE "Payment" ADD COLUMN "bankTranId"    TEXT;
ALTER TABLE "Payment" ADD COLUMN "instrument"    TEXT;
ALTER TABLE "Payment" ADD COLUMN "gatewayStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "riskFlag"      TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundRefId"   TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundAmount"  DECIMAL(12,2);
ALTER TABLE "Payment" ADD COLUMN "refundStatus"  TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundedAt"    TIMESTAMP(3);

CREATE UNIQUE INDEX "Payment_tranId_key"      ON "Payment"("tranId");
CREATE UNIQUE INDEX "Payment_sessionKey_key"  ON "Payment"("sessionKey");
CREATE UNIQUE INDEX "Payment_valId_key"       ON "Payment"("valId");
CREATE UNIQUE INDEX "Payment_refundRefId_key" ON "Payment"("refundRefId");
CREATE INDEX        "Payment_provider_status_idx" ON "Payment"("provider", "status");
CREATE UNIQUE INDEX "payment_one_active_gateway_per_order"
  ON "Payment"("orderId") WHERE provider <> 'MANUAL' AND status IN ('PENDING','SUBMITTED');
```

Zero backfill needed: all existing rows are `provider='MANUAL'` with null gateway fields.
Legacy behavior is bit-for-bit unchanged.

---

## B3 — Payment Status Lifecycle

| Status | Writer(s) | Guard (conditional update `WHERE status IN (...)`) |
|---|---|---|
| `PENDING` | `initGatewayPayment` — inside a transaction that first closes stale sessions | only from nothing (row created) |
| `VERIFIED` | `settleGatewayPayment` after Validation API says VALID/VALIDATED + amount match | from `PENDING` (gateway rows) — admin `reviewPayment` may also verify, unchanged |
| `REJECTED` | `settleGatewayPayment` on FAILED/CANCELLED/EXPIRED/INVALID; `initGatewayPayment` on stale close | from `PENDING` |

**Terminal states per attempt:** `VERIFIED`, `REJECTED`. Order-level meaning is derived
exactly as today (`toOrderSummaryDto` worst-status ranking; `canPay` checks only order
status — `orders/[id]/page.tsx:73`), so a `REJECTED` gateway attempt is visually and
behaviorally identical to a rejected manual TrxID: customer retries.

**Stale-session policy:** a `PENDING` gateway payment older than
`GATEWAY_SESSION_STALE_MINUTES` (default 30) is closed as `REJECTED / SESSION_EXPIRED` by the
next init call for the same order — otherwise the partial unique index would block all
retries after an abandoned tab. When an IPN with `status=EXPIRED`/`UNATTEMPTED` arrives, it
performs the same close, usually sooner.

---

## B4 — API Contract

All responses use the existing `{ success, data }` / `{ success, error: { code, message,
details } }` envelope (`utils/envelope.ts`). New Zod schemas go in
`packages/shared/src/schemas/index.ts` **and** both `vendor-shared` copies via
`scripts/vendor-shared.sh`.

### B4.1 Customer (authenticated, ownership via `getOwnOrder`)

**`POST /api/orders/:id/payments/gateway`** — body: none (amount/order identity come from
the server; mirrors `paymentSubmitSchema` having no money fields).

```
201 → { paymentId, tranId, provider: 'SSLCOMMERZ', paymentUrl, amount }
409 PAYMENTS_BLOCKED            — order CANCELLED/REJECTED (parity with manual submit)
409 PAYMENT_ALREADY_VERIFIED    — a VERIFIED payment already covers the order
409 GATEWAY_SESSION_ACTIVE      — a fresh (< stale window) PENDING attempt exists → data.paymentUrl
503 GATEWAY_UNCONFIGURED        — flag off / creds missing (pattern: ApiError.unavailable, like Cloudinary 503)
502 GATEWAY_INIT_FAILED         — gateway rejected init (details logged, not leaked)
```

**`GET /api/orders/:id`** — unchanged; `payments[]` now carries `provider`, `instrument`,
`failureReason`, `refundedAt` (DTO additions only).

### B4.2 Gateway-facing (public — no `authenticate`)

**`POST /api/payments/sslcommerz/callback/:tranId`** — gateway POSTs
`{status: VALID|FAILED|CANCELLED, tran_id, val_id, amount, currency, card_type, bank_tran_id,
value_a…}`. Server: run the settle flow (§B5) → `302` to web result page. `tranId` in the
path is the 16-char unguessable attempt id (never the sequential `orderNumber`).

**`POST /api/payments/ipn`** — IPN POST (form-encoded). Runs the same settle flow, responds
`200` always for known `tran_id`s (processed or already-terminal → idempotent no-op). Unknown
`tran_id`: `200` + `logger.error` + audit — a 4xx would trigger endless gateway retries for a
condition we cannot fix. (CORS already admits no-Origin server-to-server requests —
`app.ts:29-31`.)

**Rate limiting:** dedicated `gatewayLimiter` (e.g., 120 req/15 min/IP) on both routes;
`apiLimiter` still applies underneath — combined budget comfortably exceeds gateway retry
behavior.

### B4.3 Admin (existing `authenticate + requireAdmin`)

**`POST /api/admin/payments/:id/refund`** — body:
`{ amount?: string, reason: string }` (Zod; amount = string-decimal, omit for full refund).
Guards: provider must be `SSLCOMMERZ`, status `VERIFIED`, refund cap =
`payment.amount − order.amountRefunded`.
Effect: gateway refund call → `refundStatus='processing'` → confirmation job/poll sets
`Payment.status='REFUNDED'`, `Order.amountRefunded`,
`Order.paymentStatus ∈ {PARTIALLY_REFUNDED, REFUNDED}` (columns already exist, never written
today). Audit: `PAYMENT.REFUND_INITIATED` / `PAYMENT.REFUNDED`. See constraint R1 (§B12)
before enabling in production.

**`GET /api/admin/payments`** — extended with optional `provider` filter; rows carry new
fields via `toAdminPaymentDto`.

---

## B5 — Core Flows

**F1 — Happy path (with IPN race):**

```
customer → POST /orders/:id/payments/gateway
           server: order owned? payments blocked? existing VERIFIED?
           tx: close stale PENDING (if any) → create Payment{PENDING, tranId, sessionKey, paymentUrl}
           audit PAYMENT.GATEWAY_INIT
         ← { paymentUrl } → browser redirects to gateway → pays
gateway  → POST success callback {tran_id, val_id, amount, status=VALID}
           settle(): load by tranId → not terminal → GET validationserverAPI.php (server-to-server)
           checks: tran_id matches · status VALID|VALIDATED · amount === payment.amount (cents compare)
           conditional updateMany PENDING→VERIFIED {valId, bankTranId, instrument, verifiedAt, gatewayStatus}
           notifyUser(PAYMENT) + notifyFounders email + audit PAYMENT.GATEWAY_VERIFIED
         ← 302 $RETURN_BASE/payment/success?order=…
gateway  → POST /ipn (maybe before/after callback)
           settle() → row already VERIFIED → zero rows updated → 200 no-op  ✅ race-safe by design
customer → /payment/success page (GET) → shows state from server → link to /orders/:id
```

**F2 — Fail at gateway:** callback `status=FAILED` → no validation call needed (nothing to
verify) → conditional `PENDING→REJECTED, failureReason=GATEWAY_FAILED` → 302 `/payment/fail`
→ customer can retry immediately (new attempt; partial index freed).

**F3 — Cancel at gateway:** same as F2 with `CANCELLED_BY_CUSTOMER`.

**F4 — Customer never returns (tab closed):** callback never fires → IPN
`EXPIRED`/`UNATTEMPTED` closes the attempt; if IPN also never arrives, the *next* init for
the order closes the stale PENDING after the stale window (§B3). No cron needed on serverless.

**F5 — Double-click / retry init:** second call finds fresh `PENDING` attempt →
`409 GATEWAY_SESSION_ACTIVE` carrying the stored `paymentUrl` → client can re-redirect to
the same session. No duplicate rows possible (partial index is the final arbiter; P2002 →
re-read → return active attempt).

**F6 — Forged callback:** attacker POSTs a fabricated success callback → settle() calls the
**Validation API with our store credentials server-side** → gateway says
`INVALID_TRANSACTION` (or val_id belongs to a different tran_id/amount) → no state change;
audit `PAYMENT.VALIDATION_INVALID` with source IP. The customer-visible page never decides
anything.

**F7 — Amount mismatch / risky transaction:** validation returns VALID but
`amount ≠ payment.amount`, or `risk_level=1` → do **not** verify. Mismatch → leave `PENDING`
+ audit + founder email (founders can adjudicate via existing admin verify).
Risky-but-valid → verify but set `riskFlag`, admin queue shows it.

**F8 — Refund (admin):** `POST /admin/payments/:id/refund {amount?, reason}` → guards →
gateway refund (`bank_tran_id` from the stored verification, `refund_trans_id = refundRefId`
our unique id) → `refundStatus='processing'` → poll refund-status API (admin-triggered or on
admin page load) → `refunded` → `Payment.status=REFUNDED`, ledger columns updated, customer
`notifyUser(PAYMENT)` + audit.

---

## B6 — Gateway Adapter Interface

`apps/api/src/services/gateways/types.ts` — narrow, so a direct-bKash gateway later
implements the same contract without touching orchestration:

```ts
export interface PaymentGateway {
  readonly provider: 'SSLCOMMERZ' | 'BKASH';
  /** Create a hosted-checkout session. Amounts are string-decimals (BDT). */
  initSession(input: {
    tranId: string; amount: string; currency: 'BDT';
    successUrl: string; failUrl: string; cancelUrl: string; ipnUrl: string;
    productName: string; productCategory: string; productProfile: string;
    customer: { name: string; email: string; phone?: string | null; address?: string };
  }): Promise<{ sessionKey: string; paymentUrl: string }>;
  /** Authoritative server-to-server confirmation for a val_id. */
  validate(input: { valId: string }): Promise<ValidationResult>;
  /** Initiate a (partial) refund; refundRefId is our idempotency key. */
  refund(input: { bankTranId: string; valId: string; refundRefId: string; amount: string; remarks: string }): Promise<RefundResult>;
  /** Poll a refund by refundRefId. */
  refundStatus(refundRefId: string): Promise<RefundStatusResult>;
}
```

`sslcommerz.client.ts` implements it against `sandbox.sslcommerz.com` /
`securepay.sslcommerz.com` (`gwprocess/v4/api.php`,
`validator/api/validationserverAPI.php`,
`validator/api/merchantTransIDvalidationAPI.php` + refund-status endpoint), with: store
credentials from `env` only, string↔cents conversion via the existing `utils/money.ts`
helpers, timeout/abort on all outbound calls, and **no gateway SDK dependency** (the
`sslcommerz-lts` npm package is available but the surface is four HTTP calls — fewer deps,
same auditability as the existing Resend `fetch` client in `mail.service.ts:32-45`).
**[Verify during Stage 2 sandbox pass: exact refund endpoint naming (`refund_trans_id` vs
legacy `refund_ref_id` as request key) and sandbox refund availability.]**

---

## B7 — Idempotency and Race-Safety Design

| Threat | Control | Codebase precedent |
|---|---|---|
| Duplicate order-side attempts | Partial unique index `payment_one_active_gateway_per_order` + "return existing fresh attempt" logic | `deposit_trx_unique_per_method` |
| Duplicate callback + IPN | Unique `tranId`/`valId` + **conditional `updateMany`** transitions; loser updates 0 rows | attachment-claim `updateMany` count-check (`order.service.ts:164-171`) |
| Duplicate refund submissions | Unique `refundRefId` (gateway also returns prior response for a repeated id) | TrxID dedupe pattern |
| Stuck PENDING blocking retries | Stale-window close inside the init transaction | checkout P2002 retry pattern |
| Forged callbacks | Server-to-server Validation API with store creds; browser never flips state | — (new; mandated by Phase 1 rules) |
| Amount manipulation | No money fields in any request schema; amount always `order.totalAmount`; cents-compare with gateway value | `checkoutSchema` / `computeTotal` |
| Admin-vs-webhook races | All automated transitions use the same conditional-update helper; human `reviewPayment` unchanged for MANUAL rows | existing `reviewPayment` guard kept |

---

## B8 — Web Integration Design (Next.js)

- **Checkout (`checkout-content.tsx` step 6):** radio gains a "Pay online — SSLCommerz
  (cards/bKash/Nagad)" option, shown only when a new
  `NEXT_PUBLIC_PAYMENTS_GATEWAY_ENABLED=true` flag is set (`lib/feature-flags.ts` pattern).
  Submit flow: existing `POST /orders` → if online chosen →
  `POST /orders/:id/payments/gateway` → `window.location = paymentUrl`. Idempotency key
  behavior unchanged.
- **New route group `/payment/(success|fail|cancel)`** — three thin GET pages reading
  `?order=`; each server-fetches the order through the existing `lib/server-api.ts` (the only
  party that can know state), renders status, links to `/orders/:id`. Purely presentational —
  matches D4.
- **Order page (`orders/[id]`)**: `PaymentSection` gains an "Pay online" button when gateway
  is enabled and no verified payment exists → init → redirect; SWR revalidate on return.
  Payment history rows show `instrument` for gateway rows.
- **Admin (`admin/payments/page.tsx`)**: `PaymentMethodBadge` gains `SSLCOMMERZ` (renders
  `instrument` alongside); refund button + amount/reason dialog on VERIFIED gateway rows;
  `riskFlag` shown as a warning chip.

---

## B9 — Admin Integration Design

Covered in B4.3 + B8. Summary: provider column/filter in the verification queue; refund
action (flag-gated per R1) with amount/reason and audit trail; `riskFlag` chips; stats
require no change (revenue derives from `status='VERIFIED'`).

---

## B10 — Environment Contract (API additions)

All optional at boot, pattern-identical to Cloudinary/Firebase in `config/env.ts`.

| Variable | Purpose |
|---|---|
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | Merchant credentials (server-only; **never** `NEXT_PUBLIC_*`) |
| `SSLCOMMERZ_SANDBOX` | `'true'` default → sandbox host |
| `PAYMENTS_GATEWAY_ENABLED` | `'true'` enables init endpoint + web UI flag source |
| `PAYMENT_RETURN_BASE_URL` | Web origin for post-verification redirects (e.g. `https://<web-app>.vercel.app`) |
| `GATEWAY_SESSION_STALE_MINUTES` | Default `30` |

`/api/health` gains `paymentsGateway: 'ok' | 'unconfigured'` (pattern: `firebase`/
`firebaseCredentialSource` fields, `routes/index.ts:56-66`).

---

## B11 — Security Controls → Phase 1 Risk Map

All Phase 1 risks closed by design: client-side amounts → §B4.1/§B7 · unauthorized access →
`getOwnOrder` + admin gate · duplicates → partial index + conditional updates · webhook
duplicates → idempotent settle · invalid callbacks → F6 · unverified transactions →
Validation API is the only VERIFIED writer · wrong-order callbacks → unguessable `tranId`
path + `tran_id` match + amount match · credential exposure → env-only, API-only egress ·
race conditions → §B7 · consistency → single-transaction init & settle · status
manipulation → web is read-only over payments (as today).

---

## B12 — Technical Risks and Operational Constraints

- **R1 — Live refunds need IP whitelisting.** The refund API requires registered merchant
  IPs; Vercel serverless egress IPs are dynamic → **live gateway refunds may be unusable from
  the API initially.** Mitigation: refunds ship flag-gated; fallback = SSLCOMMERZ
  merchant-panel refunds (manual) with our admin UI recording the outcome; revisit when a
  static egress path exists. Sandbox refunds are unaffected for development.
- **R2 — `tran_id` ≤ 30 chars** — handled by D3 (16-char generated ids).
- **R3 — Session TTL undocumented** — handled defensively (stale window + IPN EXPIRED +
  stale-close-on-init).
- **R4 — Sandbox parity** — callback POST bodies, refund endpoint naming, and IPN
  `verify_sign` semantics to be pinned in the Stage 2 sandbox spike before UI wiring.
- **R5 — Repo baseline** — extensive uncommitted changes exist; commit before the migration
  lands so schema history stays attributable.

---

## B13 — Testing Plan (Vitest, mirroring `apps/api/src/tests/*` style)

1. **Pure unit:** tran_id generator format/length; cents-vs-gateway-amount comparator;
   settle state-transition guard table (PENDING→VERIFIED/REJECTED; terminal no-op).
2. **Service tests with a mocked `PaymentGateway`:** F1 race (callback + IPN interleaved →
   exactly one VERIFIED); F2/F3; F5 retry-init returns same URL; stale-close; F6 forged
   validation (`INVALID_TRANSACTION`); amount-mismatch leaves PENDING; refund cap
   enforcement.
3. **Contract tests:** envelope shapes; 409/503 codes; IPN unknown-tran 200 policy.
4. **Sandbox E2E checklist (manual):** VISA sandbox → success/fail/cancel → IPN-with-
   callback-down → abandoned tab → retry → refund (sandbox). Verify against
   [developer.sslcommerz.com/doc/v4](https://developer.sslcommerz.com/doc/v4).

---

## B14 — Phase 3 Implementation Map

| Stage | Deliverable |
|---|---|
| 0 | Commit current working tree (R5) |
| 1 | Prisma migration + regenerate client; shared constants/types/schemas + `vendor-shared.sh` sync |
| 2 | `gateways/types.ts` + `sslcommerz.client.ts` + sandbox spike (pin R4 unknowns) |
| 3 | `payment.service.ts` (init/settle/stale/refund orchestration) + `payment.controller.ts` + routes + `gatewayLimiter` + env.ts + health field |
| 4 | Web: checkout option, `/payment/*` pages, order-page button, admin badge/filter |
| 5 | Admin refund flow (flag-gated per R1) + audit + notifications |
| 6 | Tests (§B13) → sandbox E2E → production cutover checklist |

---

# Appendices

## Appendix A — Verified SSLCOMMERZ v4 API Facts

Confirmed from the official docs (see Appendix C for links):

| Topic | Verified fact |
|---|---|
| **Init (Create Session)** | `POST {base}/gwprocess/v4/api.php` — sandbox base `https://sandbox.sslcommerz.com`, live `https://securepay.sslcommerz.com`. Params include `store_id`, `store_passwd`, `total_amount`, `currency`, `tran_id` (mandatory, **unique, string ≤ 30**), `success_url`, `fail_url`, `cancel_url`, `ipn_url`, customer/shipping fields. Response: `sessionkey`, `GatewayPageURL`. |
| **Order Validation API** | `GET {base}/validator/api/validationserverAPI.php?val_id=…&store_id=…&store_passwd=…&format=json`. `status`: **VALID** (first successful call) / **VALIDATED** (subsequent calls) / **INVALID_TRANSACTION**. Response carries `amount` (decimal 10,2), `currency`, `tran_id`, `bank_tran_id`, `card_type` (e.g. `"VISA-Brac bank"`), `risk_level`/`risk_title`, `val_id`, `tran_date`. Docs use `store_passwd` (not `ws_password`) on this page. |
| **IPN** | Gateway POSTs to the configured `ipn_url` with `status` (`VALID / FAILED / CANCELLED / EXPIRED / UNATTEMPTED`), `tran_id`, `val_id`, `amount`, `store_amount`, `card_type`, `card_no`, `bank_tran_id`, `tran_date`, `currency`, `card_issuer`, `card_brand`, `verify_sign`, `verify_key`, `risk_level`, `value_a`–`value_d`. Merchants **must** validate via the Order Validation API before updating the database. Server-to-server (no customer session). |
| **Refund** | Initiate: `GET {base}/validator/api/merchantTransIDvalidationAPI.php` with required `bank_tran_id`, `refund_trans_id` (unique refund ID, added 2025-02-24; legacy name `refund_ref_id`), `store_id`, `store_passwd`, `refund_amount`, `refund_remarks`. Response: `APIConnect` (DONE/FAILED/…), `status` (success/failed/processing), `refund_ref_id`, `errorReason`. Status query by `refund_ref_id` → `refunded / processing / cancelled`. **Live refunds require the merchant's public IP to be registered with SSLCOMMERZ** → constraint R1. |
| **Session TTL** | Not documented; design handles it defensively (stale window + IPN EXPIRED + stale-close-on-init). |

## Appendix B — Open Items for Approval

Two decisions carry safe defaults and await explicit sign-off (not blockers for Stage 0–2):

1. **D6:** gateway-verified payment keeps founder-driven order progression (no auto-advance).
2. **R1:** refunds ship **flag-gated** until the Vercel-egress-IP limitation is resolved;
   interim path is SSLCOMMERZ merchant-panel refunds recorded in the admin UI.

## Appendix C — Sources

- [SSLCommerz v4 API docs](https://developer.sslcommerz.com/doc/v4) — init, validation, refund endpoints and parameters
- [IPN callbacks reference (sandbox)](https://sandbox-gw.sslcommerz.com/doc/v4/ipn.html) — IPN parameter table
- [sslcommerz-lts npm](https://www.npmjs.com/package/sslcommerz-lts) — official Node helper (evaluated; not adopted)
- [Spring Boot integration example](https://github.com/MdGolam-Kibria/SSLCommerz-payment-gateway-springboot-Implementation) — sandbox init flow reference
- [MERN integration guide (Medium)](https://medium.com/@mdabdurrouf.likhon/how-to-integrate-the-sslcommerz-payment-gateway-in-the-mern-stack-project-ee43657717cc) — init flow cross-check

Project-internal evidence: `apps/api/prisma/schema.prisma`, `apps/api/src/**` (all files cited
inline), `apps/web/src/**`, `packages/shared/src/**`, `docs/PRD.html`,
`docs/PRD-Addendum-v1.1-Wallet.html`, `apps/api/vercel.json`.

---

*End of report. Phase 3 (implementation) begins only on explicit approval, starting at
Stage 0 (baseline commit) per §B14.*
