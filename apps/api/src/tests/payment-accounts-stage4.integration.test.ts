import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { AdminPaymentAccountDto } from '@tsh/shared';

/**
 * Real-PostgreSQL integration suite for Stage 4 — admin payment-account
 * management. SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL
 * database:
 *
 *   createdb tsh_stage4_payment_accounts_test
 *   cd apps/api
 *   DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage4_payment_accounts_test \
 *   DIRECT_URL=...  npx prisma migrate deploy      # scratch DB only, NEVER production
 *   TEST_DATABASE_URL=postgresql://<you>@localhost:5432/tsh_stage4_payment_accounts_test \
 *     npm test -w @tsh/api
 *
 * Production credentials must never appear in TEST_DATABASE_URL.
 *
 * Cloudinary is stubbed with fake credentials: signing/ownership logic is
 * exercised without any network upload. No real Cloudinary environment is
 * contacted by this suite.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);
const CLOUD_SECRET = `stage4-cloud-secret-${run}`;

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.STAGE4_RUN_ID = run;
  process.env.CLOUDINARY_CLOUD_NAME = 'stage4-test-cloud';
  process.env.CLOUDINARY_API_KEY = 'stage4-test-key';
  process.env.CLOUDINARY_API_SECRET = CLOUD_SECRET;
  // Never send real email from an integration test.
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer stage4-(admin|admin2|customer|other)-token$/.exec(
      req.headers.authorization ?? '',
    );
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.STAGE4_RUN_ID ?? '';
    return {
      uid: `stage4-${who}-${runId}`,
      name: who,
      email: `stage4-${who}-${runId}@stage4.test`,
      email_verified: true,
      sub: `stage4-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'stage4-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'admin' | 'admin2' | 'customer' | 'other') => ({
  Authorization: `Bearer stage4-${who}-token`,
});
const uuid = () => randomUUID();
const qrNamespace = (adminId: string, asset: string) =>
  `techservice-hub/payment-accounts/${adminId}/${asset}`;

d('Stage 4 — admin payment accounts (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let admin: { id: string };
  let admin2: { id: string };
  let customer: { id: string };
  let accountSeq = 0;

  const baseCreate = () => ({
    methodKey: 'BKASH',
    label: `STAGE4-${run}-acct-${++accountSeq}`,
    accountNumber: '01712345678',
    accountHolder: 'Stage 4 Holder',
  });

  async function adminCreate(overrides: Record<string, unknown> = {}) {
    const payload = { ...baseCreate(), ...overrides };
    const res = await request(app).post('/api/admin/payment-accounts').set(auth('admin')).send(payload);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as AdminPaymentAccountDto;
  }

  async function createOrder(customerId = customer.id) {
    return prisma.order.create({
      data: {
        orderNumber: `STAGE4-${run}-${uuid().slice(0, 8).toUpperCase()}`,
        customerId,
        status: 'SUBMITTED',
        title: 'Stage 4 payment fixture',
        deadline: new Date(Date.now() + 7 * 86400000),
        totalAmount: '1000.00',
        idempotencyKey: uuid(),
      },
    });
  }

  function submitV2(orderId: string, accountId: string, amount = '1000.00') {
    return request(app)
      .post(`/api/orders/${orderId}/payments/v2`)
      .set(auth('customer'))
      .send({ accountId, transactionId: `TRX-${uuid().slice(0, 12)}`, amount });
  }

  async function customerAccountLabels() {
    const res = await request(app).get('/api/payment-accounts').set(auth('customer'));
    expect(res.status).toBe(200);
    return (res.body.data.items as Array<{ label: string; qrUrl?: string | null }>).filter((item) =>
      item.label.startsWith(`STAGE4-${run}-`),
    );
  }

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const [adminUser, admin2User, customerUser] = await Promise.all([
      prisma.user.create({
        data: {
          firebaseUid: `stage4-admin-${run}`,
          email: `stage4-admin-${run}@stage4.test`,
          fullName: 'Stage 4 Admin',
          role: 'ADMIN',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `stage4-admin2-${run}`,
          email: `stage4-admin2-${run}@stage4.test`,
          fullName: 'Stage 4 Admin Two',
          role: 'ADMIN',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `stage4-customer-${run}`,
          email: `stage4-customer-${run}@stage4.test`,
          fullName: 'Stage 4 Customer',
          role: 'CUSTOMER',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `stage4-other-${run}`,
          email: `stage4-other-${run}@stage4.test`,
          fullName: 'Stage 4 Other',
          role: 'CUSTOMER',
        },
      }),
    ]);
    admin = { id: adminUser.id };
    admin2 = { id: admin2User.id };
    customer = { id: customerUser.id };
  });

  afterAll(async () => {
    if (!prisma) return;
    // FK-safe teardown, tolerant of a previous failed run against the same
    // disposable database: every stage4 user's orders/payments first, then
    // stage4 accounts, audit rows and users.
    const stage4Users = await prisma.user.findMany({
      where: { email: { endsWith: '@stage4.test' } },
      select: { id: true },
    });
    const stage4UserIds = stage4Users.map((u: { id: string }) => u.id);
    if (stage4UserIds.length > 0) {
      await prisma.order.deleteMany({ where: { customerId: { in: stage4UserIds } } });
    }
    await prisma.paymentAccount.deleteMany({ where: { label: { startsWith: 'STAGE4-' } } });
    if (stage4UserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: stage4UserIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { endsWith: '@stage4.test' } } });
    await prisma.$disconnect();
  });

  // ─── Test 1 — Admin list ────────────────────────────────────

  it('lets an admin list active and inactive accounts but blocks customers', async () => {
    const inactive = await adminCreate({ label: `STAGE4-${run}-list-inactive`, isActive: false });
    const active = await adminCreate({ label: `STAGE4-${run}-list-active`, isActive: true });

    const res = await request(app).get('/api/admin/payment-accounts').set(auth('admin'));
    expect(res.status).toBe(200);
    const labels = (res.body.data.items as Array<{ label: string }>).map((a) => a.label);
    expect(labels).toContain(inactive.label);
    expect(labels).toContain(active.label);

    const customerRes = await request(app).get('/api/admin/payment-accounts').set(auth('customer'));
    expect(customerRes.status).toBe(403);
    expect(customerRes.body.error.code).toBe('FORBIDDEN');

    const anon = await request(app).get('/api/admin/payment-accounts');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
  });

  // ─── Test 2 — Create ────────────────────────────────────────

  it('creates an account with server-derived creator/updater and ignores forged audit ids', async () => {
    const res = await request(app)
      .post('/api/admin/payment-accounts')
      .set(auth('admin'))
      .send({
        ...baseCreate(),
        label: `STAGE4-${run}-create`,
        displayOrder: 42,
        createdById: admin2.id,
        updatedById: admin2.id,
        role: 'SUPERADMIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.createdById).toBe(admin.id);
    expect(res.body.data.updatedById).toBe(admin.id);
    expect(res.body.data.displayOrder).toBe(42);
    expect(res.body.data).not.toHaveProperty('qrPublicId');

    const row = await prisma.paymentAccount.findUnique({ where: { id: res.body.data.id } });
    expect(row.createdById).toBe(admin.id);
    expect(row.updatedById).toBe(admin.id);

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_ACCOUNT.CREATE', entityId: row.id },
    });
    expect(auditRow.actorId).toBe(admin.id);

    const invalid = await request(app)
      .post('/api/admin/payment-accounts')
      .set(auth('admin'))
      .send({ methodKey: 'bkash', label: 'x', accountNumber: '1', accountHolder: 'y' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const customerCreate = await request(app)
      .post('/api/admin/payment-accounts')
      .set(auth('customer'))
      .send(baseCreate());
    expect(customerCreate.status).toBe(403);
  });

  it('appends a display order when the client omits it', async () => {
    const first = await adminCreate({ displayOrder: 500 });
    const maxBefore = await prisma.paymentAccount.aggregate({ _max: { displayOrder: true } });
    const appended = await adminCreate();
    expect(appended.displayOrder).toBe((maxBefore._max.displayOrder ?? -1) + 1);
    expect(first.displayOrder).toBe(500);
  });

  // ─── Test 3 — Update ────────────────────────────────────────

  it('updates an account with the authenticated admin and preserves payment snapshots', async () => {
    const account = await adminCreate({
      label: `STAGE4-${run}-snapshot`,
      methodKey: 'NAGAD',
      accountType: 'Merchant',
      instructions: 'Original instructions',
      accountNumber: '01911111111',
      accountHolder: 'Original Holder',
    });

    const order = await createOrder();
    const submitted = await submitV2(order.id, account.id);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    const paymentId = submitted.body.data.id as string;

    const before = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(before.methodLabelSnapshot).toBe(`STAGE4-${run}-snapshot`);
    expect(before.accountNumberSnapshot).toBe('01911111111');

    const update = await request(app)
      .patch(`/api/admin/payment-accounts/${account.id}`)
      .set(auth('admin'))
      .send({
        label: `STAGE4-${run}-snapshot-renamed`,
        accountNumber: '01922222222',
        accountHolder: 'New Holder',
        instructions: 'New instructions',
        accountType: 'Personal',
        updatedById: admin2.id,
      });
    expect(update.status).toBe(200);
    expect(update.body.data.label).toBe(`STAGE4-${run}-snapshot-renamed`);
    expect(update.body.data.updatedById).toBe(admin.id);

    const live = await prisma.paymentAccount.findUnique({ where: { id: account.id } });
    expect(live.updatedById).toBe(admin.id);
    expect(live.accountNumber).toBe('01922222222');

    const after = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(after.methodKeySnapshot).toBe(before.methodKeySnapshot);
    expect(after.methodLabelSnapshot).toBe(`STAGE4-${run}-snapshot`);
    expect(after.accountTypeSnapshot).toBe('Merchant');
    expect(after.accountNumberSnapshot).toBe('01911111111');
    expect(after.accountHolderSnapshot).toBe('Original Holder');
    expect(after.instructionsSnapshot).toBe('Original instructions');
    expect(after.paymentAccountId).toBe(account.id);
    expect(after.amount.toFixed(2)).toBe('1000.00');

    const auditUpdate = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_ACCOUNT.UPDATE', entityId: account.id },
    });
    expect(auditUpdate.actorId).toBe(admin.id);

    const missing = await request(app)
      .patch(`/api/admin/payment-accounts/${uuid()}`)
      .set(auth('admin'))
      .send({ label: 'Nope' });
    expect(missing.status).toBe(404);

    const badUuid = await request(app)
      .patch('/api/admin/payment-accounts/not-a-uuid')
      .set(auth('admin'))
      .send({ label: 'Nope' });
    expect(badUuid.status).toBe(422);
  });

  // ─── Test 4 — Activate / deactivate ─────────────────────────

  it('hides deactivated accounts from customers and restores them on activation', async () => {
    const account = await adminCreate({ label: `STAGE4-${run}-toggle` });

    let customerLabels = (await customerAccountLabels()).map((a) => a.label);
    expect(customerLabels).toContain(account.label);

    const off = await request(app)
      .patch(`/api/admin/payment-accounts/${account.id}/status`)
      .set(auth('admin'))
      .send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);

    customerLabels = (await customerAccountLabels()).map((a) => a.label);
    expect(customerLabels).not.toContain(account.label);

    const on = await request(app)
      .patch(`/api/admin/payment-accounts/${account.id}/status`)
      .set(auth('admin2'))
      .send({ isActive: true });
    expect(on.status).toBe(200);
    expect(on.body.data.isActive).toBe(true);
    expect(on.body.data.updatedById).toBe(admin2.id);

    customerLabels = (await customerAccountLabels()).map((a) => a.label);
    expect(customerLabels).toContain(account.label);

    const actions = await prisma.auditLog.findMany({
      where: {
        entityId: account.id,
        action: { in: ['PAYMENT_ACCOUNT.ACTIVATE', 'PAYMENT_ACCOUNT.DEACTIVATE'] },
      },
    });
    expect(actions.map((a: { action: string }) => a.action).sort()).toEqual([
      'PAYMENT_ACCOUNT.ACTIVATE',
      'PAYMENT_ACCOUNT.DEACTIVATE',
    ]);
  });

  // ─── Test 5 — Delete protection ─────────────────────────────

  it('refuses to delete referenced accounts and deletes only unused ones', async () => {
    const account = await adminCreate({ label: `STAGE4-${run}-delete-referenced` });
    const order = await createOrder();
    const submitted = await submitV2(order.id, account.id);
    expect(submitted.status).toBe(201);
    const paymentId = submitted.body.data.id as string;

    const refused = await request(app)
      .delete(`/api/admin/payment-accounts/${account.id}`)
      .set(auth('admin'));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ACCOUNT_IN_USE');

    const stillThere = await prisma.paymentAccount.findUnique({ where: { id: account.id } });
    expect(stillThere).not.toBeNull();
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment.paymentAccountId).toBe(account.id);

    // Deactivation remains the supported off-switch.
    const deactivated = await request(app)
      .patch(`/api/admin/payment-accounts/${account.id}/status`)
      .set(auth('admin'))
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);

    const unused = await adminCreate({ label: `STAGE4-${run}-delete-unused` });
    const deleted = await request(app)
      .delete(`/api/admin/payment-accounts/${unused.id}`)
      .set(auth('admin'));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ id: unused.id, deleted: true });
    expect(await prisma.paymentAccount.findUnique({ where: { id: unused.id } })).toBeNull();

    const auditDelete = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_ACCOUNT.DELETE', entityId: unused.id },
    });
    expect(auditDelete.actorId).toBe(admin.id);

    const customerDelete = await request(app)
      .delete(`/api/admin/payment-accounts/${unused.id}`)
      .set(auth('customer'));
    expect(customerDelete.status).toBe(403);
  });

  // ─── Test 6 — Reordering ────────────────────────────────────

  it('applies display order transactionally and rejects duplicates/unknown ids', async () => {
    const a = await adminCreate({ label: `STAGE4-${run}-reorder-a`, displayOrder: 900 });
    const b = await adminCreate({ label: `STAGE4-${run}-reorder-b`, displayOrder: 901 });
    const c = await adminCreate({ label: `STAGE4-${run}-reorder-c`, displayOrder: 902 });

    const saved = await request(app)
      .patch('/api/admin/payment-accounts/reorder')
      .set(auth('admin'))
      .send({
        items: [
          { id: c.id, displayOrder: 10 },
          { id: a.id, displayOrder: 11 },
          { id: b.id, displayOrder: 12 },
        ],
      });
    expect(saved.status).toBe(200);

    const rows = await prisma.paymentAccount.findMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      orderBy: { displayOrder: 'asc' },
    });
    expect(rows.map((r: { id: string }) => r.id)).toEqual([c.id, a.id, b.id]);
    expect(rows.map((r: { displayOrder: number }) => r.displayOrder)).toEqual([10, 11, 12]);

    const adminList = await request(app).get('/api/admin/payment-accounts').set(auth('admin'));
    const reorderedLabels = (adminList.body.data.items as Array<{ id: string; label: string }>)
      .filter((item) => [a.id, b.id, c.id].includes(item.id))
      .map((item) => item.label);
    expect(reorderedLabels).toEqual([
      `STAGE4-${run}-reorder-c`,
      `STAGE4-${run}-reorder-a`,
      `STAGE4-${run}-reorder-b`,
    ]);

    const duplicateIds = await request(app)
      .patch('/api/admin/payment-accounts/reorder')
      .set(auth('admin'))
      .send({
        items: [
          { id: a.id, displayOrder: 0 },
          { id: a.id, displayOrder: 1 },
        ],
      });
    expect(duplicateIds.status).toBe(422);
    expect(duplicateIds.body.error.code).toBe('VALIDATION_ERROR');

    const duplicatePositions = await request(app)
      .patch('/api/admin/payment-accounts/reorder')
      .set(auth('admin'))
      .send({
        items: [
          { id: a.id, displayOrder: 0 },
          { id: b.id, displayOrder: 0 },
        ],
      });
    expect(duplicatePositions.status).toBe(422);

    const unknown = await request(app)
      .patch('/api/admin/payment-accounts/reorder')
      .set(auth('admin'))
      .send({
        items: [
          { id: a.id, displayOrder: 0 },
          { id: uuid(), displayOrder: 1 },
        ],
      });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('BAD_REQUEST');
    expect(unknown.body.error.details.unknownIds).toHaveLength(1);

    const customerReorder = await request(app)
      .patch('/api/admin/payment-accounts/reorder')
      .set(auth('customer'))
      .send({ items: [{ id: a.id, displayOrder: 0 }] });
    expect(customerReorder.status).toBe(403);

    const auditReorder = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_ACCOUNT.REORDER', actorId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditReorder).not.toBeNull();
  });

  // ─── Test 7 — QR security ───────────────────────────────────

  it('enforces admin-only QR signing, namespace ownership and safe removal', async () => {
    const anon = await request(app).post('/api/admin/payment-accounts/qr/sign');
    expect(anon.status).toBe(401);

    const customerSign = await request(app)
      .post('/api/admin/payment-accounts/qr/sign')
      .set(auth('customer'));
    expect(customerSign.status).toBe(403);

    const signed = await request(app)
      .post('/api/admin/payment-accounts/qr/sign')
      .set(auth('admin'));
    expect(signed.status).toBe(200);
    const publicId = signed.body.data.publicId as string;
    expect(publicId).toMatch(
      new RegExp(`^techservice-hub/payment-accounts/${admin.id}/[0-9a-f-]{36}$`),
    );
    expect(JSON.stringify(signed.body)).not.toContain(CLOUD_SECRET);

    const signedByAdmin2 = await request(app)
      .post('/api/admin/payment-accounts/qr/sign')
      .set(auth('admin2'));
    expect(signedByAdmin2.status).toBe(200);
    expect(signedByAdmin2.body.data.publicId).toContain(`/payment-accounts/${admin2.id}/`);

    const withQr = await adminCreate({
      label: `STAGE4-${run}-qr`,
      qrPublicId: publicId,
    });
    expect(withQr).toMatchObject({ hasQr: true });
    expect(String(withQr.qrUrl)).toContain(publicId);
    expect(JSON.stringify(withQr)).not.toContain(CLOUD_SECRET);

    const customerView = await customerAccountLabels();
    const customerQr = customerView.find((item) => item.label === `STAGE4-${run}-qr`);
    expect(customerQr?.qrUrl).toContain(publicId);

    const customerNamespace = `techservice-hub/payments/${admin.id}/${uuid()}`;
    for (const badPublicId of [
      customerNamespace,
      qrNamespace(admin2.id, uuid()),
      `https://evil.example/qr.png`,
      'techservice-hub/payment-accounts/../escape',
    ]) {
      const res = await request(app)
        .post('/api/admin/payment-accounts')
        .set(auth('admin'))
        .send({ ...baseCreate(), qrPublicId: badPublicId });
      expect(res.status, badPublicId).toBe(400);
    }

    // A failed replacement must not clear the existing reference.
    const failedReplace = await request(app)
      .patch(`/api/admin/payment-accounts/${withQr.id}`)
      .set(auth('admin'))
      .send({ qrPublicId: customerNamespace });
    expect(failedReplace.status).toBe(400);
    const afterFailure = await request(app)
      .get(`/api/admin/payment-accounts/${withQr.id}`)
      .set(auth('admin'));
    expect(afterFailure.body.data.hasQr).toBe(true);
    expect(afterFailure.body.data.qrUrl).toContain(publicId);

    const removed = await request(app)
      .patch(`/api/admin/payment-accounts/${withQr.id}`)
      .set(auth('admin'))
      .send({ qrPublicId: null });
    expect(removed.status).toBe(200);
    expect(removed.body.data.hasQr).toBe(false);
    expect(removed.body.data.qrUrl).toBeNull();

    const adminList = await request(app).get('/api/admin/payment-accounts').set(auth('admin'));
    expect(JSON.stringify(adminList.body)).not.toContain(CLOUD_SECRET);
  });

  // ─── Test 8 — Customer endpoint regression ──────────────────

  it('keeps the customer endpoint active-only, deterministic and free of admin metadata', async () => {
    await adminCreate({
      label: `STAGE4-${run}-customer-z`,
      methodKey: 'UPAY',
      displayOrder: 700,
    });
    await adminCreate({
      label: `STAGE4-${run}-customer-a`,
      methodKey: 'ROCKET',
      displayOrder: 699,
    });
    await adminCreate({
      label: `STAGE4-${run}-customer-b`,
      methodKey: 'BANK_TRANSFER',
      displayOrder: 699,
    });
    await adminCreate({
      label: `STAGE4-${run}-customer-off`,
      isActive: false,
      displayOrder: 698,
    });

    const res = await request(app).get('/api/payment-accounts').set(auth('customer'));
    expect(res.status).toBe(200);
    const items = (res.body.data.items as Array<Record<string, unknown>>).filter((item) =>
      String(item.label).startsWith(`STAGE4-${run}-customer-`),
    );

    expect(items.map((item) => item.label)).toEqual([
      `STAGE4-${run}-customer-a`,
      `STAGE4-${run}-customer-b`,
      `STAGE4-${run}-customer-z`,
    ]);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'accountHolder',
          'accountNumber',
          'accountType',
          'id',
          'instructions',
          'label',
          'methodKey',
          'qrUrl',
        ].sort(),
      );
      expect(item.qrUrl).toBeNull();
    }

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('createdById');
    expect(raw).not.toContain('updatedById');
    expect(raw).not.toContain('isActive');
    expect(raw).not.toContain('displayOrder');
    expect(raw).not.toContain('usageCount');
    expect(raw).not.toContain('qrPublicId');
    expect(raw).not.toContain(CLOUD_SECRET);
    expect(items.some((item) => item.label === `STAGE4-${run}-customer-off`)).toBe(false);
  });

  // ─── Test 9 — Payment submission regression ─────────────────

  it('still accepts active-account submissions, rejects inactive accounts and keeps V1 working', async () => {
    const active = await adminCreate({
      label: `STAGE4-${run}-v2-active`,
      methodKey: 'BKASH',
      accountType: 'Merchant',
      instructions: 'Use the reference in the note.',
    });
    const order = await createOrder();
    const ok = await submitV2(order.id, active.id);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.methodKey).toBe('BKASH');

    const payment = await prisma.payment.findUnique({ where: { id: ok.body.data.id } });
    expect(payment.paymentAccountId).toBe(active.id);
    expect(payment.methodLabelSnapshot).toBe(`STAGE4-${run}-v2-active`);
    expect(payment.accountTypeSnapshot).toBe('Merchant');
    expect(payment.accountNumberSnapshot).toBe('01712345678');
    expect(payment.accountHolderSnapshot).toBe('Stage 4 Holder');
    expect(payment.instructionsSnapshot).toBe('Use the reference in the note.');

    await request(app)
      .patch(`/api/admin/payment-accounts/${active.id}/status`)
      .set(auth('admin'))
      .send({ isActive: false });

    const inactiveOrder = await createOrder();
    const rejected = await submitV2(inactiveOrder.id, active.id);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('INVALID_PAYMENT_ACCOUNT');

    // V1 submission contract is untouched.
    const v1Order = await createOrder();
    const v1 = await request(app)
      .post(`/api/orders/${v1Order.id}/payments`)
      .set(auth('customer'))
      .send({ method: 'BKASH', transactionId: `V1-${run}-${uuid().slice(0, 8)}` });
    expect(v1.status).toBe(201);
    expect(v1.body.data).toMatchObject({ method: 'BKASH', status: 'SUBMITTED' });
    expect(Number(v1.body.data.amount)).toBe(1000);
    const v1Payment = await prisma.payment.findUnique({ where: { id: v1.body.data.id } });
    expect(v1Payment.paymentAccountId).toBeNull();
    expect(v1Payment.methodKeySnapshot).toBeNull();
  });

  // ─── Test 10 — Authorization matrix ─────────────────────────

  it('protects every admin route and handles invalid ids safely', async () => {
    const account = await adminCreate({ label: `STAGE4-${run}-auth` });

    const unauthorized = [
      request(app).get('/api/admin/payment-accounts'),
      request(app).post('/api/admin/payment-accounts').send(baseCreate()),
      request(app).patch(`/api/admin/payment-accounts/${account.id}`).send({ label: 'x' }),
      request(app).patch(`/api/admin/payment-accounts/${account.id}/status`).send({ isActive: false }),
      request(app).patch('/api/admin/payment-accounts/reorder').send({ items: [{ id: account.id, displayOrder: 0 }] }),
      request(app).delete(`/api/admin/payment-accounts/${account.id}`),
      request(app).post('/api/admin/payment-accounts/qr/sign'),
    ];
    for (const req of unauthorized) {
      const res = await req;
      expect(res.status).toBe(401);
    }

    const forbidden = [
      request(app).get('/api/admin/payment-accounts').set(auth('customer')),
      request(app).post('/api/admin/payment-accounts').set(auth('customer')).send(baseCreate()),
      request(app).patch(`/api/admin/payment-accounts/${account.id}`).set(auth('customer')).send({ label: 'x' }),
      request(app).patch(`/api/admin/payment-accounts/${account.id}/status`).set(auth('customer')).send({ isActive: false }),
      request(app).patch('/api/admin/payment-accounts/reorder').set(auth('customer')).send({ items: [{ id: account.id, displayOrder: 0 }] }),
      request(app).delete(`/api/admin/payment-accounts/${account.id}`).set(auth('customer')),
      request(app).post('/api/admin/payment-accounts/qr/sign').set(auth('customer')),
    ];
    for (const req of forbidden) {
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }

    for (const [method, path] of [
      ['get', '/api/admin/payment-accounts/not-a-uuid'],
      ['patch', '/api/admin/payment-accounts/not-a-uuid'],
      ['delete', '/api/admin/payment-accounts/not-a-uuid'],
    ] as const) {
      const res =
        method === 'get'
          ? await request(app).get(path).set(auth('admin'))
          : method === 'patch'
            ? await request(app).patch(path).set(auth('admin')).send({ label: 'x' })
            : await request(app).delete(path).set(auth('admin'));
      expect(res.status).toBe(422);
    }

    const noSuchId = uuid();
    const missingGet = await request(app)
      .get(`/api/admin/payment-accounts/${noSuchId}`)
      .set(auth('admin'));
    expect(missingGet.status).toBe(404);
    const missingStatus = await request(app)
      .patch(`/api/admin/payment-accounts/${noSuchId}/status`)
      .set(auth('admin'))
      .send({ isActive: false });
    expect(missingStatus.status).toBe(404);
    const missingDelete = await request(app)
      .delete(`/api/admin/payment-accounts/${noSuchId}`)
      .set(auth('admin'));
    expect(missingDelete.status).toBe(404);
  });
});
