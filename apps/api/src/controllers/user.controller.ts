import type { Request, Response, NextFunction } from 'express';
import type { ProfileUpdate } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { getProfileWithFounder, updateOwnProfile } from '../services/user.service.js';

/** GET /api/users/me */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await getProfileWithFounder(req.authUser!.id)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/users/me — body validated by profileUpdateSchema in the route. */
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = validated<ProfileUpdate>(req, 'body');
    res.json(ok({ user: await updateOwnProfile(req.authUser!.id, patch) }));
  } catch (err) {
    next(err);
  }
}
