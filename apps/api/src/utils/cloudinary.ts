import * as crypto from 'node:crypto';
import { env, hasCloudinary } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { UPLOAD_LIMITS } from '@tsh/shared';

/** Upload folders — also Cloudinary resource folders. */
export const UPLOAD_FOLDERS = {
  requirements: 'techservice-hub/requirements',
  deliveries: 'techservice-hub/deliveries',
  misc: 'techservice-hub/misc',
} as const;
export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

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
 */
export function signUpload(folder: UploadFolder) {
  assertCloudinaryConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${UPLOAD_FOLDERS[folder]}/${crypto.randomUUID()}`;
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${UPLOAD_FOLDERS[folder]}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
    .digest('hex');

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: UPLOAD_FOLDERS[folder],
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
