import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/**
 * Real-PostgreSQL integration suite for manual-payments v3:
 * admin verification/rejection, race-safe transitions, and order accounting.
 *
 * SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL database:
 *
 *   createdb tsh_stage3_payments_test
 *   cd apps/api
 *   DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage3_payments_test \
 *   DIRECT_URL=...  npx prisma migrate deploy      # scratch DB only, NEVER production
 *   TEST_DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage3_payments_test \
 *     npm test -w @tsh/api
 *
 * Production credentials must never appear in TEST_DATABASE_URL.
 *
 * Test 5 (two reviewable payments on one order) deliberately relaxes the
 * Stage 1 one-active-submission partial unique index for the duration of that
 * test: the constraint makes the scenario impossible through normal submission,
 * so legacy/test data is simulated. The index is recreated in a `finally`
 * block (and defensively in afterAll). The API suite runs test files
 * sequentially against the shared test database — see vitest.config.ts.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

// Read by the hoisted token mock below. Must be set before any imports that
// read the environment.
if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.STAGE3_RUN_ID = run;
  // Never send real email from an integration test.
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer stage3-(customer|admin|admin2)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.STAGE3_RUN_ID ?? '';
    return {
      uid: `stage3-${who}-${runId}`,
      name: who,
      email: `stage3-${who}-${runId}@stage3.test`,
      email_verified: true,
      sub: `stage3-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'stage3-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'customer' | 'admin' | 'admin2') => ({ Authorization: `Bearer stage3-${who}-token` });
const reviewUrl = (paymentId: string) => `/api/admin/payments/${paymentId}`;
const uuid = () => randomUUID();

const ACTIVE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS "payment_one_active_submission_per_order"
    ON "Payment"("orderId")
    WHERE "status" IN ('PENDING', 'SUBMITTED')
`;

d('manual-payments v3 (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let customer: { id: string; email: string };
  let admin: { id: string };
  let admin2: { id: string };
  let accountId: string;
  const orderIds: string[] = [];
  const paymentIds: string[] = [];

  const trx = (label: string) => `${label}-${run}-${uuid().slice(0, 8)}`;

  async function createOrder(opts: { totalAmount?: string; amountPaid?: string | null; status?: 'SUBMITTED' } = {}) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `STAGE3-${run}-${uuid().slice(0, 8).toUpperCase()}`,
        customerId: customer.id,
        status: opts.status ?? 'SUBMITTED',
        title: 'Stage 3 payment fixture',
        deadline: new Date(Date.now() + 7 * 86400000),
        totalAmount: opts.totalAmount ?? '1000.00',
        ...(opts.amountPaid !== undefined ? { amountPaid: opts.amountPaid } : {}),
        idempotencyKey: uuid(),
      },
    });
    orderIds.push(order.id);
    return order;
  }

  async function createPayment(
    orderId: string,
    opts: {
      status?: 'PENDING' | 'SUBMITTED';
      amount?: string;
      method?: 'BKASH' | 'NAGAD';
      transactionId?: string;
    } = {},
  ) {
    const raw = opts.transactionId ?? trx('TRX');
    const payment = await prisma.payment.create({
      data: {
        orderId,
        method: opts.method ?? 'BKASH',
        status: opts.status ?? 'SUBMITTED',
        amount: opts.amount ?? '1000.00',
        transactionId: raw,
        transactionIdNormalized: raw.trim().replace(/\s+/g, '').toUpperCase(),
      },
    });
    paymentIds.push(payment.id);
    return payment;
  }

  function review(
    paymentId: string,
    decision: 'VERIFIED' | 'REJECTED',
    note?: string,
    who: 'admin' | 'admin2' = 'admin',
  ) {
    const req = request(app).patch(reviewUrl(paymentId)).set(auth(who));
    return req.send(note === undefined ? { decision } : { decision, note });
  }

  async function auditRows(paymentId: string) {
    return prisma.auditLog.findMany({
      where: { entityType: 'Payment', entityId: paymentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function notificationsFor(orderId: string, title?: string) {
    return prisma.notification.findMany({
      where: { userId: customer.id, link: `/orders/${orderId}`, ...(title ? { title } : {}) },
    });
  }

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const customerUser = await prisma.user.create({
      data: {
        firebaseUid: `stage3-customer-${run}`,
        email: `stage3-customer-${run}@stage3.test`,
        fullName: 'Stage3 Customer',
        role: 'CUSTOMER',
      },
    });
    const adminUser = await prisma.user.create({
      data: {
        firebaseUid: `stage3-admin-${run}`,
        email: `stage3-admin-${run}@stage3.test`,
        fullName: 'Stage3 Admin',
        role: 'ADMIN',
      },
    });
    const admin2User = await prisma.user.create({
      data: {
        firebaseUid: `stage3-admin2-${run}`,
        email: `stage3-admin2-${run}@stage3.test`,
        fullName: 'Stage3 Admin Two',
        role: 'ADMIN',
      },
    });
    customer = { id: customerUser.id, email: customerUser.email };
    admin = { id: adminUser.id };
    admin2 = { id: admin2User.id };

    const account = await prisma.paymentAccount.create({
      data: {
        methodKey: 'BKASH',
        label: `STAGE3-${run}-bkash`,
        accountNumber: `01${uuid().slice(0, 9)}`,
        accountHolder: 'Stage3 Holder',
        isActive: true,
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Remove fixtures first, then restore the index in case a test aborted
    // while it was temporarily relaxed.
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: paymentIds }, entityType: 'Payment' } });
    await prisma.paymentAccount.deleteMany({ where: { label: { startsWith: `STAGE3-${run}` } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@stage3.test' } } });
    await prisma.$executeRawUnsafe(ACTIVE_INDEX_SQL);
    await prisma.$disconnect();
  });

  // ─── Test 1 — successful verification ────────────────────────

  it('verifies atomically, recalculates accounting, audits, and hides staff notes from customers', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });

    const res = await review(payment.id, 'VERIFIED', 'internal verification note');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ id: payment.id, status: 'VERIFIED' });

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('VERIFIED');
    expect(afterPayment.verifiedById).toBe(admin.id);
    expect(afterPayment.verifiedAt).toBeInstanceOf(Date);
    expect(afterPayment.rejectedById).toBeNull();

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder.amountPaid.toFixed(2)).toBe('1000.00');
    expect(afterOrder.paymentStatus).toBe('PAID');

    const audits = await auditRows(payment.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('PAYMENT.VERIFY');
    expect(audits[0].actorId).toBe(admin.id);
    expect(audits[0].metadata).toMatchObject({
      from: 'SUBMITTED',
      to: 'VERIFIED',
      adminId: admin.id,
      amount: '1000.00',
    });

    const notes = await notificationsFor(order.id, 'Payment verified');
    expect(notes).toHaveLength(1);

    // Client-supplied accounting/reviewer fields are stripped by the schema.
    const injectedOrder = await createOrder({ totalAmount: '500.00' });
    const injectedPayment = await createPayment(injectedOrder.id, { amount: '500.00' });
    const injected = await request(app)
      .patch(reviewUrl(injectedPayment.id))
      .set(auth('admin'))
      .send({
        decision: 'VERIFIED',
        amountPaid: '0.01',
        paymentStatus: 'PAID',
        verifiedById: 'attacker',
        orderTotal: '1.00',
      });
    expect(injected.status).toBe(200);
    const injectedOrderAfter = await prisma.order.findUnique({ where: { id: injectedOrder.id } });
    expect(injectedOrderAfter.amountPaid.toFixed(2)).toBe('500.00');
    const injectedPaymentAfter = await prisma.payment.findUnique({ where: { id: injectedPayment.id } });
    expect(injectedPaymentAfter.verifiedById).toBe(admin.id);

    // Customer detail: no screenshot id, no staff-only verification note.
    const detail = await request(app).get(`/api/orders/${order.id}`).set(auth('customer'));
    expect(detail.status).toBe(200);
    const customerPayment = detail.body.data.payments.find((p: { id: string }) => p.id === payment.id);
    expect(customerPayment.adminNote).toBeNull();
    expect(customerPayment.rejectionReason).toBeNull();
    expect(JSON.stringify(detail.body)).not.toContain('screenshotPublicId');
    expect(JSON.stringify(detail.body)).not.toContain('internal verification note');
  });

  // ─── Test 2 — successful rejection ──────────────────────────

  it('rejects with the mandated audit fields and never increases amountPaid', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });
    const reason = 'Transaction ID was not found';

    const res = await review(payment.id, 'REJECTED', reason);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: payment.id, status: 'REJECTED' });

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('REJECTED');
    expect(afterPayment.rejectedById).toBe(admin.id);
    expect(afterPayment.rejectedAt).toBeInstanceOf(Date);
    expect(afterPayment.rejectionReason).toBe(reason);
    // Historical identifiers are preserved for audit.
    expect(afterPayment.transactionId).toBe(payment.transactionId);
    expect(afterPayment.transactionIdNormalized).toBe(payment.transactionIdNormalized);

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder.amountPaid).toBeNull();
    expect(afterOrder.paymentStatus).toBeNull();

    const audits = await auditRows(payment.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('PAYMENT.REJECT');
    expect(audits[0].metadata).toMatchObject({
      from: 'SUBMITTED',
      to: 'REJECTED',
      adminId: admin.id,
      rejectionReason: reason,
    });

    const notes = await notificationsFor(order.id, 'Payment could not be verified');
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain(reason);

    const detail = await request(app).get(`/api/orders/${order.id}`).set(auth('customer'));
    const customerPayment = detail.body.data.payments.find((p: { id: string }) => p.id === payment.id);
    expect(customerPayment.rejectionReason).toBe(reason);
    expect(customerPayment.adminNote).toBe(reason);
    expect(customerPayment.rejectedAt).toBeTruthy();
    expect(JSON.stringify(detail.body)).not.toContain('screenshotPublicId');
  });

  it('rejects invalid rejection reasons with a validation error', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });

    for (const note of [undefined, 'no', '    ']) {
      const res = await request(app)
        .patch(reviewUrl(payment.id))
        .set(auth('admin'))
        .send(note === undefined ? { decision: 'REJECTED' } : { decision: 'REJECTED', note });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('SUBMITTED');
    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder.amountPaid).toBeNull();
  });

  // ─── Test 3 — duplicate verification race ───────────────────

  it('lets exactly one of two concurrent verifications win', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });

    const results = await Promise.all([
      review(payment.id, 'VERIFIED', undefined, 'admin'),
      review(payment.id, 'VERIFIED', undefined, 'admin2'),
    ]);
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('PAYMENT_NOT_REVIEWABLE');

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('VERIFIED');
    expect([admin.id, admin2.id]).toContain(afterPayment.verifiedById);

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder.amountPaid.toFixed(2)).toBe('1000.00'); // exactly once, not 2000
    expect(afterOrder.paymentStatus).toBe('PAID');

    const audits = await auditRows(payment.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('PAYMENT.VERIFY');
    expect(await notificationsFor(order.id)).toHaveLength(1);
  });

  // ─── Test 4 — verify versus reject race ─────────────────────

  it('serialises a verify-versus-reject race into exactly one final state', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });

    const [verify, reject] = await Promise.all([
      review(payment.id, 'VERIFIED', undefined, 'admin'),
      review(payment.id, 'REJECTED', 'Amount did not match the transfer', 'admin2'),
    ]);
    expect([verify.status, reject.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });

    const audits = await auditRows(payment.id);
    expect(audits).toHaveLength(1);
    expect(await notificationsFor(order.id)).toHaveLength(1);

    if (afterPayment.status === 'VERIFIED') {
      expect(afterPayment.rejectedAt).toBeNull();
      expect(afterOrder.amountPaid.toFixed(2)).toBe('1000.00');
      expect(afterOrder.paymentStatus).toBe('PAID');
      expect(audits[0].action).toBe('PAYMENT.VERIFY');
    } else {
      expect(afterPayment.status).toBe('REJECTED');
      expect(afterPayment.rejectionReason).toBeTruthy();
      expect(afterOrder.amountPaid).toBeNull();
      expect(afterOrder.paymentStatus).toBeNull();
      expect(audits[0].action).toBe('PAYMENT.REJECT');
    }
  });

  // ─── Test 5 — two payments, one order ───────────────────────

  it('aggregates concurrent verifications of different payments without lost updates', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });

    // The one-active-submission index makes two live rows impossible through
    // normal submission. Simulate a legacy dataset in an isolated scratch DB.
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "payment_one_active_submission_per_order"');
    let first: { id: string } | undefined;
    let second: { id: string } | undefined;
    try {
      const p1 = await createPayment(order.id, { status: 'SUBMITTED', amount: '400.00' });
      const p2 = await createPayment(order.id, { status: 'PENDING', amount: '600.00' });
      first = p1;
      second = p2;

      const results = await Promise.all([
        review(p1.id, 'VERIFIED', undefined, 'admin'),
        review(p2.id, 'VERIFIED', undefined, 'admin2'),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);

      const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(afterOrder.amountPaid.toFixed(2)).toBe('1000.00');
      expect(afterOrder.paymentStatus).toBe('PAID');

      const verified = await prisma.payment.findMany({
        where: { orderId: order.id, status: 'VERIFIED' },
        orderBy: { amount: 'asc' },
      });
      expect(verified.map((p: { amount: { toFixed: (n: number) => string } }) => p.amount.toFixed(2))).toEqual([
        '400.00',
        '600.00',
      ]);
      expect(await notificationsFor(order.id)).toHaveLength(2);
    } finally {
      // Never leave two active rows behind when the index is recreated.
      if (first || second) {
        await prisma.payment.updateMany({
          where: {
            id: { in: [first?.id, second?.id].filter(Boolean) },
            status: { in: ['PENDING', 'SUBMITTED'] },
          },
          data: { status: 'REJECTED' },
        });
      }
      await prisma.$executeRawUnsafe(ACTIVE_INDEX_SQL);
    }
  });

  // ─── Test 6 — rejected TrxID reuse ──────────────────────────

  it('frees a rejected TrxID for a new submission through the existing index', async () => {
    const order1 = await createOrder({ totalAmount: '1000.00' });
    const raw = trx('REUSE');
    const first = await createPayment(order1.id, { amount: '1000.00', transactionId: raw });

    const rejected = await review(first.id, 'REJECTED', 'Duplicate transfer check');
    expect(rejected.status).toBe(200);

    const order2 = await createOrder({ totalAmount: '1000.00' });
    const reuse = await request(app)
      .post(`/api/orders/${order2.id}/payments/v2`)
      .set(auth('customer'))
      .send({ accountId, transactionId: raw, amount: '1000.00' });
    expect(reuse.status).toBe(201);
    paymentIds.push(reuse.body.data.id);

    const reused = await prisma.payment.findUnique({ where: { id: reuse.body.data.id } });
    expect(reused.status).toBe('SUBMITTED');
    expect(reused.transactionIdNormalized).toBe(raw.trim().replace(/\s+/g, '').toUpperCase());
  });

  // ─── Test 7 — rejection preserves previous verified accounting ─

  it('does not reset accounting when a later payment is rejected', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const first = await createPayment(order.id, { amount: '400.00' });
    const verified = await review(first.id, 'VERIFIED');
    expect(verified.status).toBe(200);

    const second = await createPayment(order.id, { amount: '600.00' });
    const rejected = await review(second.id, 'REJECTED', 'Second transfer was invalid');
    expect(rejected.status).toBe(200);

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder?.amountPaid.toFixed(2)).toBe('400.00');
    expect(afterOrder?.paymentStatus).toBeNull(); // partial remains partial

    const firstAfter = await prisma.payment.findUnique({ where: { id: first.id } });
    expect(firstAfter.status).toBe('VERIFIED');
    const secondAfter = await prisma.payment.findUnique({ where: { id: second.id } });
    expect(secondAfter.status).toBe('REJECTED');
  });

  // ─── Test 8 — transaction rollback ──────────────────────────

  it('rolls back the payment transition when accounting fails', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });
    const fn = `stage3_fail_order_${run}`;
    const trigger = `stage3_fail_order_${run}_trg`;

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."id" = '${order.id}' THEN
          RAISE EXCEPTION 'stage3 forced accounting failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);

    try {
      const res = await review(payment.id, 'VERIFIED');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL');
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Order"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('SUBMITTED');
    expect(afterPayment.verifiedAt).toBeNull();

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder.amountPaid).toBeNull();
    expect(afterOrder.paymentStatus).toBeNull();

    expect(await auditRows(payment.id)).toHaveLength(0);
    expect(await notificationsFor(order.id)).toHaveLength(0);
  });

  // ─── Test 9 — authorization ─────────────────────────────────

  it('enforces authentication and admin RBAC on review', async () => {
    const order = await createOrder({ totalAmount: '1000.00' });
    const payment = await createPayment(order.id, { amount: '1000.00' });

    const anonymous = await request(app).patch(reviewUrl(payment.id)).send({ decision: 'VERIFIED' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    for (const decision of ['VERIFIED', 'REJECTED'] as const) {
      const body = decision === 'REJECTED' ? { decision, note: 'Not allowed for customers' } : { decision };
      const customerAttempt = await request(app).patch(reviewUrl(payment.id)).set(auth('customer')).send(body);
      expect(customerAttempt.status).toBe(403);
      expect(customerAttempt.body.error.code).toBe('FORBIDDEN');
    }

    const untouched = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(untouched.status).toBe('SUBMITTED');

    const allowed = await review(payment.id, 'VERIFIED');
    expect(allowed.status).toBe(200);
  });

  // ─── Test 10 — legacy v1 regression ─────────────────────────

  it('keeps legacy v1 submission and review working, including legacy PENDING rows', async () => {
    const order = await createOrder({ totalAmount: '500.00' });
    const legacy = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set(auth('customer'))
      .send({ method: 'NAGAD', transactionId: 'LEGACY-STAGE3-001' });
    expect(legacy.status).toBe(201);
    expect(legacy.body.success).toBe(true);
    expect(legacy.body.data.status).toBe('SUBMITTED');

    const legacyRow = await prisma.payment.findUnique({ where: { id: legacy.body.data.id } });
    expect(legacyRow.amount.toFixed(2)).toBe('500.00');
    paymentIds.push(legacy.body.data.id);

    const verified = await review(legacy.body.data.id, 'VERIFIED');
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ success: true, data: { id: legacy.body.data.id, status: 'VERIFIED' } });

    const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
    expect(orderAfter.amountPaid.toFixed(2)).toBe('500.00');
    expect(orderAfter.paymentStatus).toBe('PAID');

    // Legacy PENDING rows stay reviewable too.
    const pendingOrder = await createOrder({ totalAmount: '300.00' });
    const pending = await createPayment(pendingOrder.id, { status: 'PENDING', amount: '300.00' });
    const pendingReview = await review(pending.id, 'VERIFIED');
    expect(pendingReview.status).toBe(200);
    const pendingOrderAfter = await prisma.order.findUnique({ where: { id: pendingOrder.id } });
    expect(pendingOrderAfter.amountPaid.toFixed(2)).toBe('300.00');
    expect(pendingOrderAfter.paymentStatus).toBe('PAID');
  });
});
