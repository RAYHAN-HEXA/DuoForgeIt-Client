import * as crypto from 'node:crypto';

import { ApiError } from './ApiError.js';
import { env, ENABLE_CLOUDINARY_AUTH, hasCloudinary } from '../config/env.js';
import { UPLOAD_LIMITS } from '@tsh/shared';

/** Upload folders — also Cloudinary resource folders. */
export const UPLOAD_FOLDERS = {
  requirements: 'techservice-hub/requirements',
  deliveries: 'techservice-hub/deliveries',
  misc: 'techservice-hub/misc',
  payments: 'techservice-hub/payments',
  /**
   * Admin-managed receiving-account QR images. Dedicated namespace, separate
   * from customer payment screenshots; the public id is always minted by the
   * server as <root>/<adminUserId>/<uuid>.
   */
  paymentAccounts: 'techservice-hub/payment-accounts',
} as const;
export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

/** Payment screenshots live per-user: <root>/<userId>/<server-generated uuid>. */
export const PAYMENTS_UPLOAD_ROOT = UPLOAD_FOLDERS.payments;

/** Receiving-account QR images live per-admin: <root>/<adminUserId>/<uuid>. */
export const PAYMENT_ACCOUNTS_UPLOAD_ROOT = UPLOAD_FOLDERS.paymentAccounts;

export function assertCloudinaryConfigured() {
  if (!hasCloudinary) {
    throw ApiError.unavailable(
      'File storage is not configured yet. Please try again later or contact support.',
      'FILE_STORAGE_UNCONFIGURED',
    );
  }
}

/**
 * Cloudinary upload signature (client uploads directly to Cloudinary; the
 * API secret never leaves the server). Params must be sent to Cloudinary
 * exactly as signed, sorted alphabetically, joined with `&`.
 *
 * The `payments` and `paymentAccounts` folders are user-scoped: the public id
 * is minted as `<root>/<authenticatedUserId>/<uuid>` so a later server-side
 * write can prove the referenced asset belongs to that uploader (see
 * assertPaymentScreenshotOwnership / assertPaymentAccountQrOwnership).
 * `userId` is required there and ignored for the other folders, which keep
 * their shared namespace.
 */
export function signUpload(folder: UploadFolder, options?: { userId?: string }) {
  assertCloudinaryConfigured();
  const userId = options?.userId;
  const userScoped = folder === 'payments' || folder === 'paymentAccounts';
  if (userScoped && !userId) {
    throw ApiError.badRequest(
      folder === 'payments'
        ? 'Authentication is required for payment screenshots'
        : 'Authentication is required for payment account QR uploads',
    );
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const namespace = userScoped ? `${UPLOAD_FOLDERS[folder]}/${userId}` : UPLOAD_FOLDERS[folder];
  const publicId = `${namespace}/${crypto.randomUUID()}`;
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${namespace}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
    .digest('hex');

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: namespace,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
  };
}

/**
 * Short-lived signed download URL for a private asset.
 *
 * Recipe (Cloudinary "signed delivery URLs"): sort the URL parts after
 * `/upload/` alphabetically, append the API secret, SHA-1 it, take the first
 * 8 chars of the base64url digest wrapped in `s--…--`. NOTE: verify this
 * against the exact Cloudinary docs for your account's security settings
 * before production; storage mode must be "authenticated" for this to matter.
 */
export function signedDownloadUrl(publicId: string, kind: 'image' | 'raw' | 'auto'): string {
  assertCloudinaryConfigured();
  const version = Math.floor(Date.now() / 1000);
  const urlParts = `fl_attachment/v${version}/${publicId}`;
  const digest = crypto.createHash('sha1').update(`${urlParts}${env.CLOUDINARY_API_SECRET}`).digest('base64url');
  const signature = digest.slice(0, 8);
  const resource = kind === 'auto' ? 'raw' : kind;
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/${resource}/upload/s--${signature}--/${urlParts}`;
}

// Generate a short‑lived authenticated delivery token (TTL 300 s by default).
export function generateAuthToken(publicId: string, ttlSeconds = 300): string {
  if (!hasCloudinary) {
    throw ApiError.unavailable('Cloudinary not configured', 'CLOUDINARY_UNAVAILABLE');
  }
  // Same recipe as the Cloudinary SDK's api_sign_request: sort params
  // alphabetically, join as `k=v&…`, append the API secret, SHA-1 it.
  const params: Record<string, string | number> = {
    resource_type: 'image',
    type: 'authenticated',
    public_id: publicId,
    acl: `/${publicId}/*`,
    ttl: ttlSeconds,
  };
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${toSign}${env.CLOUDINARY_API_SECRET}`).digest('hex');
}

// Verify uploaded asset via Cloudinary Admin API and enforce size/MIME limits.
export async function verifyUpload(publicId: string, resourceType: 'image' | 'raw' = 'image') {
  if (!hasCloudinary) {
    throw ApiError.unavailable('Cloudinary not configured', 'CLOUDINARY_UNAVAILABLE');
  }
  const url = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/resources/${publicId}`;
  const auth = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64');
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!resp.ok) {
    throw ApiError.badRequest('Uploaded asset not found or inaccessible');
  }
  const data = (await resp.json()) as { bytes: number; format: string; type: string };
  if (data.bytes > UPLOAD_LIMITS.maxFileSizeBytes) {
    throw ApiError.badRequest('Asset exceeds size limit');
  }
  if (!UPLOAD_LIMITS.allowedMimeTypes.includes(data.format as never)) {
    throw ApiError.badRequest('Disallowed file type');
  }
  // When auth mode is on, ensure asset storage type is authenticated.
  if (ENABLE_CLOUDINARY_AUTH && data.type !== 'authenticated') {
    throw ApiError.badRequest('Asset not stored with authenticated delivery');
  }
  return data;
}

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * An account QR image may only reference an id minted for THIS administrator
 * in the dedicated receiving-account namespace. This is namespace-ownership
 * validation (not byte inspection); the client never decides the namespace.
 * Rejects customer payment-screenshot ids, arbitrary URLs and other admins'
 * uploads.
 */
export function assertPaymentAccountQrOwnership(publicId: string, adminId: string): void {
  const pattern = new RegExp(
    `^${escapeRegExp(PAYMENT_ACCOUNTS_UPLOAD_ROOT)}/${escapeRegExp(adminId)}/${UUID_PATTERN}$`,
  );
  if (!pattern.test(publicId)) {
    throw ApiError.badRequest('The QR image does not belong to your payment-account uploads');
  }
}

/** Enforce the shared upload limits on client-reported metadata. */
export function assertUploadAllowed(mimeType: string, sizeBytes: number) {
  if (sizeBytes > UPLOAD_LIMITS.maxFileSizeBytes) {
    throw ApiError.badRequest(
      `File exceeds the ${(UPLOAD_LIMITS.maxFileSizeBytes / 1024 / 1024).toFixed(0)} MB limit`,
      'FILE_TOO_LARGE',
    );
  }
  if (!UPLOAD_LIMITS.allowedMimeTypes.includes(mimeType as never)) {
    throw ApiError.badRequest(`File type ${mimeType} is not allowed`, 'FILE_TYPE_NOT_ALLOWED');
  }
}
