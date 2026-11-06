// Vercel Blob storage utilities (replaces the Cloudinary integration).
//
// Security model — every stored object is PRIVATE:
//   1. Pathnames are minted SERVER-SIDE as
//        techservice-hub/<folder>/<userId>/<uuid>.<ext>
//      so any stored reference can be ownership-checked by prefix; a client
//      can never choose its own namespace.
//   2. Uploads use short-lived client tokens constrained to the exact
//      pathname, content type and maximum size (see createUploadTicket).
//   3. Registrations verify the referenced object EXISTS with matching
//      metadata via head() before the reference is persisted.
//   4. Downloads are short-lived presigned GET URLs scoped to the exact
//      pathname, minted ONLY inside authorized handlers (owner or admin).
//   5. The read-write token never leaves the server.
import * as crypto from 'node:crypto';
import { ApiError } from './ApiError.js';
import { env } from '../config/env.js';
import { UPLOAD_LIMITS } from '@tsh/shared';
import { issueSignedToken, presignUrl, head, del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

/** Upload folders — Vercel Blob namespaces (folder component of pathnames). */
export const UPLOAD_FOLDERS = {
  requirements: 'techservice-hub/requirements',
  deliveries: 'techservice-hub/deliveries',
  misc: 'techservice-hub/misc',
  payments: 'techservice-hub/payments',
  /** Admin-managed receiving-account QR images. */
  paymentAccounts: 'techservice-hub/payment-accounts',
  /** Marketplace service-request attachments (RequestFile.storagePath). */
  requests: 'techservice-hub/requests',
} as const;
export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

export const UPLOAD_ROOT = 'techservice-hub/';
export const PAYMENTS_UPLOAD_ROOT = UPLOAD_FOLDERS.payments;
export const PAYMENT_ACCOUNTS_UPLOAD_ROOT = UPLOAD_FOLDERS.paymentAccounts;

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Upload tickets are valid for 15 minutes; downloads for 5 minutes. */
const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
const DOWNLOAD_TTL_MS = 5 * 60 * 1000;

/**
 * Canonical MIME → pathname extension map, kept in lockstep with
 * UPLOAD_LIMITS.allowedExtensions / allowedMimeTypes in @tsh/shared. The
 * server-minted name carries the extension, so a client-supplied name or
 * extension can never become a pathname component.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

export function extensionForMimeType(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? 'bin';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertBlobConfigured(): void {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw ApiError.unavailable(
      'File storage is not configured yet. Please try again later or contact support.',
      'FILE_STORAGE_UNCONFIGURED',
    );
  }
}

/** MIME allow-list check (no size argument). */
export function assertMimeTypeAllowed(mimeType: string): void {
  if (!UPLOAD_LIMITS.allowedMimeTypes.includes(mimeType as never)) {
    throw ApiError.badRequest(`File type ${mimeType} is not allowed`, 'FILE_TYPE_NOT_ALLOWED');
  }
}

/** Size + MIME allow-list check for registration endpoints. */
export function assertUploadAllowed(mimeType: string, sizeBytes: number): void {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw ApiError.badRequest('Invalid file size');
  }
  if (sizeBytes > UPLOAD_LIMITS.maxFileSizeBytes) {
    throw ApiError.badRequest(
      `File exceeds the ${(UPLOAD_LIMITS.maxFileSizeBytes / 1024 / 1024).toFixed(0)} MB limit`,
      'FILE_TOO_LARGE',
    );
  }
  assertMimeTypeAllowed(mimeType);
}

/**
 * True when `pathname` is EXACTLY a server-minted path for `folder` uploaded
 * by `userId` (uuid basename + short extension). This is the ownership proof
 * used by every registration endpoint.
 */
export function isOwnedPathname(pathname: string, folder: UploadFolder, userId: string): boolean {
  const pattern = new RegExp(
    `^${escapeRegExp(UPLOAD_FOLDERS[folder])}/${escapeRegExp(userId)}/${UUID_RE}\\.[a-z0-9]{1,8}$`,
  );
  return pattern.test(pathname);
}

/**
 * Ownership check that throws a client-safe error. `label` keeps the message
 * specific without leaking namespace internals beyond what the client already
 * knows from its own upload ticket.
 */
export function assertOwnedPathname(
  pathname: string,
  folder: UploadFolder,
  userId: string,
  label: string,
): void {
  if (!isOwnedPathname(pathname, folder, userId)) {
    throw ApiError.badRequest(`The referenced ${label} does not belong to your uploads`);
  }
}

export function assertPaymentScreenshotOwnership(pathname: string, userId: string): void {
  assertOwnedPathname(pathname, 'payments', userId, 'screenshot');
}

export function assertPaymentAccountQrOwnership(pathname: string, adminId: string): void {
  assertOwnedPathname(pathname, 'paymentAccounts', adminId, 'QR image');
}

/**
 * Mint a short-lived client-upload ticket. The returned token is constrained
 * to the exact pathname, the declared content type and the smaller of the
 * declared size and the global limit — a stolen token cannot upload anywhere
 * else or anything larger. The client uploads with the @vercel/blob SDK:
 * `upload(pathname, file, { access: 'private', token, contentType })`.
 */
export async function createUploadTicket(
  folder: UploadFolder,
  options: { userId: string; mimeType: string; sizeBytes: number },
): Promise<{
  pathname: string;
  token: string;
  access: 'private';
  expiresAt: string;
}> {
  assertBlobConfigured();
  assertMimeTypeAllowed(options.mimeType);
  if (!Number.isInteger(options.sizeBytes) || options.sizeBytes < 1) {
    throw ApiError.badRequest('Invalid file size');
  }
  if (options.sizeBytes > UPLOAD_LIMITS.maxFileSizeBytes) {
    throw ApiError.badRequest(
      `File exceeds the ${(UPLOAD_LIMITS.maxFileSizeBytes / 1024 / 1024).toFixed(0)} MB limit`,
      'FILE_TOO_LARGE',
    );
  }

  const pathname = `${UPLOAD_FOLDERS[folder]}/${options.userId}/${crypto.randomUUID()}.${extensionForMimeType(options.mimeType)}`;
  const validUntil = Date.now() + UPLOAD_TICKET_TTL_MS;

  const token = await generateClientTokenFromReadWriteToken({
    token: env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    allowedContentTypes: [options.mimeType],
    maximumSizeInBytes: options.sizeBytes,
    validUntil,
  });

  return {
    pathname,
    token,
    access: 'private',
    expiresAt: new Date(validUntil).toISOString(),
  };
}

/**
 * Presigned GET URL for a private blob — short-lived and scoped to the exact
 * pathname. Async because it requests fresh delegation material from the
 * Blob API. Call ONLY after the caller's own authorization checks (owner or
 * admin); this function intentionally does no DB lookups of its own.
 */
export async function signedDownloadUrl(pathname: string): Promise<string> {
  assertBlobConfigured();
  if (!pathname.startsWith(UPLOAD_ROOT)) {
    throw ApiError.badRequest('Invalid storage reference');
  }
  const validUntil = Date.now() + DOWNLOAD_TTL_MS;

  const issued = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil,
  });

  const { presignedUrl } = await presignUrl(issued, {
    operation: 'get',
    pathname,
    access: 'private',
  });

  return presignedUrl;
}

/**
 * Prove the referenced blob EXISTS (created by a completed client upload) and,
 * when declared metadata is given, that it matches what the client claims.
 * Registration endpoints call this before persisting the reference, so a
 * dangling or mismatched pathname can never enter the database.
 */
export async function assertStoredBlob(
  pathname: string,
  declared?: { contentType?: string; sizeBytes?: number },
): Promise<void> {
  assertBlobConfigured();
  if (!pathname.startsWith(UPLOAD_ROOT)) {
    throw ApiError.badRequest('Invalid storage reference');
  }
  let meta;
  try {
    meta = await head(pathname);
  } catch {
    throw ApiError.badRequest(
      'The referenced file has not finished uploading. Please upload the file again.',
      'FILE_NOT_UPLOADED',
    );
  }
  if (declared?.contentType && meta.contentType !== declared.contentType) {
    throw ApiError.badRequest('Uploaded file type does not match the declared type', 'FILE_TYPE_MISMATCH');
  }
  if (declared?.sizeBytes != null && meta.size !== declared.sizeBytes) {
    throw ApiError.badRequest('Uploaded file size does not match the declared size', 'FILE_SIZE_MISMATCH');
  }
}

/** Delete a blob by pathname (admin flows). */
export async function deleteBlob(pathname: string): Promise<void> {
  assertBlobConfigured();
  if (!pathname.startsWith(UPLOAD_ROOT)) {
    throw ApiError.badRequest('Invalid storage reference');
  }
  await del(pathname);
}
