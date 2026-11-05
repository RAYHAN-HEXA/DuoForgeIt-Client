import { z } from 'zod';

/**
 * Environment contract — parsed once at boot, fails fast on bad values.
 * Loaded from apps/api/.env by server.ts (`import 'dotenv/config'`).
 */
const envSchema = z.object({
  // Cloudinary security feature flags
  ENABLE_CLOUDINARY_AUTH: z.string().default('false'),
  CLOUDINARY_AUTH_GRACE: z.string().default('false'),
  CLOUDINARY_AUTH_UPLOAD_PRESET: z.string().optional(),
  // Upstash Redis placeholders for development
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
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
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),

  // Founder email alerts (order placed / TrxID submitted); comma-separated.
  FOUNDER_NOTIFY_EMAILS: z.string().min(1).optional(),
  ADMIN_PANEL_URL: z.string().min(1).optional(),

  // Feature flags — exactly the string 'true' enables; anything else (including
  // unset) keeps legacy behaviour. Marketplace routes/pages are gated on these.
  SERVICE_MARKETPLACE_ENABLED: z.string().default('false'),
  WALLET_ENABLED: z.string().default('false'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration → ${issues}`);
}

export const env = parsed.data;

// Feature flag to enable Cloudinary authenticated delivery (default: false)
export const ENABLE_CLOUDINARY_AUTH = env.ENABLE_CLOUDINARY_AUTH === 'true';

// Grace period flag – when true, both legacy and authenticated URLs are accepted during migration.
export const CLOUDINARY_AUTH_GRACE = env.CLOUDINARY_AUTH_GRACE === 'true';

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

export const serviceMarketplaceEnabled = env.SERVICE_MARKETPLACE_ENABLED === 'true';
export const walletEnabled = env.WALLET_ENABLED === 'true';
