import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Stage 4 unit tests — QR namespace ownership plus customer/admin DTO safety.
 * No network or database is used; the Blob SDK is mocked where a presigned
 * URL is minted, and the read-write token is stubbed only so the helpers can
 * run their pure logic.
 */

const ADMIN_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_ADMIN_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';
const ASSET_ID = randomUUID();
const TOKEN = 'vercel_blob_rw_stage4_test';

const account = {
  id: '9d9f1c2e-1111-4111-8111-111111111111',
  methodKey: 'BKASH',
  label: 'Main bKash',
  accountType: 'Merchant',
  accountNumber: '01712345678',
  accountHolder: 'TechService Hub',
  instructions: 'Send money, then submit the TrxID.',
  // Legacy Cloudinary reference (pre-migration rows only).
  qrPublicId: null as string | null,
  // Private Blob pathname (new rows).
  blobPath: null as string | null,
  isActive: true,
  displayOrder: 3,
  createdById: ADMIN_ID,
  updatedById: ADMIN_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('payment-account QR ownership', () => {
  it('accepts only this administrator’s minted blob pathname', async () => {
    const { assertPaymentAccountQrOwnership } = await import('../utils/blob.js');
    expect(() =>
      assertPaymentAccountQrOwnership(
        `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}.png`,
        ADMIN_ID,
      ),
    ).not.toThrow();
  });

  it('rejects another administrator, foreign namespaces and arbitrary values', async () => {
    const { assertPaymentAccountQrOwnership } = await import('../utils/blob.js');
    const rejected = [
      `techservice-hub/payment-accounts/${OTHER_ADMIN_ID}/${ASSET_ID}.png`,
      // customer payment screenshot namespace
      `techservice-hub/payments/${ADMIN_ID}/${ASSET_ID}.png`,
      // path traversal / prefix games
      `techservice-hub/payment-accounts/${ADMIN_ID}/../${ASSET_ID}.png`,
      `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}.png/extra`,
      `https://res.cloudinary.com/test-cloud/image/upload/v1/${ASSET_ID}`,
      // legacy Cloudinary public id shape (no extension) — must be re-issued
      // as a Blob pathname by the migration script, never accepted here
      `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}`,
      `techservice-hub/payment-accounts/${ADMIN_ID}/not-a-uuid.png`,
      ASSET_ID,
    ];
    for (const pathname of rejected) {
      expect(() => assertPaymentAccountQrOwnership(pathname, ADMIN_ID)).toThrow();
    }
  });
});

describe('payment-account DTO safety', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('@vercel/blob');
  });

  it('customer DTO exposes only safe fields and never audit/internal data', async () => {
    const { toPaymentAccountOptionDto } = await import('../utils/mappers.js');
    const dto = await toPaymentAccountOptionDto(account as never);

    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'methodKey',
        'label',
        'accountType',
        'accountNumber',
        'accountHolder',
        'instructions',
        'qrUrl',
      ].sort(),
    );
    expect(dto).not.toHaveProperty('isActive');
    expect(dto).not.toHaveProperty('displayOrder');
    expect(dto).not.toHaveProperty('createdById');
    expect(dto).not.toHaveProperty('qrPublicId');
    expect(dto).not.toHaveProperty('blobPath');
    // No blobPath and no Blob storage configured → no URL is fabricated.
    expect(dto.qrUrl).toBeNull();
  });

  it('admin DTO adds management fields but never the raw storage path', async () => {
    const { toAdminPaymentAccountDto } = await import('../utils/mappers.js');
    const dto = await toAdminPaymentAccountDto({
      ...account,
      // Legacy Cloudinary-only row: hasQr stays true (an identifier exists)
      // while qrUrl is null until the migration backfills blobPath.
      qrPublicId: `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}`,
      _count: { payments: 4 },
      createdBy: { fullName: 'Founder One' },
      updatedBy: null,
    } as never);

    expect(dto.isActive).toBe(true);
    expect(dto.displayOrder).toBe(3);
    expect(dto.hasQr).toBe(true);
    expect(dto.usageCount).toBe(4);
    expect(dto.createdByName).toBe('Founder One');
    expect(dto.updatedByName).toBeNull();
    expect(dto).not.toHaveProperty('qrPublicId');
    expect(dto).not.toHaveProperty('blobPath');
    expect(dto.qrUrl).toBeNull();
  });

  it('mints a presigned QR URL from blobPath only — never from a Cloudinary public id', async () => {
    vi.doMock('@vercel/blob', () => ({
      issueSignedToken: vi.fn().mockResolvedValue({ delegationToken: 'd', clientSigningToken: 'c', validUntil: Date.now() + 60_000 }),
      presignUrl: vi.fn().mockResolvedValue({ presignedUrl: 'https://blob.example/presigned-qr' }),
      head: vi.fn(),
      del: vi.fn(),
    }));
    const blobPath = `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}.png`;

    // blobPath present + Blob "configured" (stubbed token) → presigned URL.
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    const { toPaymentAccountOptionDto } = await import('../utils/mappers.js');
    const dto = await toPaymentAccountOptionDto({ ...account, blobPath } as never);
    expect(dto.qrUrl).toBe('https://blob.example/presigned-qr');
    expect(JSON.stringify(dto)).not.toContain(TOKEN);
    expect(JSON.stringify(dto)).not.toContain(blobPath);

    // A record with ONLY the legacy Cloudinary id must never mint a URL —
    // that id is not a Blob pathname and the URL would 404.
    const legacyDto = await toPaymentAccountOptionDto({
      ...account,
      blobPath: null,
      qrPublicId: `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}`,
    } as never);
    expect(legacyDto.qrUrl).toBeNull();
  });
});
