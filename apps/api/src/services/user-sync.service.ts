import type { User } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export type FirebaseIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
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
    const user = await prisma.user.update({
      where: { id: byUid.id },
      data: {
        // verification can only move forward (true wins, never un-verifies)
        emailVerified: byUid.emailVerified || identity.emailVerified,
        ...(byUid.profileImage === null && identity.photoUrl ? { profileImage: identity.photoUrl } : {}),
      },
    });
    return { user, isNew: false };
  }

  // 2. Link path — email matches an existing row (pre-seeded admins, or a row
  // created earlier through a different Firebase provider)
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (!identity.emailVerified) {
      throw new ApiError(
        403,
        'VERIFY_EMAIL_FIRST',
        'This email is already registered. Verify your email in Firebase before it can be linked.',
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

  // 3. Create path — brand new customer
  const user = await prisma.user.create({
    data: {
      firebaseUid: identity.uid,
      email,
      fullName: identity.displayName?.trim() || email.split('@')[0]!,
      profileImage: identity.photoUrl,
      emailVerified: identity.emailVerified,
      role: 'CUSTOMER',
    },
  });
  logger.info({ userId: user.id, email }, 'New customer created from Firebase identity');
  return { user, isNew: true };
}
