import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { signUpload } from '../utils/cloudinary.js';

/**
 * POST /api/uploads/sign — mint a short-lived Cloudinary signature so the
 * browser uploads directly (the API secret stays server-side). The client
 * then registers the file via POST /orders/:id/attachments (or checkout's
 * attachmentIds for staged files). Payment screenshots are user-scoped
 * (<root>/<userId>/<uuid>) so server-side ownership checks can prove the
 * referenced asset belongs to that uploader. Returns 503 when Cloudinary
 * isn't wired.
 */
export async function sign(req: Request, res: Response, next: NextFunction) {
  try {
    const { folder } = validated<{ folder: 'requirements' | 'deliveries' | 'misc' | 'payments' }>(req, 'body');
    res.json(ok(signUpload(folder, { userId: folder === 'payments' ? req.authUser!.id : undefined })));
  } catch (err) {
    next(err);
  }
}
