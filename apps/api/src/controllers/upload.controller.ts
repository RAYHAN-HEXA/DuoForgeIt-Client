import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { signUpload } from '../utils/cloudinary.js';

/**
 * POST /api/uploads/sign — mint a short-lived Cloudinary signature so the
 * browser uploads directly (the API secret stays server-side). The client
 * then registers the file via POST /orders/:id/attachments (or checkout's
 * attachmentIds for staged files). Returns 503 when Cloudinary isn't wired.
 */
export async function sign(req: Request, res: Response, next: NextFunction) {
  try {
    const { folder } = validated<{ folder: 'requirements' | 'deliveries' | 'misc' }>(req, 'body');
    res.json(ok(signUpload(folder)));
  } catch (err) {
    next(err);
  }
}
