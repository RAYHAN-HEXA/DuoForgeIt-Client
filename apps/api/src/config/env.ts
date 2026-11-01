import { z } from 'zod';

/**
 * Environment contract — parsed once at boot, fails fast on bad values.
 * Loaded from apps/api/.env by server.ts (`import 'dotenv/config'`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.string().default('info'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Optional at boot so the API can start before Neon/Firebase are wired;
  // health reports the gaps and auth endpoints return 503 until configured.
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),

  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),

  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration → ${issues}`);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const hasDatabase = Boolean(env.DATABASE_URL);

export type FirebaseCredentialSource = 'base64' | 'cert' | 'adc' | 'none';
export const firebaseCredentialSource: FirebaseCredentialSource =
  env.FIREBASE_SERVICE_ACCOUNT_BASE64 && env.FIREBASE_PROJECT_ID
    ? 'base64'
    : env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY && env.FIREBASE_PROJECT_ID
      ? 'cert'
      : env.GOOGLE_APPLICATION_CREDENTIALS && env.FIREBASE_PROJECT_ID
        ? 'adc'
        : 'none';

export const hasCloudinary = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
