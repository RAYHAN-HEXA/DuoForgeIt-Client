-- Blob-storage cutover (Vercel Blob, all objects PRIVATE) — ADDITIVE ONLY.
--
-- What this migration does:
--   1. Adds a nullable `blobPath` column to every model that stores a file
--      reference (OrderAttachment, Deliverable, Payment, PaymentAccount,
--      DepositRequest, WithdrawalRequest, PaymentMethodConfig). New rows are
--      written by the API with a server-minted, user-scoped private Blob
--      pathname; legacy rows keep their Cloudinary references untouched.
--   2. Relaxes `cloudinaryPublicId` to nullable on OrderAttachment and
--      Deliverable so new rows only need `blobPath`. Existing NOT NULL data
--      is untouched — DROP NOT NULL can never lose data.
--
-- NO data is deleted, renamed or rewritten. Cloudinary assets and the legacy
-- `*PublicId` columns remain exactly as they are, so the one-shot asset
-- migration (apps/api/scripts/migrate-cloudinary-to-blob.ts) can copy each
-- legacy asset into the Blob store and backfill `blobPath` afterwards.
-- Rollback = drop the added columns; nothing else depends on them.

-- AlterTable (new private-Blob pathname columns)
ALTER TABLE "OrderAttachment" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "Payment" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "PaymentMethodConfig" ADD COLUMN "blobPath" TEXT;

-- AlterColumn (relax legacy Cloudinary columns; additive-safe, no data touch)
ALTER TABLE "OrderAttachment" ALTER COLUMN "cloudinaryPublicId" DROP NOT NULL;
ALTER TABLE "Deliverable" ALTER COLUMN "cloudinaryPublicId" DROP NOT NULL;
