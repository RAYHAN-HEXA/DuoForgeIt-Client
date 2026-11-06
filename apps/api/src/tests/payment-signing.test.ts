import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Namespace + ticket tests for the Vercel Blob cutover. No network: the Blob
 * SDK is mocked where needed. Covers the server-minted user-scoped pathname
 * contract (techservice-hub/<folder>/<userId>/<uuid>.<ext>), the ownership
 * predicate every registration endpoint relies on, the MIME allow-list, and
 * the download-URL namespace guard.
 */

const USER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID = '0123abcd-4f89-11d3-9a0c-0305e82c3301';

describe('isOwnedPathname — server-minted namespace ownership', () => {
  it('accepts the exact user-scoped shape for every folder', async () => {
    const { isOwnedPathname } = await import('../utils/blob.js');
    const folders = ['requirements', 'deliveries', 'misc', 'payments', 'paymentAccounts', 'requests'] as const;
    for (const folder of folders) {
      const pathname = `techservice-hub/${folder === 'paymentAccounts' ? 'payment-accounts' : folder}/${USER_ID}/${UUID}.png`;
      expect(isOwnedPathname(pathname, folder, USER_ID)).toBe(true);
    }
  });

  it('rejects another user’s pathname', async () => {
    const { isOwnedPathname } = await import('../utils/blob.js');
    expect(isOwnedPathname(`techservice-hub/payments/${OTHER_USER_ID}/${UUID}.png`, 'payments', USER_ID)).toBe(false);
  });

  it('rejects a foreign folder prefix even with the right user', async () => {
    const { isOwnedPathname } = await import('../utils/blob.js');
    // payments namespace path claimed as requirements
    expect(isOwnedPathname(`techservice-hub/payments/${USER_ID}/${UUID}.png`, 'requirements', USER_ID)).toBe(false);
    // prefix-spoofing folder name must not pass
    expect(isOwnedPathname(`techservice-hub/payments-evildir/${USER_ID}/${UUID}.png`, 'payments', USER_ID)).toBe(false);
  });

  it('rejects traversal, missing extension and non-uuid basenames', async () => {
    const { isOwnedPathname } = await import('../utils/blob.js');
    expect(isOwnedPathname(`techservice-hub/payments/${USER_ID}/${UUID}/../secret.png`, 'payments', USER_ID)).toBe(false);
    expect(isOwnedPathname(`techservice-hub/payments/${USER_ID}/${UUID}`, 'payments', USER_ID)).toBe(false);
    expect(isOwnedPathname(`techservice-hub/payments/${USER_ID}/not-a-uuid.png`, 'payments', USER_ID)).toBe(false);
    expect(isOwnedPathname(`techservice-hub/payments/${USER_ID}/${UUID}.png-secret`, 'payments', USER_ID)).toBe(false);
    expect(isOwnedPathname('', 'payments', USER_ID)).toBe(false);
  });

  it('regex-escapes the user id (defense-in-depth)', async () => {
    const { isOwnedPathname } = await import('../utils/blob.js');
    // A userId containing regex metacharacters must never widen the pattern.
    expect(isOwnedPathname('techservice-hub/payments/a.c/../x/0123abcd-4f89-11d3-9a0c-0305e82c3301/f.png', 'payments', 'a.c')).toBe(false);
  });
});

describe('assertPaymentScreenshotOwnership / assertPaymentAccountQrOwnership', () => {
  it('delegates to the shared predicate with the right folder', async () => {
    const blob = await import('../utils/blob.js');
    const { ApiError } = await import('../utils/ApiError.js');

    expect(() =>
      blob.assertPaymentScreenshotOwnership(`techservice-hub/payments/${USER_ID}/${UUID}.jpg`, USER_ID),
    ).not.toThrow();
    expect(() =>
      blob.assertPaymentScreenshotOwnership(`techservice-hub/payments/${OTHER_USER_ID}/${UUID}.jpg`, USER_ID),
    ).toThrow(ApiError);
    expect(() =>
      blob.assertPaymentScreenshotOwnership(`techservice-hub/requirements/${USER_ID}/${UUID}.jpg`, USER_ID),
    ).toThrow(ApiError);

    expect(() =>
      blob.assertPaymentAccountQrOwnership(`techservice-hub/payment-accounts/${USER_ID}/${UUID}.png`, USER_ID),
    ).not.toThrow();
    expect(() =>
      blob.assertPaymentAccountQrOwnership(`techservice-hub/payments/${USER_ID}/${UUID}.png`, USER_ID),
    ).toThrow(ApiError);
  });
});

describe('extensionForMimeType + assertUploadAllowed', () => {
  it('maps allowed MIME types to canonical extensions', async () => {
    const { extensionForMimeType } = await import('../utils/blob.js');
    expect(extensionForMimeType('application/pdf')).toBe('pdf');
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(extensionForMimeType('application/zip')).toBe('zip');
    expect(extensionForMimeType('application/x-zip-compressed')).toBe('zip');
    expect(extensionForMimeType('application/octet-stream')).toBe('bin');
  });

  it('rejects disallowed MIME types and oversized files', async () => {
    const blob = await import('../utils/blob.js');
    const { ApiError } = await import('../utils/ApiError.js');
    const { UPLOAD_LIMITS } = await import('@tsh/shared');
    expect(() => blob.assertUploadAllowed('image/png', 1024)).not.toThrow();
    expect(() => blob.assertUploadAllowed('application/x-msdownload', 1024)).toThrow(ApiError);
    expect(() => blob.assertUploadAllowed('image/png', UPLOAD_LIMITS.maxFileSizeBytes + 1)).toThrow(/limit/);
    expect(() => blob.assertUploadAllowed('image/png', 0)).toThrow(ApiError);
  });
});

describe('createUploadTicket + signedDownloadUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test_token');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@vercel/blob');
    vi.doUnmock('@vercel/blob/client');
  });

  it('mints a ticket constrained to the minted pathname, MIME and size', async () => {
    const fakeToken = 'fake-client-token';
    vi.doMock('@vercel/blob/client', () => ({
      generateClientTokenFromReadWriteToken: vi.fn().mockResolvedValue(fakeToken),
    }));
    const { createUploadTicket } = await import('../utils/blob.js');
    const ticket = await createUploadTicket('payments', {
      userId: USER_ID,
      mimeType: 'image/png',
      sizeBytes: 12345,
    });

    expect(ticket.pathname).toMatch(new RegExp(`^techservice-hub/payments/${USER_ID}/[0-9a-f-]{36}\\.png$`));
    expect(ticket.access).toBe('private');
    expect(ticket.token).toBe(fakeToken);
    expect(new Date(ticket.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client') as any;
    expect(generateClientTokenFromReadWriteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'vercel_blob_rw_test_token',
        allowedContentTypes: ['image/png'],
        maximumSizeInBytes: 12345,
      }),
    );
    // The read-write token must never be part of the client-facing ticket.
    expect(JSON.stringify(ticket)).not.toContain('vercel_blob_rw_test_token');
  });

  it('rejects disallowed MIME and oversize declarations before minting', async () => {
    const { createUploadTicket } = await import('../utils/blob.js');
    const { ApiError } = await import('../utils/ApiError.js');
    await expect(
      createUploadTicket('payments', { userId: USER_ID, mimeType: 'application/x-msdownload', sizeBytes: 10 }),
    ).rejects.toThrow(ApiError);
    await expect(
      createUploadTicket('payments', { userId: USER_ID, mimeType: 'image/png', sizeBytes: 999999999 }),
    ).rejects.toThrow(ApiError);
  });

  it('returns 503-flavoured ApiError when Blob storage is not configured', async () => {
    vi.unstubAllEnvs();
    const { createUploadTicket } = await import('../utils/blob.js');
    try {
      await createUploadTicket('payments', { userId: USER_ID, mimeType: 'image/png', sizeBytes: 100 });
      expect.unreachable();
    } catch (err) {
      expect((err as { status?: number }).status).toBe(503);
    }
  });

  it('signedDownloadUrl mints a GET-only, path-scoped presigned URL', async () => {
    vi.doMock('@vercel/blob', () => ({
      issueSignedToken: vi.fn().mockResolvedValue({ delegationToken: 'd', clientSigningToken: 'c', validUntil: Date.now() + 60_000 }),
      presignUrl: vi.fn().mockResolvedValue({ presignedUrl: 'https://blob.example/presigned' }),
      head: vi.fn(),
      del: vi.fn(),
    }));
    const { signedDownloadUrl } = await import('../utils/blob.js');
    const url = await signedDownloadUrl(`techservice-hub/payments/${USER_ID}/${UUID}.png`);
    expect(url).toBe('https://blob.example/presigned');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blobSdk = await import('@vercel/blob') as any;
    const issuedWith = blobSdk.issueSignedToken.mock.calls[0][0];
    expect(issuedWith.operations).toEqual(['get']);
    expect(issuedWith.pathname).toBe(`techservice-hub/payments/${USER_ID}/${UUID}.png`);
    const presignedWith = blobSdk.presignUrl.mock.calls[0][1];
    expect(presignedWith.operation).toBe('get');
    expect(presignedWith.access).toBe('private');
    expect(presignedWith.pathname).toBe(`techservice-hub/payments/${USER_ID}/${UUID}.png`);
  });

  it('signedDownloadUrl refuses pathnames outside the store root', async () => {
    const { signedDownloadUrl } = await import('../utils/blob.js');
    const { ApiError } = await import('../utils/ApiError.js');
    await expect(signedDownloadUrl('https://evil.example/file')).rejects.toThrow(ApiError);
    await expect(signedDownloadUrl('other-store/payments/x.png')).rejects.toThrow(ApiError);
  });
});
