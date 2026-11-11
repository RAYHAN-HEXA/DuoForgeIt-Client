-- Manual-apply for migration 20261111120000_email_otp_registration_gate.
--
-- APPLIED 2026-11-11 08:38 UTC (registration had been 500ing with INTERNAL
-- since the OTP deploy): statement-for-statement over Neon's SQL-over-HTTPS
-- proxy from the 5432-blocked dev machine — see docs/DEPLOYMENT.md
-- "When 5432 is blocked but 443 works". Kept as the template for any future
-- additive migration that must land without CLI access.
--
-- WHY THIS EXISTS: the local network black-holes Neon's data plane, so
-- `prisma migrate deploy` can't reach the database. This script applies the
-- exact same DDL plus the `_prisma_migrations` bookkeeping row (what
-- `prisma migrate resolve --applied` would write), paste-and-run in the
-- Neon Console SQL Editor instead.
--
-- IDEMPOTENT: safe to run twice — every statement is guarded.

-- ── DDL (mirrors prisma/migrations/20261111120000_email_otp_registration_gate/migration.sql) ──

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OtpPurpose') THEN
    CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'VERIFY');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."OtpChallenge"') IS NULL THEN
    CREATE TABLE "OtpChallenge" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "purpose" "OtpPurpose" NOT NULL,
      "codeHash" TEXT NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "consumedAt" TIMESTAMP(3),
      "grantHash" TEXT,
      "grantExpiresAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'OtpChallenge_email_purpose_createdAt_idx'
  ) THEN
    CREATE INDEX "OtpChallenge_email_purpose_createdAt_idx"
      ON "OtpChallenge"("email", "purpose", "createdAt");
  END IF;
END $$;

-- ── Prisma bookkeeping (checksum = sha256 of the real migration.sql file,
--    identical to what `prisma migrate resolve --applied` records) ──

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
SELECT gen_random_uuid()::text,
       '08dac86e14f0e8c295ae27df070cf64d35627aa30c22a9373837e5832ec1431f',
       now(),
       '20261111120000_email_otp_registration_gate',
       now(),
       1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations"
  WHERE migration_name = '20261111120000_email_otp_registration_gate'
);

-- ── Verification: expect the bookkeeping row; otp_challenge_rows may be 0 ──

SELECT count(*) AS otp_challenge_rows FROM "OtpChallenge";
SELECT migration_name, checksum, applied_steps_count, finished_at
FROM "_prisma_migrations"
WHERE migration_name = '20261111120000_email_otp_registration_gate';
