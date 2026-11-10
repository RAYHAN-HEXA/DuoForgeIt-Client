import type { NextFunction, Request, Response } from 'express';
import type { AccountStatus, UserRole } from '@tsh/shared';
import { ApiError } from '../utils/ApiError.js';
import { verifyBearerToken } from '../services/token.service.js';
import { prisma } from '../config/prisma.js';

/** Server-side identity: role and status are loaded from Neon on EVERY request. */
export type AuthedUser = {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  role: UserRole;
  accountStatus: AccountStatus;
  profileImage: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthedUser;
      /** Parsed request data, filled by the validate() middleware. */
      validated: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

/**
 * Verify the Firebase ID token in `Authorization: Bearer`, then load the
 * matching user from Postgres. 401 unless everything checks out.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const decoded = await verifyBearerToken(req);
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) {
      return next(
        new ApiError(401, 'PROFILE_NOT_SYNCED', 'Profile not provisioned — call POST /api/auth/sync'),
      );
    }
    if (user.accountStatus !== 'ACTIVE') {
      return next(new ApiError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended'));
    }
    // Email-verification gate — the rules layer for this stack. Google users
    // pass via the ID-token claim; OTP-verified users have the DB flag set.
    // /auth/sync deliberately doesn't run through here so the verify loop
    // (/verify-email) stays reachable for unverified accounts.
    if (!user.emailVerified && !decoded.email_verified) {
      return next(
        new ApiError(403, 'VERIFY_EMAIL_FIRST', 'Please verify your email address to continue'),
      );
    }
    req.authUser = {
      id: user.id,
      firebaseUid: user.firebaseUid!,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      accountStatus: user.accountStatus,
      profileImage: user.profileImage,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** RBAC gate for admin-only endpoints (both co-founders). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.authUser?.role !== 'ADMIN') {
    return next(new ApiError(403, 'FORBIDDEN', 'Admin access required'));
  }
  next();
}
