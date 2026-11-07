import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { AdminServiceCategoryDto, AdminServiceDetailDto, Paginated, AdminServiceSummaryDto } from '@tsh/shared';

/**
 * Real-PostgreSQL integration suite for admin service-catalog CRUD. SKIPPED
 * unless TEST_DATABASE_URL points at a disposable LOCAL database (see
 * payment-accounts-stage4.integration.test.ts for the scratch-database flow).
 *
 * Covers: RBAC, create/list/get/update, slug conflicts, publish guards,
 * archive-on-unpublish, delete-vs-archive when carts reference a service.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

if (TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DIRECT_URL = TEST_DATABASE_URL;
  process.env.ADMIN_SERVICES_RUN_ID = run;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

vi.mock('../services/token.service.js', () => ({
  verifyBearerToken: async (req: { headers: Record<string, string | undefined> }) => {
    const match = /^Bearer adminsvc-(admin|customer)-token$/.exec(req.headers.authorization ?? '');
    if (!match) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw ApiError.unauthorized('Missing bearer token');
    }
    const who = match[1]!;
    const runId = process.env.ADMIN_SERVICES_RUN_ID ?? '';
    return {
      uid: `adminsvc-${who}-${runId}`,
      name: who,
      email: `adminsvc-${who}-${runId}@adminsvc.test`,
      email_verified: true,
      sub: `adminsvc-${who}-${runId}`,
      iat: Math.floor(Date.now() / 1000),
      aud: 'adminsvc-test',
    } as never;
  },
}));

const d = TEST_DATABASE_URL ? describe : describe.skip;

const auth = (who: 'admin' | 'customer') => ({ Authorization: `Bearer adminsvc-${who}-token` });

d('Admin service catalog (real PostgreSQL)', () => {
  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let admin: { id: string };
  let customer: { id: string };
  let categoryId: string;
  let categorySlug: string;
  let slugSeq = 0;

  const nextSlug = () => `adminsvc-${run}-${++slugSeq}`;

  function baseCreate(overrides: Record<string, unknown> = {}) {
    return {
      slug: nextSlug(),
      name: `Admin service fixture ${slugSeq}`,
      description: 'A realistic description for the admin CRUD integration test.',
      categoryId,
      serviceType: 'COMMERCIAL_WEB',
      pricingModel: 'FIXED',
      basePrice: '1500.00',
      status: 'DRAFT',
      features: ['Feature one'],
      deliverables: ['Deliverable one'],
      faqs: [{ q: 'How long does it take?', a: 'About one week.' }],
      options: [
        {
          kind: 'PACKAGE',
          label: 'Basic package',
          priceFrom: '1000.00',
          priceTo: '1500.00',
          displayOrder: 0,
        },
      ],
      formFields: [
        { key: 'budget', label: 'Budget', type: 'NUMBER', options: [], required: false, displayOrder: 0 },
      ],
      ...overrides,
    };
  }

  function createService(payload: Record<string, unknown> = {}) {
    return request(app).post('/api/admin/services').set(auth('admin')).send(baseCreate(payload));
  }

  async function createOk(payload: Record<string, unknown> = {}): Promise<AdminServiceDetailDto> {
    const res = await createService(payload);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as AdminServiceDetailDto;
  }

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const prismaModule = await import('../config/prisma.js');
    prisma = prismaModule.prisma;
    app = createApp();

    const [adminUser, customerUser] = await Promise.all([
      prisma.user.create({
        data: {
          firebaseUid: `adminsvc-admin-${run}`,
          email: `adminsvc-admin-${run}@adminsvc.test`,
          fullName: 'Admin Services Admin',
          role: 'ADMIN',
        },
      }),
      prisma.user.create({
        data: {
          firebaseUid: `adminsvc-customer-${run}`,
          email: `adminsvc-customer-${run}@adminsvc.test`,
          fullName: 'Admin Services Customer',
          role: 'CUSTOMER',
        },
      }),
    ]);
    admin = { id: adminUser.id };
    customer = { id: customerUser.id };

    categorySlug = `adminsvc-cat-${run}`;
    const category = await prisma.serviceCategory.create({
      data: {
        slug: categorySlug,
        name: `Admin services category ${run}`,
        // Inactive on purpose: the admin endpoint must still expose it.
        isActive: false,
        displayOrder: 999,
      },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // FK-safe teardown, tolerant of a previous failed run.
    await prisma.cart.deleteMany({ where: { userId: customer.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
    await prisma.service.deleteMany({ where: { categoryId } });
    await prisma.serviceCategory.deleteMany({ where: { slug: categorySlug } });
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@adminsvc.test' } },
    });
  });

  it('protects the catalog: 401 anonymously, 403 for customers', async () => {
    const anonymous = await request(app).get('/api/admin/services');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const asCustomer = await request(app).get('/api/admin/services').set(auth('customer'));
    expect(asCustomer.status).toBe(403);
    expect(asCustomer.body.error.code).toBe('FORBIDDEN');
  });

  it('lists every category including inactive rows', async () => {
    const res = await request(app).get('/api/admin/service-categories').set(auth('admin'));
    expect(res.status).toBe(200);
    const categories = res.body.data as AdminServiceCategoryDto[];
    const mine = categories.find((row) => row.id === categoryId);
    expect(mine).toBeTruthy();
    expect(mine!.isActive).toBe(false);
  });

  it('creates a draft with nested packages and form fields', async () => {
    const service = await createOk();
    expect(service.status).toBe('DRAFT');
    expect(service.slug).toMatch(/^adminsvc-/);
    expect(service.options).toHaveLength(1);
    expect(service.options[0]!.label).toBe('Basic package');
    expect(service.formFields).toHaveLength(1);
    expect(service.formFields[0]!.key).toBe('budget');
    expect(service.usage).toEqual({ orders: 0, carts: 0, requests: 0 });
  });

  it('reads the full editor payload by id', async () => {
    const created = await createOk();
    const res = await request(app).get(`/api/admin/services/${created.id}`).set(auth('admin'));
    expect(res.status).toBe(200);
    const detail = res.body.data as AdminServiceDetailDto;
    expect(detail.id).toBe(created.id);
    expect(detail.features).toEqual(['Feature one']);
    expect(detail.faqs).toHaveLength(1);
    expect(detail.category.id).toBe(categoryId);
  });

  it('rejects a duplicate slug with 409 SERVICE_SLUG_TAKEN', async () => {
    const first = await createOk();
    const res = await createService({ slug: first.slug });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_SLUG_TAKEN');
  });

  it('refuses to create a published fixed-price service without a price', async () => {
    const res = await createService({ status: 'PUBLISHED', basePrice: '0' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates the full payload, including packages, and publishes', async () => {
    const created = await createOk();
    const res = await request(app)
      .put(`/api/admin/services/${created.id}`)
      .set(auth('admin'))
      .send(
        baseCreate({
          slug: created.slug,
          name: 'Updated admin service',
          status: 'PUBLISHED',
          basePrice: '2200.00',
          options: [
            {
              id: created.options[0]!.id,
              kind: 'PACKAGE',
              label: 'Updated package',
              priceFrom: '1800.00',
              priceTo: '2200.00',
              displayOrder: 0,
            },
            { kind: 'ADDON', label: 'Rush delivery', priceFrom: '300.00', displayOrder: 1 },
          ],
          formFields: [
            { key: 'budget', label: 'Budget (BDT)', type: 'NUMBER', options: [], required: true, displayOrder: 0 },
            { key: 'notes', label: 'Notes', type: 'TEXTAREA', options: [], displayOrder: 1 },
          ],
        }),
      );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const detail = res.body.data as AdminServiceDetailDto;
    expect(detail.name).toBe('Updated admin service');
    expect(detail.status).toBe('PUBLISHED');
    expect(detail.options).toHaveLength(2);
    expect(detail.options.find((o) => o.kind === 'ADDON')?.label).toBe('Rush delivery');
    expect(detail.formFields).toHaveLength(2);
    expect(detail.formFields.find((f) => f.key === 'budget')?.required).toBe(true);
  });

  it('blocks publishing a legacy service that has no pricing model', async () => {
    const legacy = await prisma.service.create({
      data: {
        slug: nextSlug(),
        name: 'Legacy service without v2 fields',
        description: 'Legacy row used to prove the publish gate.',
        categoryId,
        basePrice: '500.00',
        deliveryDays: 3,
        status: 'DRAFT',
      },
    });

    const res = await request(app)
      .patch(`/api/admin/services/${legacy.id}/status`)
      .set(auth('admin'))
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SERVICE_NOT_PUBLISHABLE');
  });

  it('changes lifecycle status and filters the list by status', async () => {
    const created = await createOk();

    const archived = await request(app)
      .patch(`/api/admin/services/${created.id}/status`)
      .set(auth('admin'))
      .send({ status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVED');

    const list = await request(app)
      .get(`/api/admin/services?status=ARCHIVED&search=${encodeURIComponent('Admin service fixture')}`)
      .set(auth('admin'));
    expect(list.status).toBe(200);
    const page = list.body.data as Paginated<AdminServiceSummaryDto>;
    expect(page.items.some((row) => row.id === created.id)).toBe(true);
  });

  // isActive mirrors status: PUBLISHED is exactly the legacy-catalog set, so
  // publishing from the admin editor makes a service publicly orderable.
  it('publishing makes a service visible in the anonymous legacy catalog', async () => {
    const created = await createOk();

    // Draft → hidden from the anonymous legacy catalog.
    expect((await request(app).get(`/api/services/${created.slug}`)).status).toBe(404);

    // Publish (PATCH status) → visible anonymously.
    const published = await request(app)
      .patch(`/api/admin/services/${created.id}/status`)
      .set(auth('admin'))
      .send({ status: 'PUBLISHED' });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const list = await request(app).get('/api/services?pageSize=50');
    expect(list.status).toBe(200);
    expect((list.body.data.items as Array<{ slug: string }>).some((row) => row.slug === created.slug)).toBe(true);
    expect((await request(app).get(`/api/services/${created.slug}`)).status).toBe(200);

    // Unpublish → hidden again everywhere.
    const unpublished = await request(app)
      .patch(`/api/admin/services/${created.id}/status`)
      .set(auth('admin'))
      .send({ status: 'UNPUBLISHED' });
    expect(unpublished.status).toBe(200);
    const hiddenList = await request(app).get('/api/services?pageSize=50');
    expect((hiddenList.body.data.items as Array<{ slug: string }>).some((row) => row.slug === created.slug)).toBe(false);
    expect((await request(app).get(`/api/services/${created.slug}`)).status).toBe(404);

    // "Save & publish" (full PUT with status PUBLISHED) → visible again.
    const savedPublish = await request(app)
      .put(`/api/admin/services/${created.id}`)
      .set(auth('admin'))
      .send(baseCreate({ slug: created.slug, status: 'PUBLISHED' }));
    expect(savedPublish.status, JSON.stringify(savedPublish.body)).toBe(200);
    expect((await request(app).get(`/api/services/${created.slug}`)).status).toBe(200);
  });

  it('deletes an unreferenced service', async () => {
    const created = await createOk();
    const res = await request(app).delete(`/api/admin/services/${created.id}`).set(auth('admin'));
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const gone = await request(app).get(`/api/admin/services/${created.id}`).set(auth('admin'));
    expect(gone.status).toBe(404);
  });

  it('refuses to delete a service referenced by a cart and supports archiving it', async () => {
    const created = await createOk();
    const cart = await prisma.cart.create({ data: { userId: customer.id } });
    await prisma.cartItem.create({ data: { cartId: cart.id, serviceId: created.id } });

    const blocked = await request(app).delete(`/api/admin/services/${created.id}`).set(auth('admin'));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SERVICE_IN_USE');
    expect(blocked.body.error.details.usage.carts).toBe(1);

    const archived = await request(app)
      .patch(`/api/admin/services/${created.id}/status`)
      .set(auth('admin'))
      .send({ status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVED');
  });
});
