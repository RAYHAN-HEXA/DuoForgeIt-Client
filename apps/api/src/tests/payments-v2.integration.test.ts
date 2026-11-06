import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/**
 * Real-PostgreSQL integration suite for manual-payments v2 (Stage 2).
 *
 * The Stage 1 partial unique indexes and their concurrency behavior can only
 * be proven against the real engine — mocks are insufficient here. The suite
 * is SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL database:
 *
 *   createdb tsh_stage2_payments_test
 *   cd apps/api
 *   DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage2_payments_test \
 *   DIRECT_URL=...  npx prisma migrate deploy      # scratch DB only, never production
 *   TEST_DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage2_payments_test \
 *     npm test -w @tsh/api
 *
 * Production credentials must never appear in TEST_DATABASE_URL.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Set BEFORE any dynamic import below: config/env parses process.env at
// import time and the singleton Prisma client binds to DATABASE_URL.
if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  // Blob storage "configured" so screenshot registration can exercise the
  // head() existence check (the SDK itself is mocked below — no network).
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_stage2_test';
}

// The Blob SDK is mocked: registration endpoints call head() to verify the
// referenced object exists; the happy-path screenshot declares exactly this
// metadata. Ownership/namespace logic runs for real in blob.ts.
vi.mock('@vercel/blob', () => ({
  head: vi.fn().mockResolvedValue({ size: 1024, contentType: 'image/png' }),
  issueSignedToken: vi.fn().mockResolvedValue({ delegationToken: 'd', clientSigningToken: 'c', validUntil: Date.now() + 60_000 }),
  presignUrl: vi.fn().mockImplementation((_t: unknown, opts: { pathname: string }) =>
    Promise.resolve({ presignedUrl: `https://blob.stage2.test/${opts.pathname}?sig=fake` })),
  del: vi.fn(),
}));

// Firebase token verification is stubbed; everything downstream (profile
// lookup, ownership, constraints) runs against the real database.
vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer (customer|other)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    return {
      uid: `firebase-${match[1]}`,
      name: match[1],
      email: `${match[1]}@stage2.test`,
      email_verified: true,
      sub: `firebase-${match[1]}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'stage2-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'customer' | 'other') => ({ Authorization: `Bearer ${who}-token` });
const v2 = (orderId: string) => `/api/orders/${orderId}/payments/v2`;
const uuid = () => randomUUID();

d('manual-payments v2 (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let customer: { id: string };
  let other: { id: string };
  let service: { id: string };
  let category: { id: string };
  let bkash: string, bkashInactive: string, nagad: string, bank: string, upay: string;
  const run = randomUUID().slice(0, 8); // per-run fixture tags — reruns never collide

  async function createOrder(opts: {
    customerId: string;
    totalAmount?: string;
    amountPaid?: string | null;
    status?: 'SUBMITTED' | 'APPROVED' | 'CANCELLED';
    negotiated?: boolean;
  }) {
    let requestId: string | undefined;
    let acceptedQuotationId: string | undefined;
    if (opts.negotiated) {
      const request = await prisma.serviceRequest.create({
        data: {
          referenceNo: `STAGE2-${run}-${uuid().slice(0, 8)}`,
          userId: opts.customerId,
          serviceId: service.id,
          answers: {},
          serviceSnapshot: { stage2Test: true },
        },
      });
      const quotation = await prisma.quotation.create({
        data: {
          requestId: request.id,
          price: opts.totalAmount ?? '1000.00',
          items: [{ label: 'Full scope', amount: opts.totalAmount ?? '1000.00' }],
          scopeText: 'Stage 2 negotiated-order fixture scope.',
          deliverables: ['Fixture deliverable'],
          estimatedTimeline: '7 days',
          validUntil: new Date(Date.now() + 7 * 86400000),
          status: 'ACCEPTED',
          sentAt: new Date(),
        },
      });
      requestId = request.id;
      acceptedQuotationId = quotation.id;
    }
    return prisma.order.create({
      data: {
        orderNumber: `STAGE2-${run}-${uuid().slice(0, 8).toUpperCase()}`,
        customerId: opts.customerId,
        status: opts.status ?? 'SUBMITTED',
        title: 'Stage 2 payment fixture',
        deadline: new Date(Date.now() + 7 * 86400000),
        totalAmount: opts.totalAmount ?? '1000.00',
        ...(opts.amountPaid !== undefined ? { amountPaid: opts.amountPaid } : {}),
        idempotencyKey: uuid(),
        ...(requestId ? { requestId } : {}),
        ...(acceptedQuotationId ? { acceptedQuotationId } : {}),
      },
    });
  }

  const submission = (orderId: string, overrides: Record<string, unknown> = {}) => ({
    accountId: bkash,
    transactionId: `TRX-${uuid().slice(0, 10)}`,
    amount: '1000.00',
    ...overrides,
    // orderId is conveyed by the URL — a body value must never override it
  });

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    // ── Fixtures (per-run unique) ──
    // firebaseUid values match the stubbed token verifier exactly.
    const customerUser = await prisma.user.create({
      data: { firebaseUid: 'firebase-customer', email: `customer-${run}@stage2.test`, fullName: 'Stage2 Customer', role: 'CUSTOMER' },
    });
    const otherUser = await prisma.user.create({
      data: { firebaseUid: 'firebase-other', email: 'other@stage2.test', fullName: 'Stage2 Other', role: 'CUSTOMER' },
    });
    customer = { id: customerUser.id };
    other = { id: otherUser.id };

    const cat = await prisma.serviceCategory.create({ data: { slug: `stage2-${run}`, name: 'Stage2 category' } });
    category = { id: cat.id };
    const svc = await prisma.service.create({
      data: { categoryId: cat.id, slug: `stage2-service-${run}`, name: 'Stage2 service', description: 'Fixture service.', basePrice: '1000.00', deliveryDays: 7 },
    });
    service = { id: svc.id };

    const accounts = await Promise.all(
      [
        { key: 'BKASH', label: `STAGE2-${run}-bkash`, do: 2, active: true },
        { key: 'BKASH', label: `STAGE2-${run}-bkash-off`, do: 9, active: false },
        { key: 'NAGAD', label: `STAGE2-${run}-zz-nagad`, do: 3, active: true },
        { key: 'BANK_TRANSFER', label: `STAGE2-${run}-a-bank`, do: 1, active: true },
        { key: 'UPAY', label: `STAGE2-${run}-b-upay`, do: 1, active: true },
      ].map((a) =>
        prisma.paymentAccount.create({
          data: { methodKey: a.key, label: a.label, accountNumber: `01${randomUUID().slice(0, 9)}`, accountHolder: 'Stage2 Holder', isActive: a.active, displayOrder: a.do },
        }),
      ),
    );
    // displayOrder 1 ties → label breaks the tie: a-bank before b-upay
    bank = accounts[3].id;
    upay = accounts[4].id;
    bkash = accounts[0].id;
    bkashInactive = accounts[1].id;
    nagad = accounts[2].id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // FK-safe teardown: orders (cascades payments) → requests (cascades
    // quotations) → service → category → accounts → users.
    await prisma.order.deleteMany({ where: { OR: [{ customerId: customer.id }, { customerId: other.id }] } });
    await prisma.serviceRequest.deleteMany({ where: { userId: { in: [customer.id, other.id] } } });
    if (service) await prisma.service.delete({ where: { id: service.id } }).catch(() => {});
    if (category) await prisma.serviceCategory.delete({ where: { id: category.id } }).catch(() => {});
    await prisma.paymentAccount.deleteMany({ where: { label: { startsWith: `STAGE2-${run}` } } });
    await prisma.paymentAccount.deleteMany({ where: { label: 'other@stage2.test-fixture' } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@stage2.test' } } });
    await prisma.$disconnect();
  });

  // ─── A. Account endpoint ────────────────────────────────────

  it('lists only active accounts in deterministic order with safe DTO fields', async () => {
    const res = await request(app).get('/api/payment-accounts').set(auth('customer'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items: Array<Record<string, unknown>> = res.body.data.items;
    const stage2 = items.filter((i) => String(i.label).startsWith(`STAGE2-${run}`));
    expect(stage2.map((i) => i.label)).toEqual([
      `STAGE2-${run}-a-bank`,
      `STAGE2-${run}-b-upay`,
      `STAGE2-${run}-bkash`,
      `STAGE2-${run}-zz-nagad`,
    ]);
    for (const item of stage2) {
      expect(Object.keys(item).sort()).toEqual(
        ['accountHolder', 'accountNumber', 'accountType', 'id', 'instructions', 'label', 'methodKey', 'qrUrl'].sort(),
      );
      expect(item.qrUrl).toBeNull(); // Cloudinary unconfigured in tests
    }
    expect(stage2.some((i) => i.label === `STAGE2-${run}-bkash-off`)).toBe(false);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('createdById');
    expect(raw).not.toContain('isActive');
    expect(raw).not.toContain('displayOrder');
  });

  it('requires authentication for the account list', async () => {
    const res = await request(app).get('/api/payment-accounts');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // ─── B. Valid submission ────────────────────────────────────

  it('stores a valid submission with server-derived snapshots and untouched order accounting', async () => {
    const order = await createOrder({ customerId: customer.id });
    const res = await request(app)
      .post(v2(order.id))
      .set(auth('customer'))
      .send(submission(order.id, { transactionId: ' ab 12 cd ', senderNumber: '01712345678' }));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        'accountNumber', 'amount', 'createdAt', 'hasScreenshot', 'id', 'methodKey',
        'methodLabel', 'orderId', 'senderNumber', 'status', 'transactionId',
      ].sort(),
    );
    // The shared schema trims edges (validation transform) — the stored raw is
    // the schema-parsed value; normalization then strips internal whitespace.
    expect(res.body.data.transactionId).toBe('ab 12 cd');
    expect(res.body.data.amount).toBe('1000.00'); // server-computed outstanding, 2-decimal contract
    expect(res.body.data.methodKey).toBe('BKASH');
    expect(res.body.data.hasScreenshot).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('screenshotPublicId');
    expect(JSON.stringify(res.body)).not.toContain('adminNote');

    const row = await prisma.payment.findUnique({ where: { id: res.body.data.id } });
    expect(row.status).toBe('SUBMITTED');
    expect(row.transactionId).toBe('ab 12 cd');
    expect(row.transactionIdNormalized).toBe('AB12CD');
    expect(row.amount.toFixed(2)).toBe('1000.00');
    expect(row.paymentAccountId).toBe(bkash);
    expect(row.methodKeySnapshot).toBe('BKASH');
    expect(row.methodLabelSnapshot).toBe(`STAGE2-${run}-bkash`);
    expect(row.accountHolderSnapshot).toBe('Stage2 Holder');
    expect(row.accountNumberSnapshot).not.toBeNull();
    expect(row.senderNumber).toBe('01712345678');

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after.amountPaid).toBeNull(); // Stage 3 owns accounting
    expect(after.paymentStatus).toBeNull();
  });

  // ─── C. Ownership & authorization ───────────────────────────

  it('rejects unauthenticated and foreign-order submissions without leaking existence', async () => {
    const order = await createOrder({ customerId: customer.id });

    const noAuth = await request(app).post(v2(order.id)).send(submission(order.id));
    expect(noAuth.status).toBe(401);

    const badToken = await request(app).post(v2(order.id)).set({ Authorization: 'Bearer garbage' }).send(submission(order.id));
    expect(badToken.status).toBe(401);

    const foreign = await request(app).post(v2(order.id)).set(auth('other')).send(submission(order.id));
    expect(foreign.status).toBe(404); // same as nonexistent — no existence leak

    const missing = await request(app).post(v2(uuid())).set(auth('customer')).send(submission(order.id));
    expect(missing.status).toBe(404);
  });

  // ─── D. Account validation ──────────────────────────────────

  it('rejects unknown and inactive accounts with INVALID_PAYMENT_ACCOUNT', async () => {
    const order = await createOrder({ customerId: customer.id });
    for (const accountId of [uuid(), bkashInactive]) {
      const res = await request(app).post(v2(order.id)).set(auth('customer')).send(submission(order.id, { accountId }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_ACCOUNT');
    }
  });

  it('enforces bKash-only for quotation-negotiated orders, every rail for fixed-price', async () => {
    const negotiated = await createOrder({ customerId: customer.id, negotiated: true });
    for (const accountId of [nagad, bank, upay]) {
      const res = await request(app).post(v2(negotiated.id)).set(auth('customer')).send(submission(negotiated.id, { accountId }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_ACCOUNT');
    }
    const okBkash = await request(app).post(v2(negotiated.id)).set(auth('customer')).send(submission(negotiated.id));
    expect(okBkash.status).toBe(201);

    const fixed = await createOrder({ customerId: customer.id });
    const okNagad = await request(app)
      .post(v2(fixed.id))
      .set(auth('customer'))
      .send(submission(fixed.id, { accountId: nagad, amount: '1000.00' }));
    expect(okNagad.status).toBe(201);
    const fixed2 = await createOrder({ customerId: customer.id });
    const okUpay = await request(app)
      .post(v2(fixed2.id))
      .set(auth('customer'))
      .send(submission(fixed2.id, { accountId: upay }));
    expect(okUpay.status).toBe(201);
    expect(okUpay.body.data.methodKey).toBe('UPAY'); // custom rail keeps its snapshot identity
  });

  // ─── E. Amount validation ───────────────────────────────────

  it('requires the exact outstanding amount (BigInt cents, no floats)', async () => {
    const order = await createOrder({ customerId: customer.id, totalAmount: '1000.00', amountPaid: '300.25' });
    const expected = { expected: '699.75' };

    const exact = await request(app).post(v2(order.id)).set(auth('customer')).send(submission(order.id, { amount: '699.75' }));
    expect(exact.status).toBe(201);

    const order2 = await createOrder({ customerId: customer.id, totalAmount: '1000.00', amountPaid: '300.25' });
    for (const amount of ['699.74', '699.76', '0.00']) {
      const res = await request(app).post(v2(order2.id)).set(auth('customer')).send(submission(order2.id, { amount }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('AMOUNT_MISMATCH');
      expect(res.body.error.details).toEqual(expected);
    }
    for (const amount of ['abc', '12.345', '-5.00', '1 000']) {
      const res = await request(app).post(v2(order2.id)).set(auth('customer')).send(submission(order2.id, { amount }));
      expect(res.status).toBe(422); // schema-level rejection
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects fully-paid and cancelled orders', async () => {
    const paid = await createOrder({ customerId: customer.id, amountPaid: '1000.00' });
    const paidRes = await request(app).post(v2(paid.id)).set(auth('customer')).send(submission(paid.id));
    expect(paidRes.status).toBe(409);
    expect(paidRes.body.error.code).toBe('ORDER_ALREADY_PAID');

    const cancelled = await createOrder({ customerId: customer.id, status: 'CANCELLED' });
    const cancelledRes = await request(app).post(v2(cancelled.id)).set(auth('customer')).send(submission(cancelled.id));
    expect(cancelledRes.status).toBe(409);
    expect(cancelledRes.body.error.code).toBe('CONFLICT');
  });

  // ─── F. Transaction ID normalization & dedupe ───────────────

  it('blocks a normalized duplicate across orders until the first is REJECTED', async () => {
    const order1 = await createOrder({ customerId: customer.id });
    // Stored raw 'AB 123' → normalized AB123
    const first = await request(app)
      .post(v2(order1.id))
      .set(auth('customer'))
      .send(submission(order1.id, { transactionId: 'AB 123' }));
    expect(first.status).toBe(201);

    const order2 = await createOrder({ customerId: customer.id });
    // Different raw (schema min 6 satisfied), same normalized value → the
    // partial unique index fires
    const dup = await request(app)
      .post(v2(order2.id))
      .set(auth('customer'))
      .send(submission(order2.id, { transactionId: 'a b123' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TRANSACTION');

    // Stage-3-style rejection frees the TrxID (partial index excludes REJECTED)
    await prisma.payment.update({ where: { id: first.body.data.id }, data: { status: 'REJECTED' } });
    const reuse = await request(app)
      .post(v2(order2.id))
      .set(auth('customer'))
      .send(submission(order2.id, { transactionId: ' ab 123 ' }));
    expect(reuse.status).toBe(201);
    expect(reuse.body.data.transactionId).toBe('ab 123');
    const row = await prisma.payment.findUnique({ where: { id: reuse.body.data.id } });
    expect(row.transactionIdNormalized).toBe('AB123');
  });

  // ─── G. One active submission per order ─────────────────────

  it('allows exactly one active submission per order, including under concurrency', async () => {
    const order = await createOrder({ customerId: customer.id });
    const first = await request(app).post(v2(order.id)).set(auth('customer')).send(submission(order.id));
    expect(first.status).toBe(201);
    const second = await request(app).post(v2(order.id)).set(auth('customer')).send(submission(order.id, { accountId: nagad }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PAYMENT_ALREADY_PENDING');

    // True race: two parallel submissions on a fresh order — the partial
    // unique index, not the read checks, must decide the outcome.
    const fresh = await createOrder({ customerId: customer.id });
    const attempts = await Promise.allSettled([
      request(app).post(v2(fresh.id)).set(auth('customer')).send(submission(fresh.id, { transactionId: `RACE-A-${run}` })),
      request(app).post(v2(fresh.id)).set(auth('customer')).send(submission(fresh.id, { accountId: nagad, transactionId: `RACE-B-${run}` })),
    ]);
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled') as PromiseFulfilledResult<{ status: number; body: { error?: { code: string } } }>[];
    expect(attempts.every((a) => a.status === 'fulfilled')).toBe(true);
    const created = fulfilled.map((a) => a.value);
    expect(created.filter((r) => r.status === 201)).toHaveLength(1);
    expect(created.filter((r) => r.status === 409 && r.body.error?.code === 'PAYMENT_ALREADY_PENDING')).toHaveLength(1);
    const active = await prisma.payment.count({ where: { orderId: fresh.id, status: { in: ['PENDING', 'SUBMITTED'] } } });
    expect(active).toBe(1);
  });

  it('blocks the same TrxID submitted concurrently to two orders', async () => {
    const o1 = await createOrder({ customerId: customer.id });
    const o2 = await createOrder({ customerId: customer.id });
    const trx = `DUP-${run}`;
    // Different raw strings that normalize to the SAME value: ` dup-xxxx ` → DUP-XXXX
    const sameTrxLower = ` ${trx.toLowerCase()} `;
    const attempts = await Promise.allSettled([
      request(app).post(v2(o1.id)).set(auth('customer')).send(submission(o1.id, { transactionId: trx })),
      request(app).post(v2(o2.id)).set(auth('customer')).send(submission(o2.id, { transactionId: sameTrxLower })),
    ]);
    const results = attempts.map((a) => (a as PromiseFulfilledResult<{ status: number; body: { error?: { code: string } } }>).value);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.error?.code === 'DUPLICATE_TRANSACTION')).toHaveLength(1);
  });

  // ─── I. Screenshot namespace ────────────────────────────────

  it('accepts only screenshots minted in the authenticated user’s payments namespace', async () => {
    const order = await createOrder({ customerId: customer.id });
    const own = `techservice-hub/payments/${customer.id}/${uuid()}.png`;
    const good = await request(app)
      .post(v2(order.id))
      .set(auth('customer'))
      .send(submission(order.id, { screenshotPathname: own, screenshotMimeType: 'image/png', screenshotSizeBytes: 1024 }));
    expect(good.status).toBe(201);
    expect(good.body.data.hasScreenshot).toBe(true);
    expect(JSON.stringify(good.body)).not.toContain(own); // raw public id never echoed

    const order2 = await createOrder({ customerId: customer.id });
    for (const screenshotPathname of [
      `techservice-hub/payments/${other.id}/${uuid()}.png`, // foreign user's namespace
      `techservice-hub/requirements/${customer.id}/${uuid()}.png`, // arbitrary folder
      `techservice-hub/payments/${customer.id}/not-a-uuid`, // bad basename
      `techservice-hub/payments/${customer.id}/${uuid()}`, // legacy no-extension shape
    ]) {
      const res = await request(app).post(v2(order2.id)).set(auth('customer')).send(submission(order2.id, { screenshotPathname }));
      expect(res.status).toBe(400);
    }

    const order3 = await createOrder({ customerId: customer.id });
    const tooBig = await request(app)
      .post(v2(order3.id))
      .set(auth('customer'))
      .send(submission(order3.id, { screenshotPathname: `techservice-hub/payments/${customer.id}/${uuid()}.jpg`, screenshotMimeType: 'image/jpeg', screenshotSizeBytes: 5 * 1024 * 1024 + 1 }));
    expect(tooBig.status).toBe(422);
    const badMime = await request(app)
      .post(v2(order3.id))
      .set(auth('customer'))
      .send(submission(order3.id, { screenshotPathname: `techservice-hub/payments/${customer.id}/${uuid()}.png`, screenshotMimeType: 'image/gif', screenshotSizeBytes: 1024 }));
    expect(badMime.status).toBe(422);
  });

  // ─── J. Legacy v1 compatibility (same app, same DB) ─────────

  it('keeps the legacy v1 submission endpoint working and unchanged', async () => {
    const order = await createOrder({ customerId: customer.id });
    const res = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set(auth('customer'))
      .send({ method: 'BKASH', transactionId: 'V1-TEST-123456' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['adminNote', 'amount', 'createdAt', 'hasScreenshot', 'id', 'method', 'status', 'transactionId', 'verifiedAt'].sort(),
    );
    const row = await prisma.payment.findUnique({ where: { id: res.body.data.id } });
    expect(row.method).toBe('BKASH');
    expect(row.paymentAccountId).toBeNull(); // v1 carries no account snapshot
    expect(row.methodKeySnapshot).toBeNull();

    // v1 schema stays pinned to the four legacy rails — 'OTHER' must fail validation
    const other = await createOrder({ customerId: customer.id });
    const pinned = await request(app)
      .post(`/api/orders/${other.id}/payments`)
      .set(auth('customer'))
      .send({ method: 'OTHER', transactionId: 'V1-OTHER-12345' });
    expect(pinned.status).toBe(422);
  });
});
