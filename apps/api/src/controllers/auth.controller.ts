import type { Request, Response, NextFunction } from 'express';
import type { AuthSyncInput } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { verifyBearerToken } from '../services/token.service.js';
import { syncFirebaseUser } from '../services/user-sync.service.js';
import { getProfileWithFounder } from '../services/user.service.js';
import { toPublicUser } from '../utils/mappers.js';
import { validated } from '../middleware/validate.js';

/**
 * POST /api/auth/sync
 * Called by the web app after Firebase sign-up/sign-in. Verifies the ID token
 * server-side, then creates or links the Neon profile. Idempotent.
 * An optional `registrationGrant` proves the address passed OTP verification
 * — required for a fresh sign-up to land with emailVerified: true, and the
 * remediation path for legacy unverified accounts.
 */
export async function syncProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const decoded = await verifyBearerToken(req);
    const { registrationGrant } = validated<AuthSyncInput>(req, 'body') ?? {};
    const { user, isNew } = await syncFirebaseUser({
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      displayName: decoded.name ?? null,
      photoUrl: decoded.picture ?? null,
      registrationGrant,
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
