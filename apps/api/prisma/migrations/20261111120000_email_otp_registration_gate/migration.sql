-- Email OTP registration gate (ADDITIVE ONLY).
--
-- Account creation now requires a 6-digit code emailed to the address first:
--   * OtpChallenge stores one hashed code per request (never the code itself).
--     A successful verify mints a single-use opaque grant token — also stored
--     hashed, with its own 15-minute expiry — that POST /auth/sync consumes to
--     set emailVerified: true. An account can therefore never exist before its
--     email was proven deliverable, and legacy unverified accounts remediate
--     through the same grant (purpose VERIFY).
--   * `attempts` locks a challenge after 5 wrong guesses (row is consumed);
--     `expiresAt` retires the code after 10 minutes. Superseded/stale rows are
--     pruned by the service.
--
-- Rollback = drop the table + enum; nothing else references them.

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'VERIFY');

-- CreateTable
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

-- CreateIndex
CREATE INDEX "OtpChallenge_email_purpose_createdAt_idx" ON "OtpChallenge"("email", "purpose", "createdAt");
