import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import { validated } from '../middleware/validate.js';
import { createUploadTicket } from '../utils/blob.js';
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
