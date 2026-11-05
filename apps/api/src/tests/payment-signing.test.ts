import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';

/**
 * Signing-namespace tests for the payments upload folder. Cloudinary env vars
 * are stubbed — signing is pure SHA-1 over the params, no network. The
 * legacy folders must keep their shared-namespace shape (regression), while
 * `payments` mints the user-scoped
 * techservice-hub/payments/<userId>/<uuid> namespace.
 */

const USER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
// Unanchored uuid source for interpolation into larger patterns.
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SECRET = 'test-secret';

describe('signUpload — payments namespace', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('mints techservice-hub/payments/<userId>/<uuid> with a covering signature', async () => {
    const { signUpload } = await import('../utils/cloudinary.js');
    const signed = signUpload('payments', { userId: USER_ID });

    expect(signed.publicId).toMatch(new RegExp(`^techservice-hub/payments/${USER_ID}/${UUID_SOURCE}$`));
    expect(signed.folder).toBe(`techservice-hub/payments/${USER_ID}`);
    expect(signed.cloudName).toBe('test-cloud');
    expect(signed.apiKey).toBe('test-key');
    // The signature must cover the params the client will send to Cloudinary
    const expected = crypto
      .createHash('sha1')
      .update(`folder=${signed.folder}&public_id=${signed.publicId}&timestamp=${signed.timestamp}${SECRET}`)
      .digest('hex');
    expect(signed.signature).toBe(expected);
    // The API secret must never leave the server
    expect(JSON.stringify(signed)).not.toContain(SECRET);
  });

  it('keeps legacy folders on their shared namespace (regression)', async () => {
    const { signUpload } = await import('../utils/cloudinary.js');
    for (const folder of ['requirements', 'deliveries', 'misc'] as const) {
      const signed = signUpload(folder);
      expect(signed.folder).toBe(`techservice-hub/${folder}`);
      expect(signed.publicId).toMatch(new RegExp(`^techservice-hub/${folder}/${UUID_SOURCE}$`));
    }
  });

  it('refuses the payments folder without an authenticated user', async () => {
    const { signUpload } = await import('../utils/cloudinary.js');
    const { ApiError } = await import('../utils/ApiError.js');
    expect(() => signUpload('payments')).toThrow(ApiError);
    expect(() => signUpload('payments', {})).toThrow(ApiError);
  });

  it('returns 503-flavoured ApiError when Cloudinary is not configured', async () => {
    vi.unstubAllEnvs();
    const { signUpload } = await import('../utils/cloudinary.js');
    try {
      signUpload('payments', { userId: USER_ID });
      expect.unreachable();
    } catch (err) {
      expect((err as { status?: number }).status).toBe(503);
    }
  });
});
