import type { User } from '../generated/prisma/client.js';
import { isDisposableEmailDomain } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { consumeGrant } from './otp.service.js';

export type FirebaseIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  /**
   * One-time token from POST /auth/otp/verify proving the address was OTP
   * verified. REGISTER grants let a new account land verified; VERIFY grants
   * flip the flag for legacy unverified accounts.
   */
  registrationGrant?: string;
};

export type SyncResult = { user: User; isNew: boolean };

/**
 * Reconcile a verified Firebase identity with a Neon user row.
 *
 * 1. Fast path — user already linked by firebaseUid: refresh verification
 *    flags/photo, return.
 * 2. Link path — an existing row matches the Firebase *verified* email
 *    (e.g. admins pre-seeded with `firebaseUid: null`): claim it inside a
 *    transaction, never creating a duplicate.
 * 3. Create path — brand-new customer (role CUSTOMER, never anything else —
 *    roles are only ever changed server-side via scripts/ or admin tooling).
 */
export async function syncFirebaseUser(identity: FirebaseIdentity): Promise<SyncResult> {
  const email = identity.email?.toLowerCase().trim() ?? null;
  if (!email) {
    throw ApiError.badRequest(
      'Your Firebase account has no email address. Use a sign-in method that provides one.',
      'FIREBASE_ACCOUNT_MISSING_EMAIL',
    );
  }

  // 1. Fast path
  const byUid = await prisma.user.findUnique({ where: { firebaseUid: identity.uid } });
  if (byUid) {
    // A grant is the OTP proof: VERIFY remediates legacy accounts, REGISTER
    // covers the race where the client's onAuthStateChanged sync (no grant)
    // reaches the server before the registration flow's grant-carrying sync
    // and creates the row first. Grants are single-use, so a consumed proof
    // can never flip twice; an absent grant consumes nothing.
    const grantVerified =
      !byUid.emailVerified &&
      identity.registrationGrant != null &&
      ((await consumeGrant(byUid.email, 'VERIFY', identity.registrationGrant)) ||
        (await consumeGrant(byUid.email, 'REGISTER', identity.registrationGrant)));
    const user = await prisma.user.update({
      where: { id: byUid.id },
      data: {
        // verification can only move forward (true wins, never un-verifies)
        emailVerified: byUid.emailVerified || identity.emailVerified || grantVerified,
        ...(byUid.profileImage === null && identity.photoUrl ? { profileImage: identity.photoUrl } : {}),
      },
    });
    if (grantVerified) {
      logger.info({ userId: user.id, email }, 'emailVerified flipped via OTP grant');
    }
    return { user, isNew: false };
  }

  // 2. Link path — email matches an existing row (pre-seeded admins, or a row
  // created earlier through a different Firebase provider)
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    // Same proof rule as everywhere else: the Firebase token's verified claim
    // OR a consumed OTP grant. The grant is what lets a pre-seeded (uid-less)
    // admin claim their row after the OTP-gated registration — Firebase-side
    // verification no longer exists in the flow.
    const grantVerified =
      !identity.emailVerified &&
      identity.registrationGrant != null &&
      ((await consumeGrant(email, 'REGISTER', identity.registrationGrant)) ||
        (await consumeGrant(email, 'VERIFY', identity.registrationGrant)));
    if (!identity.emailVerified && !grantVerified) {
      throw new ApiError(
        403,
        'VERIFY_EMAIL_FIRST',
        'This email is already registered — finish the emailed-code verification to link it.',
      );
    }
    if (byEmail.firebaseUid && byEmail.firebaseUid !== identity.uid) {
      throw ApiError.conflict(
        'This email is already linked to a different account.',
        'EMAIL_LINKED_TO_DIFFERENT_UID',
      );
    }
    const user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.user.update({
        where: { id: byEmail.id },
        data: {
          firebaseUid: identity.uid,
          emailVerified: true,
          ...(byEmail.profileImage === null && identity.photoUrl
            ? { profileImage: identity.photoUrl }
            : {}),
        },
      });
      logger.info({ userId: claimed.id, email }, 'Existing user linked to Firebase uid');
      return claimed;
    });
    return { user, isNew: false };
  }

  // 3. Create path — brand new customer. The OTP gate means the Firebase
  // account only exists after the code was verified, so the grant must be
  // presented and consumed here (defense-in-depth: server-side checks for
  // disposable domains even if the client schema was bypassed).
  const domain = email.split('@')[1] ?? '';
  if (isDisposableEmailDomain(domain)) {
    throw new ApiError(
      403,
      'DISPOSABLE_EMAIL_REJECTED',
      "This email provider isn't accepted — please use a permanent email address",
    );
  }
  const grantVerified = await consumeGrant(email, 'REGISTER', identity.registrationGrant);
  const user = await prisma.user.create({
    data: {
      firebaseUid: identity.uid,
      email,
      fullName: identity.displayName?.trim() || email.split('@')[0]!,
      profileImage: identity.photoUrl,
      emailVerified: identity.emailVerified || grantVerified,
      role: 'CUSTOMER',
    },
  });
  logger.info(
    { userId: user.id, email, viaGrant: grantVerified },
    'New customer created from Firebase identity',
  );
  return { user, isNew: true };
}
