import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { env, firebaseCredentialSource } from './env.js';
import { logger } from '../utils/logger.js';

let cachedApp: App | null = null;

/**
 * Lazily initialize the Firebase Admin app exactly once.
 * Returns null (instead of throwing) when no credentials are configured so the
 * API can still boot; auth endpoints then respond 503 AUTH_UNCONFIGURED.
 *
 * Credential priority:
 *  1. FIREBASE_SERVICE_ACCOUNT_BASE64 (recommended for Render/Railway)
 *  2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  3. GOOGLE_APPLICATION_CREDENTIALS path / ambient ADC (local dev)
 */
export function getFirebaseApp(): App | null {
  if (cachedApp) return cachedApp;
  const [existing] = getApps();
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }
  if (firebaseCredentialSource === 'none') {
    logger.warn('Firebase Admin not configured — auth endpoints will return 503');
    return null;
  }
  try {
    if (firebaseCredentialSource === 'base64') {
      const json = JSON.parse(
        Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'),
      ) as { client_email?: string; clientEmail?: string; private_key?: string; privateKey?: string };
      cachedApp = initializeApp({
        credential: cert({
          // service-account JSON files use snake_case; accept camelCase too
          clientEmail: json.client_email ?? json.clientEmail,
          privateKey: json.private_key ?? json.privateKey,
          projectId: env.FIREBASE_PROJECT_ID,
        }),
        projectId: env.FIREBASE_PROJECT_ID,
      });
    } else if (firebaseCredentialSource === 'cert') {
      cachedApp = initializeApp({
        credential: cert({
          clientEmail: env.FIREBASE_CLIENT_EMAIL!,
          // dotenv-style env values keep literal "\n" sequences in the key
          privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          projectId: env.FIREBASE_PROJECT_ID,
        }),
        projectId: env.FIREBASE_PROJECT_ID,
      });
    } else {
      cachedApp = initializeApp({
        credential: applicationDefault(),
        projectId: env.FIREBASE_PROJECT_ID,
      });
    }
    logger.info({ source: firebaseCredentialSource }, 'Firebase Admin initialized');
    return cachedApp;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize Firebase Admin');
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}
