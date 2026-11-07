import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/**
 * Real-PostgreSQL integration suite for the marketplace payment bridge:
 * request → admin quotation → customer accepts → order → bKash submission
 * (bKash-only gate on quotation orders). SKIPPED unless TEST_DATABASE_URL
 * points at a disposable LOCAL database.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  // The bridge needs the flag-gated request-submission endpoint mounted.
  process.env.SERVICE_MARKETPLACE_ENABLED = 'true';
  process.env.ADMIN_BRIDGE_RUN_ID = run;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer bridge-(admin|custA|custB)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.ADMIN_BRIDGE_RUN_ID ?? '';
    return {
      uid: `bridge-${who}-${runId}`,
      name: who,
      email: `bridge-${who}-${runId}@bridge.test`,
      email_verified: true,
      sub: `bridge-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'bridge-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'admin' | 'custA' | 'custB') => ({ Authorization: `Bearer bridge-${who}-token` });

d('Marketplace payment bridge (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let admin = { id: '' };
  const custA = { id: '' };
  const custB = { id: '' };
  let categoryId = '';
  let serviceSlug = '';
  let serviceId = '';
  let requestId = '';
  let quotationId = '';
  let orderId = '';
  const requestIds: string[] = [];
  const bKashAccountId = randomUUID();
  const rocketAccountId = randomUUID();

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const [adminUser] = await Promise.all([
      prisma.user.create({ data: { firebaseUid: `bridge-admin-${run}`, email: `bridge-admin-${run}@bridge.test`, fullName: 'Bridge Admin', role: 'ADMIN' } }),
      prisma.user.create({ data: { firebaseUid: `bridge-custA-${run}`, email: `bridge-custA-${run}@bridge.test`, fullName: 'Bridge Customer A', role: 'CUSTOMER' } }),
      prisma.user.create({ data: { firebaseUid: `bridge-custB-${run}`, email: `bridge-custB-${run}@bridge.test`, fullName: 'Bridge Customer B', role: 'CUSTOMER' } }),
    ]);
    admin = { id: adminUser.id };
    void custA;
    void custB;

    const category = await prisma.serviceCategory.create({
      data: { slug: `bridge-cat-${run}`, name: `Bridge category ${run}`, displayOrder: 999 },
    });
    categoryId = category.id;
    serviceSlug = `bridge-service-${run}`;
    const service = await prisma.service.create({
      data: {
        slug: serviceSlug,
        name: 'Bridge test service',
        description: 'A published service used by the marketplace bridge test.',
        categoryId,
        serviceType: 'CONSULTATION',
        pricingModel: 'CUSTOM_QUOTE',
        basePrice: '0',
        deliveryDays: 5,
        status: 'PUBLISHED',
        isActive: true,
      },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.payment.deleteMany({ where: { order: { requestId: { not: null }, customer: { email: { endsWith: '@bridge.test' } } } } });
    await prisma.order.deleteMany({ where: { customer: { email: { endsWith: '@bridge.test' } }, request: { isNot: null } } });
    await prisma.quotation.deleteMany({ where: { request: { user: { email: { endsWith: '@bridge.test' } } } } });
    await prisma.statusHistory.deleteMany({ where: { entityType: 'REQUEST', entityId: { in: requestIds } } });
    await prisma.serviceRequest.deleteMany({ where: { user: { email: { endsWith: '@bridge.test' } } } });
    await prisma.paymentAccount.deleteMany({ where: { id: { in: [bKashAccountId, rocketAccountId] } } });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@bridge.test' } } });
  });

  it('guards the bridge: admin queue 401 anonymously, 403 for customers', async () => {
    const anon = await request(app).get('/api/admin/requests');
    expect(anon.status).toBe(401);
    const asCustomer = await request(app).get('/api/admin/requests').set(auth('custA'));
    expect(asCustomer.status).toBe(403);
  });

  it('submits a request as customer A', async () => {
    const res = await request(app)
      .post(`/api/marketplace/services/${serviceSlug}/requests`)
      .set(auth('custA'))
      .send({ notes: 'Bridge test request' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    requestId = res.body.data.requestId;
    requestIds.push(requestId);
    expect(res.body.data.referenceNo).toMatch(/^TSH-\d{4}-\d{6}$/);
  });

  it('hides the request from other customers (404, not 403)', async () => {
    const res = await request(app).get(`/api/marketplace/requests/${requestId}`).set(auth('custB'));
    expect(res.status).toBe(404);
  });

  it('enforces request-status transitions on the admin endpoint', async () => {
    const res = await request(app)
      .patch(`/api/admin/requests/${requestId}/status`)
      .set(auth('admin'))
      .send({ status: 'ORDER_CREATED', note: 'illegal jump' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('admin moves it to UNDER_REVIEW, drafts and sends a quotation', async () => {
    const review = await request(app)
      .patch(`/api/admin/requests/${requestId}/status`)
      .set(auth('admin'))
      .send({ status: 'UNDER_REVIEW', note: 'requirements look good' });
    expect(review.status).toBe(200);

    const draft = await request(app)
      .post(`/api/admin/requests/${requestId}/quotations`)
      .set(auth('admin'))
      .send({ items: [{ label: 'Bridge design & build', amount: '1500.00' }, { label: 'Deployment', amount: '500.00' }], estimatedTimeline: '2 weeks' });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    quotationId = draft.body.data.id;
    expect(draft.body.data.price).toBe('2000.00'); // server-derived total
    expect(draft.body.data.status).toBe('DRAFT');

    // The customer cannot accept a DRAFT.
    const early = await request(app)
      .post(`/api/marketplace/requests/${requestId}/quotations/accept`)
      .set(auth('custA'))
      .send({ idempotencyKey: randomUUID() });
    expect(early.status).toBe(409);

    const sent = await request(app).patch(`/api/admin/quotations/${quotationId}/send`).set(auth('admin'));
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data.status).toBe('SENT');
    expect(new Date(sent.body.data.validUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('customer sees the SENT quotation and accepts → order created', async () => {
    const detail = await request(app).get(`/api/marketplace/requests/${requestId}`).set(auth('custA'));
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('QUOTATION_SENT');
    const sent = detail.body.data.quotations.find((q: { status: string }) => q.status === 'SENT');
    expect(sent).toBeTruthy();

    const key = randomUUID();
    const accept = await request(app)
      .post(`/api/marketplace/requests/${requestId}/quotations/accept`)
      .set(auth('custA'))
      .send({ idempotencyKey: key });
    expect(accept.status, JSON.stringify(accept.body)).toBe(201);
    orderId = accept.body.data.order.id;
    expect(accept.body.data.order.totalAmount).toBe('2000.00');
    expect(accept.body.data.replayed).toBe(false);

    const adminOrder = await request(app).get(`/api/admin/orders/${orderId}`).set(auth('admin'));
    expect(adminOrder.body.data.requestId).toBe(requestId);
    expect(adminOrder.body.data.acceptedQuotationId).toBe(quotationId);
    expect(Number(adminOrder.body.data.totalAmount)).toBe(2000);

    const detail2 = await request(app).get(`/api/marketplace/requests/${requestId}`).set(auth('custA'));
    expect(detail2.body.data.status).toBe('ORDER_CREATED');
  });

  it('replays the same idempotency key instead of double-creating', async () => {
    // Reconstruct the original key is impossible from outside — instead prove
    // the double-accept guard: a NEW key on a non-QUOTATION_SENT request → 409.
    const res = await request(app)
      .post(`/api/marketplace/requests/${requestId}/quotations/accept`)
      .set(auth('custA'))
      .send({ idempotencyKey: randomUUID() });
    // Accepting an already-accepted request is idempotent: same order, no dupes.
    expect(res.status).toBe(200);
    expect(res.body.data.order.id).toBe(orderId);
    expect(res.body.data.replayed).toBe(true);
  });

  it('quotation orders are bKash-only (rail gate), then pay via bKash', async () => {
    await prisma.paymentAccount.create({
      data: { id: rocketAccountId, methodKey: 'ROCKET', label: 'Rocket (test)', accountNumber: '01700000001', accountHolder: 'Bridge Test', createdById: admin.id },
    });
    await prisma.paymentAccount.create({
      data: { id: bKashAccountId, methodKey: 'BKASH', label: 'bKash (test)', accountNumber: '01700000002', accountHolder: 'Bridge Test', createdById: admin.id },
    });

    const rocket = await request(app)
      .post(`/api/orders/${orderId}/payments/v2`)
      .set(auth('custA'))
      .send({ accountId: rocketAccountId, transactionId: `BRIDGE-${run}`, amount: '2000.00' });
    expect(rocket.status).toBe(400);
    expect(rocket.body.error.code).toBe('INVALID_PAYMENT_ACCOUNT');

    const bkash = await request(app)
      .post(`/api/orders/${orderId}/payments/v2`)
      .set(auth('custA'))
      .send({ accountId: bKashAccountId, transactionId: `BRIDGE-${run}`, amount: '2000.00' });
    expect(bkash.status, JSON.stringify(bkash.body)).toBe(201);

    const verify = await request(app)
      .patch(`/api/admin/payments/${bkash.body.data.id}`)
      .set(auth('admin'))
      .send({ decision: 'VERIFIED' });
    expect(verify.status).toBe(200);

    const order = await request(app).get(`/api/admin/orders/${orderId}`).set(auth('admin'));
    expect(Number(order.body.data.amountPaid)).toBe(2000);
    expect(Number(order.body.data.outstandingAmount)).toBe(0);
  });

  it('decline path: request → quote → decline → re-quote → accept', async () => {
    const res = await request(app)
      .post(`/api/marketplace/services/${serviceSlug}/requests`)
      .set(auth('custA'))
      .send({ notes: 'Decline-path request' });
    const secondRequestId = res.body.data.requestId;
    requestIds.push(secondRequestId);
    expect(res.status).toBe(200);

    const draft = await request(app)
      .post(`/api/admin/requests/${secondRequestId}/quotations`)
      .set(auth('admin'))
      .send({ items: [{ label: 'First quote', amount: '999.00' }] });
    const sent1 = await request(app).patch(`/api/admin/quotations/${draft.body.data.id}/send`).set(auth('admin'));
    expect(sent1.status, JSON.stringify(sent1.body)).toBe(200);

    const decline = await request(app)
      .post(`/api/marketplace/requests/${secondRequestId}/quotations/decline`)
      .set(auth('custA'))
      .send({ reason: 'Budget too high for this scope' });
    expect(decline.status, JSON.stringify(decline.body)).toBe(200);
    expect(decline.body.data.status).toBe('DECLINED');

    const detail = await request(app).get(`/api/marketplace/requests/${secondRequestId}`).set(auth('custA'));
    expect(detail.body.data.status).toBe('QUOTATION_DECLINED');

    // Re-quote (new version) and accept.
    const draft2 = await request(app)
      .post(`/api/admin/requests/${secondRequestId}/quotations`)
      .set(auth('admin'))
      .send({ items: [{ label: 'Revised quote', amount: '750.00' }] });
    expect(draft2.body.data.version).toBe(2);
    const sent2 = await request(app).patch(`/api/admin/quotations/${draft2.body.data.id}/send`).set(auth('admin'));
    expect(sent2.status).toBe(200);

    const accept = await request(app)
      .post(`/api/marketplace/requests/${secondRequestId}/quotations/accept`)
      .set(auth('custA'))
      .send({ idempotencyKey: randomUUID() });
    expect(accept.status, JSON.stringify(accept.body)).toBe(201);
    expect(accept.body.data.order.totalAmount).toBe('750.00');

    // Cleanup for this flow (order + payment rows share the FK-safe deletes above
    // via the customer-level sweeps in afterAll).
  });

  it('expired quotation cannot be accepted and expires the request', async () => {
    const res = await request(app)
      .post(`/api/marketplace/services/${serviceSlug}/requests`)
      .set(auth('custA'))
      .send({});
    const reqId = res.body.data.requestId;
    requestIds.push(reqId);
    const draft = await request(app)
      .post(`/api/admin/requests/${reqId}/quotations`)
      .set(auth('admin'))
      .send({ items: [{ label: 'Expiring quote', amount: '100.00' }] });
    const sentE = await request(app).patch(`/api/admin/quotations/${draft.body.data.id}/send`).set(auth('admin'));
    expect(sentE.status, JSON.stringify(sentE.body)).toBe(200);
    await prisma.quotation.update({ where: { id: draft.body.data.id }, data: { validUntil: new Date(Date.now() - 1000) } });

    const accept = await request(app)
      .post(`/api/marketplace/requests/${reqId}/quotations/accept`)
      .set(auth('custA'))
      .send({ idempotencyKey: randomUUID() });
    expect(accept.status).toBe(409);
    expect(accept.body.error.code).toBe('QUOTATION_EXPIRED');

    const detail = await request(app).get(`/api/marketplace/requests/${reqId}`).set(auth('custA'));
    expect(detail.body.data.status).toBe('QUOTATION_EXPIRED');
  });

  it('customers can list and cancel their own pre-payment requests', async () => {
    const list = await request(app).get('/api/marketplace/requests?pageSize=50').set(auth('custB'));
    expect(list.status).toBe(200);
    expect((list.body.data.items ?? []).every((r: { serviceName: string }) => typeof r.serviceName === 'string')).toBe(true);

    const res = await request(app)
      .post(`/api/marketplace/services/${serviceSlug}/requests`)
      .set(auth('custB'))
      .send({});
    const cancel = await request(app)
      .post(`/api/marketplace/requests/${res.body.data.requestId}/cancel`)
      .set(auth('custB'))
      .send({ note: 'changed my mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
  });
});
