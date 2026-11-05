import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Stage 4 unit tests — QR namespace ownership plus customer/admin DTO safety.
 * No network or database is used; Cloudinary env vars are stubbed only so the
 * signing helpers can run their pure SHA-1 logic.
 */

const ADMIN_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_ADMIN_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';
const ASSET_ID = randomUUID();
const SECRET = 'stage4-secret';

const account = {
  id: '9d9f1c2e-1111-4111-8111-111111111111',
  methodKey: 'BKASH',
  label: 'Main bKash',
  accountType: 'Merchant',
  accountNumber: '01712345678',
  accountHolder: 'TechService Hub',
  instructions: 'Send money, then submit the TrxID.',
  qrPublicId: null as string | null,
  isActive: true,
  displayOrder: 3,
  createdById: ADMIN_ID,
  updatedById: ADMIN_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('payment-account QR ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('mints an admin-scoped QR public id in the dedicated namespace', async () => {
    const { signUpload, PAYMENT_ACCOUNTS_UPLOAD_ROOT } = await import('../utils/cloudinary.js');
    const signed = signUpload('paymentAccounts', { userId: ADMIN_ID });
    expect(signed.folder).toBe(`${PAYMENT_ACCOUNTS_UPLOAD_ROOT}/${ADMIN_ID}`);
    expect(signed.publicId).toMatch(
      new RegExp(`^techservice-hub/payment-accounts/${ADMIN_ID}/[0-9a-f-]{36}$`),
    );
    expect(JSON.stringify(signed)).not.toContain(SECRET);
  });

  it('requires authentication for the account QR namespace', async () => {
    const { signUpload } = await import('../utils/cloudinary.js');
    expect(() => signUpload('paymentAccounts')).toThrow();
    expect(() => signUpload('paymentAccounts', {})).toThrow();
  });

  it('accepts only this administrator’s minted asset id', async () => {
    const { assertPaymentAccountQrOwnership } = await import('../utils/cloudinary.js');
    expect(() =>
      assertPaymentAccountQrOwnership(`techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}`, ADMIN_ID),
    ).not.toThrow();
  });

  it('rejects another administrator, the customer namespace and arbitrary values', async () => {
    const { assertPaymentAccountQrOwnership } = await import('../utils/cloudinary.js');
    const rejected = [
      `techservice-hub/payment-accounts/${OTHER_ADMIN_ID}/${ASSET_ID}`,
      // customer payment screenshot namespace
      `techservice-hub/payments/${ADMIN_ID}/${ASSET_ID}`,
      // path traversal / prefix games
      `techservice-hub/payment-accounts/${ADMIN_ID}/../${ASSET_ID}`,
      `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}/extra`,
      `https://res.cloudinary.com/test-cloud/image/upload/v1/${ASSET_ID}`,
      `techservice-hub/payment-accounts/${ADMIN_ID}/not-a-uuid`,
      ASSET_ID,
    ];
    for (const publicId of rejected) {
      expect(() => assertPaymentAccountQrOwnership(publicId, ADMIN_ID)).toThrow();
    }
  });
});

describe('payment-account DTO safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('customer DTO exposes only safe fields and never audit/internal data', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const { toPaymentAccountOptionDto } = await import('../utils/mappers.js');
    const dto = toPaymentAccountOptionDto(account as never);

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
    expect(dto.qrUrl).toBeNull();
  });

  it('admin DTO adds management fields but never the raw QR public id', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const { toAdminPaymentAccountDto } = await import('../utils/mappers.js');
    const dto = toAdminPaymentAccountDto({
      ...account,
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
    // Cloudinary is unconfigured here → no signed URL is fabricated.
    expect(dto.qrUrl).toBeNull();
  });

  it('returns a signed QR URL when Cloudinary is configured without leaking the secret', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', SECRET);
    const { toPaymentAccountOptionDto } = await import('../utils/mappers.js');
    const publicId = `techservice-hub/payment-accounts/${ADMIN_ID}/${ASSET_ID}`;
    const dto = toPaymentAccountOptionDto({ ...account, qrPublicId: publicId } as never);

    expect(dto.qrUrl).toContain('res.cloudinary.com/test-cloud/image/upload');
    expect(dto.qrUrl).toContain(publicId);
    expect(JSON.stringify(dto)).not.toContain(SECRET);
  });
});
