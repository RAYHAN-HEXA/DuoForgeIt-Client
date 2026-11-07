import { describe, expect, it, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

/**
 * Boots the real Express app with a placeholder DATABASE_URL (no queries are
 * made — /api/health short-circuits on hasDatabase) and no Firebase creds
 * (health reports 'unconfigured' rather than failing).
 */
let app: Express;

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PORT', '5000');
  vi.stubEnv('DATABASE_URL', 'postgresql://placeholder:placeholder@localhost:5432/placeholder');
  vi.stubEnv('FIREBASE_PROJECT_ID', 'demo-project');
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('GET /api/health', () => {
  it('returns a success envelope with config status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    // placeholder DATABASE_URL → hasDatabase=true, query fails → honest 'error'
    expect(res.body.data.db).toBe('error');
    expect(res.body.data.firebase).toBe('unconfigured');
  });
});

describe('unknown routes', () => {
  it('returns a 404 envelope', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('RBAC smoke', () => {
  it('rejects admin endpoints without a token', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects /api/auth/me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects the admin service catalog without a token', async () => {
    const list = await request(app).get('/api/admin/services');
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHENTICATED');

    const create = await request(app).post('/api/admin/services').send({});
    expect(create.status).toBe(401);
  });

  // ── Manual-payments v2 (Stage 2): authenticated-only surfaces ──

  it('rejects /api/payment-accounts without a token', async () => {
    const res = await request(app).get('/api/payment-accounts');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects the v2 payment submission without a token (v1 route still mounted)', async () => {
    const res = await request(app)
      .post('/api/orders/00000000-0000-4000-8000-000000000000/payments/v2')
      .send({ accountId: '00000000-0000-4000-8000-000000000001', transactionId: 'TEST123', amount: '10.00' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
