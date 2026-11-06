import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { AdminPaymentQueueDto, AdminPaymentStatsDto } from '@tsh/shared';

/**
 * Real-PostgreSQL integration suite for Stage 6 — admin payment dashboard:
 * paginated queue with filters/search/date bounds, stable actionable-first
 * ordering, per-status stats, screenshot signing security, and the queue-side
 * review regression (verify accounting + concurrent-review conflict).
 * SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL database:
 *
 *   createdb tsh_stage6_admin_payments_test
 *   cd apps/api
 *   DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage6_admin_payments_test \
 *   DIRECT_URL=...  npx prisma migrate deploy      # scratch DB only, NEVER production
 *   TEST_DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage6_admin_payments_test \
 *     npm test -w @tsh/api
 *
 * Production credentials must never appear in TEST_DATABASE_URL.
 *
 * Vercel Blob is stubbed with fake credentials: signed-URL minting is exercised
 * without any network call, and secrets must never appear in responses.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);
const CLOUD_SECRET = `stage6-cloud-secret-${run}`;
const TOKEN = 'vercel_blob_rw_stage6_test';

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.STAGE6_RUN_ID = run;
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer stage6-(admin|admin2|customer)-token$/.exec(
      req.headers.authorization ?? '',
    );
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.STAGE6_RUN_ID ?? '';
    return {
      uid: `stage6-${who}-${runId}`,
      name: who,
      email: `stage6-${who}-${runId}@stage6.test`,
      email_verified: true,
      sub: `stage6-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'stage6-test',
    } as never;
  },
}));

// The Blob SDK is mocked — screenshot URL minting must not hit the network.
vi.mock('@vercel/blob', () => ({
  head: vi.fn().mockResolvedValue({ size: 1024, contentType: 'image/png' }),
  issueSignedToken: vi.fn().mockResolvedValue({ delegationToken: 'd', clientSigningToken: 'c', validUntil: Date.now() + 60_000 }),
  presignUrl: vi.fn().mockImplementation((_t: unknown, opts: { pathname: string }) =>
    Promise.resolve({ presignedUrl: `https://blob.stage6.test/${opts.pathname}?sig=fake` })),
  del: vi.fn(),
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'admin' | 'admin2' | 'customer') => ({
  Authorization: `Bearer stage6-${who}-token`,
});
const daysAgoDateOnly = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const isMoneyString = (v: unknown) => typeof v === 'string' && /^\d+\.\d{2}$/.test(v);

d('Stage 6 — admin payment dashboard (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let admin: { id: string };
  let admin2: { id: string };
  let customer: { id: string };
  let order1: { id: string; orderNumber: string };
  let order2: { id: string; orderNumber: string };
  let accountId: string;
  let pPending: { id: string };
  let pSubmitted1: { id: string };
  let pSubmitted2: { id: string };
  let pVerified: { id: string };
  let pBadNamespace: { id: string };

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const [adminUser, admin2User, customerUser] = await Promise.all([
      prisma.user.create({
        data: {
          firebaseUid: `stage6-admin-${run}`,
          email: `stage6-admin-${run}@stage6.test`,
          fullName: 'Stage 6 Admin',
          role: 'ADMIN',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `stage6-admin2-${run}`,
          email: `stage6-admin2-${run}@stage6.test`,
          fullName: 'Stage 6 Admin Two',
          role: 'ADMIN',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `stage6-customer-${run}`,
          email: `stage6-customer-${run}@stage6.test`,
          fullName: 'Stage 6 Customer',
          role: 'CUSTOMER',
        },
      }),
    ]);
    admin = { id: adminUser.id };
    admin2 = { id: admin2User.id };
    customer = { id: customerUser.id };

    const account = await prisma.paymentAccount.create({
      data: {
        methodKey: 'BKASH',
        label: `STAGE6-${run}-acct`,
        accountNumber: '01712345678',
        accountHolder: 'Stage 6 Holder',
        isActive: true,
        displayOrder: 0,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    accountId = account.id;

    // One order per ACTIVE submission — the Stage 1
    // `payment_one_active_submission_per_order` index forbids two
    // PENDING/SUBMITTED rows on the same order, exactly as in production.
    const makeOrder = async (suffix: string, data: Record<string, unknown> = {}) =>
      prisma.order.create({
        data: {
          orderNumber: `STAGE6-${run}-${suffix}`,
          customerId: customer.id,
          status: 'SUBMITTED',
          title: `Stage 6 order ${suffix}`,
          deadline: new Date(Date.now() + 7 * 86400000),
          totalAmount: '1000.00',
          idempotencyKey: randomUUID(),
          ...data,
        },
      });

    order1 = await makeOrder('AAA'); // gets pSubmitted1 (verified later → outstanding 0)
    order2 = await makeOrder('BBB', {
      status: 'IN_PROGRESS',
      amountPaid: '200.00', // pre-seeded accounting: 1000 − 200 = 800 outstanding
    });
    const order3 = await makeOrder('CCC'); // legacy PENDING row
    const order4 = await makeOrder('DDD'); // UPAY SUBMITTED row
    const order5 = await makeOrder('EEE'); // wrong-namespace screenshot row

    const basePayment = {
      method: 'BKASH' as const,
      status: 'SUBMITTED' as const,
      amount: '1000.00',
    };

    // Legacy PENDING row — no v2 snapshots.
    pPending = await prisma.payment.create({
      data: {
        ...basePayment,
        orderId: order3.id,
        status: 'PENDING',
        transactionId: `TRX6LEG-${run.slice(0, 4)}001`,
      },
    });
    // Recent v2 SUBMITTED with snapshot + screenshot (older createdAt for
    // date-filter and oldest-first ordering assertions).
    pSubmitted1 = await prisma.payment.create({
      data: {
        ...basePayment,
        orderId: order1.id,
        createdAt: new Date(Date.now() - 10 * 86400000),
        transactionId: `TRX6AAA-${run.slice(0, 4)}111`,
        transactionIdNormalized: `TRX6AAA-${run.slice(0, 4)}111`,
        senderNumber: '01711100001',
        paymentAccountId: accountId,
        methodKeySnapshot: 'BKASH',
        methodLabelSnapshot: `STAGE6-${run}-acct`,
        accountNumberSnapshot: '01712345678',
        accountHolderSnapshot: 'Stage 6 Holder',
        accountTypeSnapshot: 'Personal',
        instructionsSnapshot: 'Send money, then submit the TrxID.',
        blobPath: `techservice-hub/payments/${customer.id}/${randomUUID()}.png`,
      },
    });
    // Custom rail (UPAY) — method OTHER + methodKeySnapshot.
    pSubmitted2 = await prisma.payment.create({
      data: {
        ...basePayment,
        orderId: order4.id,
        createdAt: new Date(Date.now() - 2 * 86400000),
        method: 'OTHER',
        transactionId: `TRX6ZZZ-${run.slice(0, 4)}999`,
        transactionIdNormalized: `TRX6ZZZ-${run.slice(0, 4)}999`,
        paymentAccountId: accountId,
        methodKeySnapshot: 'UPAY',
        methodLabelSnapshot: 'Upay wallet',
        accountNumberSnapshot: '01899999999',
        accountHolderSnapshot: 'Stage 6 Holder',
      },
    });
    // Terminal rows on order2 (which already has 200.00 verified accounting).
    pVerified = await prisma.payment.create({
      data: {
        orderId: order2.id,
        method: 'NAGAD',
        status: 'VERIFIED',
        amount: '200.00',
        transactionId: `TRX6VER-${run.slice(0, 4)}222`,
        verifiedById: admin2.id,
        verifiedAt: new Date(Date.now() - 3 * 86400000),
      },
    });
    // Seeded without a handle: the REJECTED row is exercised through the
    // stats/ordering/DTO assertions rather than by direct id.
    await prisma.payment.create({
      data: {
        orderId: order2.id,
        method: 'BKASH',
        status: 'REJECTED',
        amount: '500.00',
        transactionId: `TRX6REJ-${run.slice(0, 4)}333`,
        rejectedById: admin2.id,
        rejectedAt: new Date(Date.now() - 1 * 86400000),
        rejectionReason: 'Wrong amount received',
      },
    });
    // Stored reference outside the payments namespace — defense-in-depth probe.
    pBadNamespace = await prisma.payment.create({
      data: {
        ...basePayment,
        orderId: order5.id,
        transactionId: `TRX6BAD-${run.slice(0, 4)}444`,
        blobPath: `techservice-hub/requirements/${randomUUID()}.pdf`,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    // FK-safe teardown of this run's rows, tolerant of prior failed runs.
    const stage6Users = await prisma.user.findMany({
      where: { email: { endsWith: '@stage6.test' } },
      select: { id: true },
    });
    const stage6UserIds = stage6Users.map((u: { id: string }) => u.id);
    if (stage6UserIds.length > 0) {
      await prisma.order.deleteMany({ where: { customerId: { in: stage6UserIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: stage6UserIds } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: '@stage6.test' } } });
    }
    await prisma.paymentAccount.deleteMany({ where: { label: { startsWith: `STAGE6-${run}` } } });
    await prisma.$disconnect();
  });

  async function queue(query = ''): Promise<AdminPaymentQueueDto> {
    const res = await request(app).get(`/api/admin/payments${query}`).set(auth('admin'));
    expect(res.status).toBe(200);
    return res.body.data as AdminPaymentQueueDto;
  }

  const runItems = (q: AdminPaymentQueueDto) => q.items.filter((p) => p.order.orderNumber.includes(`STAGE6-${run}`));

  // ─── Authorization ──────────────────────────────────────────

  it('rejects unauthenticated and non-admin requests on queue, stats and screenshot routes', async () => {
    const noAuth = await request(app).get('/api/admin/payments');
    expect(noAuth.status).toBe(401);
    const customerQueue = await request(app).get('/api/admin/payments').set(auth('customer'));
    expect(customerQueue.status).toBe(403);
    const customerStats = await request(app).get('/api/admin/payments/stats').set(auth('customer'));
    expect(customerStats.status).toBe(403);
    const customerShot = await request(app)
      .get(`/api/admin/payments/${pSubmitted1.id}/screenshot`)
      .set(auth('customer'));
    expect(customerShot.status).toBe(403);
  });

  // ─── Queue validation ───────────────────────────────────────

  it('rejects invalid pagination, statuses and date bounds', async () => {
    expect((await request(app).get('/api/admin/payments?page=0').set(auth('admin'))).status).toBe(422);
    expect((await request(app).get('/api/admin/payments?pageSize=1000').set(auth('admin'))).status).toBe(422);
    expect((await request(app).get('/api/admin/payments?status=NOPE').set(auth('admin'))).status).toBe(422);
    expect((await request(app).get('/api/admin/payments?from=not-a-date').set(auth('admin'))).status).toBe(422);
    expect((await request(app).get('/api/admin/payments?to=2026-13-99').set(auth('admin'))).status).toBe(422);
  });

  // ─── Queue behavior ─────────────────────────────────────────

  it('paginates with total/totalPages and bounded page sizes', async () => {
    const q = await queue(`?page=1&pageSize=2`);
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(2);
    expect(q.total).toBeGreaterThanOrEqual(6);
    expect(q.totalPages).toBeGreaterThanOrEqual(3);
    expect(q.items).toHaveLength(2);
  });

  it('orders reviewable work first, oldest first, terminal after', async () => {
    const q = await queue(`?pageSize=100`);
    const rows = runItems(q);
    const statuses = rows.map((p) => p.status);
    const firstTerminal = statuses.findIndex((s) => s === 'VERIFIED' || s === 'REJECTED');
    expect(firstTerminal).toBeGreaterThan(-1);
    for (let i = 0; i < firstTerminal; i++) {
      expect(['PENDING', 'SUBMITTED']).toContain(statuses[i]);
    }
    for (let i = firstTerminal; i < statuses.length; i++) {
      expect(['VERIFIED', 'REJECTED', 'REFUNDED']).toContain(statuses[i]);
    }
    const submittedRows = rows.filter((p) => p.status === 'SUBMITTED');
    const created = submittedRows.map((p) => new Date(p.createdAt).getTime());
    expect([...created].sort((a, b) => a - b)).toEqual(created);
  });

  it('filters by status', async () => {
    const q = await queue(`?status=SUBMITTED`);
    for (const p of q.items) expect(p.status).toBe('SUBMITTED');
    expect(runItems(q).length).toBeGreaterThanOrEqual(3);
  });

  it('filters by method enum and by custom rail snapshot', async () => {
    const upay = await queue(`?method=UPAY`);
    const upayRows = runItems(upay);
    expect(upayRows.length).toBeGreaterThanOrEqual(1);
    for (const p of upayRows) expect(p.methodKeySnapshot).toBe('UPAY');

    const other = await queue(`?method=OTHER`);
    expect(runItems(other).length).toBeGreaterThanOrEqual(1);

    const bkash = await queue(`?method=BKASH`);
    for (const p of runItems(bkash)) expect(p.method).toBe('BKASH');
  });

  it('searches by TrxID (case-insensitive), order number, customer and payment id', async () => {
    const lowerTrx = `trx6aaa-${run.slice(0, 4)}111`;
    expect(runItems(await queue(`?search=${lowerTrx}`)).map((p) => p.id)).toContain(pSubmitted1.id);

    expect(runItems(await queue(`?search=${encodeURIComponent(`STAGE6-${run}-BBB`)}`)).length).toBeGreaterThanOrEqual(2);
    expect(runItems(await queue(`?search=stage 6 customer`.replace(/ /g, '%20'))).length).toBeGreaterThanOrEqual(6);
    expect(runItems(await queue(`?search=${encodeURIComponent(`stage6-customer-${run}@stage6.test`)}`)).length).toBeGreaterThanOrEqual(6);
    expect(runItems(await queue(`?search=${pSubmitted2.id}`)).map((p) => p.id)).toEqual([pSubmitted2.id]);
  });

  it('filters by whole-UTC-day date bounds', async () => {
    // pSubmitted1 was created 10 days ago; a from-bound of 9 days ago excludes it.
    const recent = await queue(`?from=${daysAgoDateOnly(9)}`);
    expect(runItems(recent).map((p) => p.id)).not.toContain(pSubmitted1.id);
    const wide = await queue(`?from=${daysAgoDateOnly(11)}`);
    expect(runItems(wide).map((p) => p.id)).toContain(pSubmitted1.id);
    // to-bound of 11 days ago excludes everything seeded (all are ≤ 10 days old or newer).
    const oldOnly = await queue(`?to=${daysAgoDateOnly(11)}`);
    expect(runItems(oldOnly)).toHaveLength(0);
    const fromTo = await queue(`?from=${daysAgoDateOnly(11)}&to=${daysAgoDateOnly(9)}`);
    expect(runItems(fromTo).map((p) => p.id)).toEqual([pSubmitted1.id]);
  });

  it('returns safe DTO fields with accounting, snapshots and no secrets', async () => {
    const q = await queue(`?pageSize=100`);
    const raw = JSON.stringify(q);
    expect(raw).not.toContain('screenshotPublicId');
    expect(raw).not.toContain(CLOUD_SECRET);
    expect(raw).not.toContain('firebaseUid');
    expect(raw).not.toContain('transactionIdNormalized');

    const submitted1 = q.items.find((p) => p.id === pSubmitted1.id)!;
    expect(submitted1.hasScreenshot).toBe(true);
    expect(submitted1.senderNumber).toBe('01711100001');
    expect(submitted1.methodKeySnapshot).toBe('BKASH');
    expect(submitted1.accountNumberSnapshot).toBe('01712345678');
    expect(submitted1.instructionsSnapshot).toContain('TrxID');
    expect(submitted1.order.totalAmount).toBe('1000.00');
    expect(submitted1.order.outstandingAmount).toBe('1000.00'); // nothing verified yet
    expect(submitted1.order.customerEmail).toContain('@stage6.test');

    const verified = q.items.find((p) => p.id === pVerified.id)!;
    expect(verified.verifiedByName).toBe('Stage 6 Admin Two');
    expect(verified.order.totalAmount).toBe('1000.00');
    expect(verified.order.outstandingAmount).toBe('800.00'); // 1000 − 200 verified

    const legacy = q.items.find((p) => p.id === pPending.id)!;
    expect(legacy.methodKeySnapshot ?? null).toBeNull(); // legacy v1 row
    expect(legacy.hasScreenshot).toBe(false);
  });

  it('reports per-status stats with awaiting amount', async () => {
    const res = await request(app).get('/api/admin/payments/stats').set(auth('admin'));
    expect(res.status).toBe(200);
    const stats = res.body.data as AdminPaymentStatsDto;
    expect(stats.counts.SUBMITTED).toBeGreaterThanOrEqual(3);
    expect(stats.counts.VERIFIED).toBeGreaterThanOrEqual(1);
    expect(stats.counts.REJECTED).toBeGreaterThanOrEqual(1);
    expect(stats.counts.PENDING).toBeGreaterThanOrEqual(1);
    expect(stats.total).toBeGreaterThanOrEqual(6);
    expect(isMoneyString(stats.awaitingAmount)).toBe(true);
  });

  // ─── Screenshot signing security ────────────────────────────

  it('signs screenshots only for admins, only from the stored payment row', async () => {
    const noAuth = await request(app).get(`/api/admin/payments/${pSubmitted1.id}/screenshot`);
    expect(noAuth.status).toBe(401);

    const missing = await request(app)
      .get(`/api/admin/payments/${randomUUID()}/screenshot`)
      .set(auth('admin'));
    expect(missing.status).toBe(404);

    const none = await request(app)
      .get(`/api/admin/payments/${pPending.id}/screenshot`)
      .set(auth('admin'));
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual({ screenshotUrl: null });

    const badParams = await request(app)
      .get('/api/admin/payments/not-a-uuid/screenshot')
      .set(auth('admin'));
    expect(badParams.status).toBe(422);

    const okRes = await request(app)
      .get(`/api/admin/payments/${pSubmitted1.id}/screenshot`)
      .set(auth('admin'));
    expect(okRes.status).toBe(200);
    const url = okRes.body.data.screenshotUrl as string;
    expect(url).toContain('techservice-hub/payments/');
    expect(url).toContain('blob.stage6.test');
    expect(url).not.toContain(TOKEN);

    // The namespace guard: a stored id outside the payments folder is refused.
    const badNs = await request(app)
      .get(`/api/admin/payments/${pBadNamespace.id}/screenshot`)
      .set(auth('admin'));
    expect(badNs.status).toBe(400);
  });

  // ─── Queue-side review regression (Stage 3 endpoint unchanged) ──

  it('verify credits the order and the queue reflects the new state', async () => {
    const review = await request(app)
      .patch(`/api/admin/payments/${pSubmitted1.id}`)
      .set(auth('admin'))
      .send({ decision: 'VERIFIED' });
    expect(review.status).toBe(200);
    expect(review.body.data).toEqual({ id: pSubmitted1.id, status: 'VERIFIED' });

    const q = await queue(`?status=VERIFIED&search=${pSubmitted1.id}`);
    const row = q.items.find((p) => p.id === pSubmitted1.id)!;
    expect(row.status).toBe('VERIFIED');
    expect(row.verifiedByName).toBe('Stage 6 Admin');
    expect(row.order.outstandingAmount).toBe('0.00'); // 1000 − 1000 verified
  });

  it('a second review of the same payment conflicts without side effects', async () => {
    const again = await request(app)
      .patch(`/api/admin/payments/${pSubmitted1.id}`)
      .set(auth('admin2'))
      .send({ decision: 'REJECTED', note: 'Trying to flip it after verification' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_NOT_REVIEWABLE');
  });
});
