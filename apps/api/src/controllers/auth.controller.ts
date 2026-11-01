import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { verifyBearerToken } from '../services/token.service.js';
import { syncFirebaseUser } from '../services/user-sync.service.js';
import { getProfileWithFounder } from '../services/user.service.js';
import { toPublicUser } from '../utils/mappers.js';

/**
 * POST /api/auth/sync
 * Called by the web app after Firebase sign-up/sign-in. Verifies the ID token
 * server-side, then creates or links the Neon profile. Idempotent.
 */
export async function syncProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const decoded = await verifyBearerToken(req);
    const { user, isNew } = await syncFirebaseUser({
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      displayName: decoded.name ?? null,
      photoUrl: decoded.picture ?? null,
    });
    res.status(isNew ? 201 : 200).json(
      ok({
        user: toPublicUser(user),
        isNew,
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me — profile for the authenticated user (admins include founder card). */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getProfileWithFounder(req.authUser!.id);
    res.json(ok(profile));
  } catch (err) {
    next(err);
  }
}
