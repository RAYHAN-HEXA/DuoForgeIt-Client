import { getSignedUploadUrl } from '../utils/blob.js';
import { env } from '../config/env.js';

/**
 * POST /api/uploads/sign — return a signed upload URL for Vercel Blob.
 * The client will POST the file directly to the blob URL.
 */
export async function sign(req: Request, res: Response, next: NextFunction) {
  try {
    await uploadRateLimiter(req, res, async () => {
      const { folder } = validated<{ folder: string }>(req, 'body');
      // Generate a unique file key using folder and a UUID.
      const fileKey = `${folder}/${crypto.randomUUID()}`;
      const { uploadUrl } = await getSignedUploadUrl(fileKey);
      res.json(ok({ uploadUrl, fileKey }));
    });
  } catch (err) {
    next(err);
  }
}
