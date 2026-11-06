import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/**
 * Private-download security suite (real PostgreSQL). Proves that presigned
 * download URLs for PRIVATE blobs are minted ONLY for authorized callers:
 *
 *   - unauthenticated requests → 401 on every file-bearing endpoint
 *   - non-admin callers → 403 on admin-only URL minting
 *     (order attachments, deliverables, payment screenshots)
 *   - non-owner callers → 404 on another customer's order (existence hidden)
 *   - a caller can never register a pathname outside their own namespace → 400
 *   - the minted URL is short-lived, path-scoped, and never carries the
 *     read-write token
 *
 * SKIPPED unless TEST_DATABASE_URL points at a disposable LOCAL database
 * (same contract as the other integration suites — production credentials
 * must never appear in TEST_DATABASE_URL).
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.RUN_ID = run;
  // Blob storage "configured"; the SDK is mocked below — no network.
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_security_test';
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer sec-(owner|other|admin)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.RUN_ID ?? '';
    return {
      uid: `sec-${who}-${runId}`,
      name: who,
      email: `sec-${who}-${runId}@security.test`,
      email_verified: true,
      sub: `sec-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'security-test',
    } as never;
  },
}));

// Blob SDK mock: head() confirms existence for registration, presigning
// returns a deterministic, path-scoped URL so assertions can prove scoping.
vi.mock('@vercel/blob', () => ({
  head: vi.fn().mockResolvedValue({ size: 4096, contentType: 'application/pdf' }),
  issueSignedToken: vi
    .fn()
    .mockResolvedValue({ delegationToken: 'd', clientSigningToken: 'c', validUntil: Date.now() + 60_000 }),
  presignUrl: vi.fn().mockImplementation((_t: unknown, opts: { pathname: string }) =>
    Promise.resolve({ presignedUrl: `https://blob.security.test/${opts.pathname}?sig=fake&exp=300` }),
  ),
  del: vi.fn(),
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'owner' | 'other' | 'admin') => ({
  Authorization: `Bearer sec-${who}-token`,
});
const uuid = () => randomUUID();

d('Private Blob download security (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let order: any;
  let owner: { id: string };
  let other: { id: string };
  let adminUser: { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let attachment: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deliverable: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payment: any;

  const attachmentPath = () => `techservice-hub/requirements/${owner.id}/${uuid()}.pdf`;

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const [ownerUser, otherUser, adminRow] = await Promise.all([
      prisma.user.create({
        data: { firebaseUid: `sec-owner-${run}`, email: `sec-owner-${run}@security.test`, fullName: 'Sec Owner', role: 'CUSTOMER' },
      }),
      prisma.user.create({
        data: { firebaseUid: `sec-other-${run}`, email: `sec-other-${run}@security.test`, fullName: 'Sec Other', role: 'CUSTOMER' },
      }),
      prisma.user.create({
        data: { firebaseUid: `sec-admin-${run}`, email: `sec-admin-${run}@security.test`, fullName: 'Sec Admin', role: 'ADMIN' },
      }),
    ]);
    owner = ownerUser;
    other = otherUser;
    adminUser = adminRow;

    order = await prisma.order.create({
      data: {
        orderNumber: `SEC-${run}-${uuid().slice(0, 8).toUpperCase()}`,
        customerId: owner.id,
        status: 'SUBMITTED',
        title: 'Blob security fixture',
        deadline: new Date(Date.now() + 7 * 86400000),
        totalAmount: '500.00',
        idempotencyKey: uuid(),
        attachments: {
          create: {
            uploadedById: owner.id,
            kind: 'REQUIREMENT',
            blobPath: attachmentPath(),
            fileName: 'requirements.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4096,
          },
        },
        deliverables: {
          create: {
            uploadedById: adminUser.id,
            title: 'Sec deliverable',
            blobPath: `techservice-hub/deliveries/${adminUser.id}/${uuid()}.pdf`,
            fileName: 'delivery.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4096,
          },
        },
        payments: {
          create: {
            method: 'BKASH',
            status: 'SUBMITTED',
            amount: '500.00',
            transactionId: `SEC-${run.slice(0, 6)}`,
            transactionIdNormalized: `SEC-${run.slice(0, 6)}`,
            blobPath: `techservice-hub/payments/${owner.id}/${uuid()}.png`,
          },
        },
      },
      include: { attachments: true, deliverables: true, payments: true },
    });
    attachment = order.attachments[0];
    deliverable = order.deliverables[0];
    payment = order.payments[0];
  });

  afterAll(async () => {
    if (!prisma) return;
    const emails = { email: { endsWith: '@security.test' } };
    const users = await prisma.user.findMany({ where: emails, select: { id: true } });
    const ids = users.map((u: { id: string }) => u.id);
    if (ids.length === 0) return;
    await prisma.payment.deleteMany({ where: { order: { customerId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it('401 — unauthenticated callers never receive order/file data or URLs', async () => {
    const anonOrder = await request(app).get(`/api/orders/${order.id}`);
    expect(anonOrder.status).toBe(401);
    expect(JSON.stringify(anonOrder.body)).not.toContain('downloadUrl');

    const anonAdmin = await request(app).get(`/api/admin/orders/${order.id}`);
    expect(anonAdmin.status).toBe(401);

    const anonScreenshot = await request(app).get(`/api/admin/payments/${payment.id}/screenshot`);
    expect(anonScreenshot.status).toBe(401);

    const anonRegister = await request(app)
      .post(`/api/orders/${order.id}/attachments`)
      .send({ pathname: attachmentPath(), fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 4096 });
    expect(anonRegister.status).toBe(401);
  });

  it('403 — non-admin callers never receive admin-minted download URLs', async () => {
    const asCustomer = await request(app).get(`/api/admin/orders/${order.id}`).set(auth('owner'));
    expect(asCustomer.status).toBe(403);
    expect(JSON.stringify(asCustomer.body)).not.toContain('downloadUrl');

    const screenshot = await request(app).get(`/api/admin/payments/${payment.id}/screenshot`).set(auth('owner'));
    expect(screenshot.status).toBe(403);
    expect(JSON.stringify(screenshot.body)).not.toContain('screenshotUrl');

    const deliverableUpload = await request(app)
      .post(`/api/admin/orders/${order.id}/deliverables`)
      .set(auth('owner'))
      .send({ title: 'Nope', pathname: `techservice-hub/deliveries/${owner.id}/${uuid()}.pdf`, fileName: 'n.pdf', mimeType: 'application/pdf', sizeBytes: 4096 });
    expect(deliverableUpload.status).toBe(403);
  });

  it('404 — another customer cannot read (or get URLs for) a foreign order', async () => {
    const foreign = await request(app).get(`/api/orders/${order.id}`).set(auth('other'));
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain('downloadUrl');
  });

  it('400 — a caller cannot register a pathname outside their own namespace', async () => {
    const foreignPath = `techservice-hub/requirements/${other.id}/${uuid()}.pdf`;
    const res = await request(app)
      .post(`/api/orders/${order.id}/attachments`)
      .set(auth('owner'))
      .send({ pathname: foreignPath, fileName: 'stolen.pdf', mimeType: 'application/pdf', sizeBytes: 4096 });
    expect(res.status).toBe(400);

    const foreignPayments = `techservice-hub/payments/${other.id}/${uuid()}.png`;
    const adminRes = await request(app)
      .post(`/api/admin/orders/${order.id}/deliverables`)
      .set(auth('admin'))
      .send({ title: 'Foreign', pathname: foreignPayments, fileName: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 4096 });
    expect(adminRes.status).toBe(400);
  });

  it('owner + admin receive presigned URLs scoped to the exact private pathname', async () => {
    const ownerDetail = await request(app).get(`/api/orders/${order.id}`).set(auth('owner'));
    expect(ownerDetail.status).toBe(200);
    const att = ownerDetail.body.data.attachments.find((a: { id: string }) => a.id === attachment.id);
    const dlv = ownerDetail.body.data.deliverables.find((x: { id: string }) => x.id === deliverable.id);
    expect(att.downloadUrl).toBe(`https://blob.security.test/${attachment.blobPath}?sig=fake&exp=300`);
    expect(dlv.downloadUrl).toBe(`https://blob.security.test/${order.deliverables[0].blobPath}?sig=fake&exp=300`);

    const adminDetail = await request(app).get(`/api/admin/orders/${order.id}`).set(auth('admin'));
    expect(adminDetail.status).toBe(200);
    const adminAtt = adminDetail.body.data.attachments.find((a: { id: string }) => a.id === attachment.id);
    expect(adminAtt.downloadUrl).toContain(attachment.blobPath);

    const screenshot = await request(app).get(`/api/admin/payments/${payment.id}/screenshot`).set(auth('admin'));
    expect(screenshot.status).toBe(200);
    expect(screenshot.body.data.screenshotUrl).toContain(order.payments[0].blobPath);
    // The read-write token must never be embedded in any minted URL.
    expect(JSON.stringify(screenshot.body)).not.toContain('vercel_blob_rw_security_test');
  });
});
