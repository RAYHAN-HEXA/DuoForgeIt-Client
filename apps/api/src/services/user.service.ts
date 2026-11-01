import type { ProfileUpdate } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { toPublicUser } from '../utils/mappers.js';

/** Full profile for GET /api/auth/me and GET /api/users/me. */
export async function getProfileWithFounder(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { founderProfile: true },
  });
  if (!user) throw ApiError.notFound('User not found');
  return {
    user: toPublicUser(user),
    founderProfile: user.founderProfile
      ? {
          id: user.founderProfile.id,
          displayName: user.founderProfile.displayName,
          title: user.founderProfile.title,
          discipline: user.founderProfile.discipline,
        }
      : null,
  };
}

/**
 * Profile fields a user may change themselves. Note what is NOT here:
 * email (Firebase-owned), role, accountStatus, firebaseUid.
 */
export async function updateOwnProfile(userId: string, patch: ProfileUpdate) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
      ...(patch.profileImage !== undefined ? { profileImage: patch.profileImage } : {}),
    },
  });
  return toPublicUser(user);
}
