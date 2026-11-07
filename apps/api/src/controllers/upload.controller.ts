import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import { validated } from '../middleware/validate.js';
import { createUploadTicket, createPublicImage, PUBLIC_IMAGE_MAX_BYTES } from '../utils/blob.js';
import type { BlobUploadTokenRequest } from '@tsh/shared';

/**
 * POST /api/uploads/blob/token — mint a short-lived, pathname-scoped client
 * upload ticket. The server derives the pathname
 * (techservice-hub/<folder>/<userId>/<uuid>.<ext>) — the client can never
 * choose its own namespace — and constrains the token to the declared MIME
 * type and size. The browser uploads with the @vercel/blob SDK:
 * `upload(pathname, file, { access: 'private', token, contentType })`.
 *
 * The read-write token never leaves the server. Returns 503 when Blob
 * storage isn't configured (FILE_STORAGE_UNCONFIGURED).
 */
export async function createTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<BlobUploadTokenRequest>(req, 'body');
    // The QR namespace is admin-only — administrators mint their tickets via
    // POST /api/admin/payment-accounts/qr/sign (requireAdmin-protected).
    if (body.folder === 'paymentAccounts') {
      throw ApiError.forbidden('This storage folder is reserved for administrators');
    }
    const ticket = await createUploadTicket(body.folder, {
      userId: req.authUser!.id,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    res.json(ok(ticket));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/uploads/image — the raw request body IS the image (express.raw,
 * Content-Type image/*). The server stores it as a PUBLIC blob (≤2 MB,
 * png/jpeg/webp) under the caller's own avatars/ namespace and returns the
 * permanent CDN URL — clients drop it straight into the profileImage field.
 */
export async function uploadAvatarImage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createPublicImage('avatars', {
      userId: req.authUser!.id,
      mimeType: req.headers['content-type'] ?? '',
      bytes: req.body,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/uploads/image — same, but under the admins' service-images/ namespace. */
export async function uploadServiceImage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createPublicImage('serviceImages', {
      userId: req.authUser!.id,
      mimeType: req.headers['content-type'] ?? '',
      bytes: req.body,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

/** Guard shared by both image routes: the raw parser must have produced bytes. */
export function assertImageBody(req: Request, res: Response, next: NextFunction) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    next(ApiError.badRequest('Send the image bytes as the request body with an image/* Content-Type'));
    return;
  }
  if (req.body.length > PUBLIC_IMAGE_MAX_BYTES) {
    next(ApiError.badRequest('Image exceeds the 2 MB limit', 'FILE_TOO_LARGE'));
    return;
  }
  next();
}
