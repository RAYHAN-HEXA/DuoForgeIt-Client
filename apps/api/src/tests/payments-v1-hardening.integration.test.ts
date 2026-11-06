import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/**
 * Real-PostgreSQL integration suite for the HARDENED legacy v1 submission
 * (POST /api/orders/:id/payments).
 *
 * Before hardening, v1 rows carried no `transactionIdNormalized`, so the
 * Stage 1 `payment_trxid_active_unique` partial index never applied to them:
 * the same TrxID could be submitted on two different orders and both verified
 * (double PAID off one transaction). v1 also skipped the already-paid check
 * and mapped no P2002 (raw 500 on the one-active-submission index).
 *
 * These tests prove the closed gaps against the real engine — the partial
 * unique indexes are database-level truth, mocks cannot prove them. The suite
 * is SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL database:
 *
 *   createdb tsh_v1h_payments_test
 *   cd apps/api
 *   DATABASE_URL=postgresql://<you>@localhost:5432/tsh_v1h_payments_test \
 *   DIRECT_URL=...  npx prisma migrate deploy      # scratch DB only, never production
 *   TEST_DATABASE_URL=postgresql://<you>@localhost:5432/tsh_v1h_payments_test \
 *     npm test -w @tsh/api
 *
 * Production credentials must never appear in TEST_DATABASE_URL.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.V1H_RUN_ID = run;
  // Never send real email from an integration test.
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

// Firebase token verification is stubbed with run-scoped identities so reruns
// and neighboring suites sharing the disposable database never collide.
vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer v1h-(customer|customer2|admin)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.V1H_RUN_ID ?? '';
    return {
      uid: `v1h-${who}-${runId}`,
      name: who,
      email: `v1h-${who}-${runId}@v1h.test`,
      email_verified: true,
      sub: `v1h-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'v1h-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'customer' | 'customer2' | 'admin') => ({ Authorization: `Bearer v1h-${who}-token` });
const v1 = (orderId: string) => `/api/orders/${orderId}/payments`;
const uuid = () => randomUUID();

d('manual-payments v1 hardening (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let customer: { id: string };
  let customer2: { id: string };
  let admin: { id: string };
  const orderIds: string[] = [];

  async function createOrder(opts: { customerId: string; totalAmount?: string; amountPaid?: string | null; status?: 'SUBMITTED' | 'CANCELLED' } = { customerId: '' }) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `V1H-${run}-${uuid().slice(0, 8).toUpperCase()}`,
        customerId: opts.customerId,
        status: opts.status ?? 'SUBMITTED',
        title: 'V1 hardening fixture',
        deadline: new Date(Date.now() + 7 * 86400000),
        totalAmount: opts.totalAmount ?? '1000.00',
        ...(opts.amountPaid !== undefined ? { amountPaid: opts.amountPaid } : {}),
        idempotencyKey: uuid(),
      },
    });
    orderIds.push(order.id);
    return order;
  }

  const submitV1 = (orderId: string, transactionId: string, who: 'customer' | 'customer2' = 'customer') =>
    request(app).post(v1(orderId)).set(auth(who)).send({ method: 'BKASH', transactionId });

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    // Defensive sweep for leftovers from a crashed earlier run (unique
    // firebaseUid/email would otherwise collide).
    await prisma.user.deleteMany({ where: { email: { endsWith: '@v1h.test' } } });

    const [customerUser, customer2User, adminUser] = await Promise.all([
      prisma.user.create({ data: { firebaseUid: `v1h-customer-${run}`, email: `v1h-customer-${run}@v1h.test`, fullName: 'V1H Customer', role: 'CUSTOMER' } }),
      prisma.user.create({ data: { firebaseUid: `v1h-customer2-${run}`, email: `v1h-customer2-${run}@v1h.test`, fullName: 'V1H Customer 2', role: 'CUSTOMER' } }),
      prisma.user.create({ data: { firebaseUid: `v1h-admin-${run}`, email: `v1h-admin-${run}@v1h.test`, fullName: 'V1H Admin', role: 'ADMIN' } }),
    ]);
    customer = { id: customerUser.id };
    customer2 = { id: customer2User.id };
    admin = { id: adminUser.id };
  });

  afterAll(async () => {
    if (!prisma) return;
    // FK-safe teardown: orders (cascade payments) → users.
    await prisma.order.deleteMany({ where: { customerId: { in: [customer?.id, customer2?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@v1h.test' } } });
    await prisma.$disconnect();
  });

  it('happy path stores the raw TrxID verbatim plus an uppercase normalized copy', async () => {
    const order = await createOrder({ customerId: customer.id });
    const res = await submitV1(order.id, `  trx-${run} AbC  `);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUBMITTED');
    // v1's response shape is unchanged by hardening: Prisma Decimal toString()
    // strips trailing zeros (the 2-decimal money-string contract is v2-only).
    expect(res.body.data.amount).toBe('1000');

    const row = await prisma.payment.findUnique({ where: { id: res.body.data.id } });
    // The shared schema trims the edges (internal whitespace is preserved);
    // normalization additionally strips ALL whitespace + uppercases.
    expect(row.transactionId).toBe(`trx-${run} AbC`);
    expect(row.transactionIdNormalized).toBe(`TRX-${run.toUpperCase()}ABC`);
  });

  it('rejects the same TrxID (case/whitespace variants) on a DIFFERENT order — previously unguarded', async () => {
    const orderA = await createOrder({ customerId: customer.id });
    const orderB = await createOrder({ customerId: customer.id });

    const first = await submitV1(orderA.id, `DUP-${run} x9`);
    expect(first.status).toBe(201);

    // Same normalized TrxID, different order, different raw spelling.
    const dup = await submitV1(orderB.id, `dup-${run} X9`);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TRANSACTION');

    // Even a different customer cannot claim the same active TrxID.
    const orderC = await createOrder({ customerId: customer2.id });
    const crossCustomer = await submitV1(orderC.id, `DUP-${run}X9`, 'customer2');
    expect(crossCustomer.status).toBe(409);
    expect(crossCustomer.body.error.code).toBe('DUPLICATE_TRANSACTION');
  });

  it('maps the one-active-submission index to 409 PAYMENT_ALREADY_PENDING — previously a raw 500', async () => {
    const order = await createOrder({ customerId: customer.id });
    const first = await submitV1(order.id, `ACTIVE-${run}-1`);
    expect(first.status).toBe(201);

    const second = await submitV1(order.id, `ACTIVE-${run}-2`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PAYMENT_ALREADY_PENDING');
  });

  it('refuses a fully-paid order (ORDER_ALREADY_PAID)', async () => {
    const order = await createOrder({ customerId: customer.id, amountPaid: '1000.00' });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID' },
    });

    const res = await submitV1(order.id, `PAID-${run}-1`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_ALREADY_PAID');
  });

  it('refuses a partially-paid order (AMOUNT_MISMATCH with expected outstanding)', async () => {
    // amountPaid = 400 VERIFIED contribution; paymentStatus stays null (partial).
    const order = await createOrder({ customerId: customer.id, amountPaid: '400.00' });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'NAGAD',
        status: 'VERIFIED',
        amount: '400.00',
        transactionId: `PART-${run}-verified`,
        transactionIdNormalized: `PART-${run}-VERIFIED`,
        verifiedById: admin.id,
        verifiedAt: new Date(),
      },
    });

    const res = await submitV1(order.id, `PART-${run}-1`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AMOUNT_MISMATCH');
    expect(res.body.error.details).toEqual({ expected: '600.00' });
  });

  it('supports the reject-then-resubmit cycle (REJECTED rows leave the partial index)', async () => {
    const order = await createOrder({ customerId: customer.id });
    const trx = `CYCLE-${run}-1`;

    const first = await submitV1(order.id, trx);
    expect(first.status).toBe(201);

    const reject = await request(app)
      .patch(`/api/admin/payments/${first.body.data.id}`)
      .set(auth('admin'))
      .send({ decision: 'REJECTED', note: 'Wrong account screenshot' });
    expect(reject.status).toBe(200);

    // Same TrxID resubmits cleanly after rejection — the partial unique index
    // only covers PENDING/SUBMITTED rows.
    const second = await submitV1(order.id, trx.toLowerCase());
    expect(second.status).toBe(201);
    expect(second.body.data.status).toBe('SUBMITTED');
  });

  it('refuses cancelled orders and foreign orders without leaking existence', async () => {
    const cancelled = await createOrder({ customerId: customer.id, status: 'CANCELLED' });
    const cancelledRes = await submitV1(cancelled.id, `CXL-${run}-1`);
    expect(cancelledRes.status).toBe(409);
    expect(cancelledRes.body.error.code).toBe('CONFLICT');

    const foreign = await createOrder({ customerId: customer2.id });
    const foreignRes = await submitV1(foreign.id, `FRN-${run}-1`);
    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.error.code).toBe('NOT_FOUND');
  });
});
