import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { ApiError } from '../utils/ApiError.js';
import { getFirebaseAuth } from '../config/firebase.js';

/**
 * Extract and verify the Firebase ID token from the Authorization header.
 * Roles/claims inside the token are informational only — authorization is
 * always resolved from Neon by the auth middleware.
 */
export async function verifyBearerToken(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    throw ApiError.unavailable('Authentication is not configured on the server', 'AUTH_UNCONFIGURED');
  }
  try {
    return await firebaseAuth.verifyIdToken(header.slice('Bearer '.length), false);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token', 'INVALID_TOKEN');
  }
}
