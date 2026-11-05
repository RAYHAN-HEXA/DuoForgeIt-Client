-- Manual-payments v2 (Stage 1) — ADDITIVE ONLY.
--
-- What this migration does, in dependency order:
--   1. Adds 'OTHER' to the PaymentMethod enum (Postgres 12+/Neon permits
--      ADD VALUE inside a transaction while the value is unused in it —
--      satisfied: nothing writes OTHER here).
--   2. Creates the PaymentAccount table (admin-managed receiving accounts).
--   3. Adds nullable v2 columns + FKs to Payment (legacy rows stay null).
--   4. Backfills transactionIdNormalized for ALL legacy rows that have a raw
--      transactionId (normalization: trim/strip internal whitespace/uppercase).
--      NO demotion, NO status rewrites, NO deletions — per the approved
--      Part 3.1-as-corrected-by-Part-4 §6.2 strategy.
--   5. Backfills Order.amountPaid/paymentStatus ONLY for rows where both are
--      NULL (NULL/NULL case). Non-null historical values are authoritative and
--      never overwritten; any other combination must be reconciled manually
--      via the reconciliation report below BEFORE deploying.
--   6. Creates the two partial unique indexes LAST (they depend on the
--      backfills; a dirty dataset fails the index creation loudly — that is
--      the designed stop signal, not a bug).
--
-- ⚠️ PRE-DEPLOY GATES (run against production as READ-ONLY SELECTs before
-- `prisma migrate deploy`; if either returns rows, STOP and resolve manually
-- with explicit approval — see the commented ops SQL at the bottom):
--   GATE A: pre-migration TrxID conflict report     (§ OPS-1)
--   GATE B: duplicate active payments per order     (§ OPS-2)

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "methodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountType" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "instructions" TEXT,
    "qrPublicId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAccount_isActive_displayOrder_idx" ON "PaymentAccount"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "PaymentAccount_methodKey_idx" ON "PaymentAccount"("methodKey");

-- AlterTable (manual-payments v2 columns — all nullable)
ALTER TABLE "Payment" ADD COLUMN "paymentAccountId" TEXT,
    ADD COLUMN "methodKeySnapshot" TEXT,
    ADD COLUMN "methodLabelSnapshot" TEXT,
    ADD COLUMN "accountTypeSnapshot" TEXT,
    ADD COLUMN "accountNumberSnapshot" TEXT,
    ADD COLUMN "accountHolderSnapshot" TEXT,
    ADD COLUMN "instructionsSnapshot" TEXT,
    ADD COLUMN "senderNumber" TEXT,
    ADD COLUMN "transactionIdNormalized" TEXT,
    ADD COLUMN "rejectedById" TEXT,
    ADD COLUMN "rejectedAt" TIMESTAMP(3),
    ADD COLUMN "rejectionReason" TEXT;

-- AddForeignKey (RESTRICT: referenced accounts cannot be deleted — disable instead)
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (plain — serves admin TrxID search incl. rejected rows)
CREATE INDEX "Payment_transactionIdNormalized_idx" ON "Payment"("transactionIdNormalized");

-- Backfill: normalize every legacy TrxID (raw transactionId is preserved
-- untouched; this only fills the new dedupe column). Idempotent.
UPDATE "Payment"
SET "transactionIdNormalized" = upper(regexp_replace("transactionId", '\s+', '', 'g'))
WHERE "transactionId" IS NOT NULL
  AND "transactionIdNormalized" IS NULL;

-- Accounting backfill — NULL/NULL case only (verifiedPaidAmount = Σ VERIFIED).
-- Exact DECIMAL(12,2) arithmetic inside Postgres; no floating point.
-- Idempotent: guards make re-runs and non-null rows no-ops.
UPDATE "Order" o
SET
  "amountPaid" = s.paid,
  "paymentStatus" = CASE
    WHEN s.paid >= o."totalAmount" THEN 'PAID'::"OrderPaymentStatus"
    ELSE o."paymentStatus"
  END
FROM (
  SELECT "orderId", SUM("amount") AS paid
  FROM "Payment"
  WHERE status = 'VERIFIED'
  GROUP BY "orderId"
) s
WHERE o.id = s."orderId"
  AND o."amountPaid" IS NULL
  AND o."paymentStatus" IS NULL;

-- Partial unique indexes — LAST; the backfills above must have run cleanly.
-- A unique-violation here means dirty legacy data: STOP, run the ops reports,
-- resolve manually with explicit approval, then re-run the index statements.

-- Exactly one live submission attempt per order
CREATE UNIQUE INDEX "payment_one_active_submission_per_order"
  ON "Payment"("orderId")
  WHERE "status" IN ('PENDING', 'SUBMITTED');

-- A TrxID can back at most one non-rejected payment, globally
-- (REJECTED is the only state that frees a TrxID for resubmission).
CREATE UNIQUE INDEX "payment_trxid_active_unique"
  ON "Payment"("transactionIdNormalized")
  WHERE "transactionIdNormalized" IS NOT NULL
    AND "status" IN ('PENDING', 'SUBMITTED', 'VERIFIED', 'REFUNDED');

-- ═══════════════════════════════════════════════════════════════════════
-- OPS SQL — comment blocks only; NEVER executed by prisma migrate deploy.
-- Run manually (read-only) against the target database as documented.
-- ═══════════════════════════════════════════════════════════════════════

-- § OPS-1 · GATE A — pre-migration TrxID conflict report (BEFORE deploy).
-- Expected: 0 rows. Any row = STOP migration; report every affected record
-- and wait for an explicitly approved manual resolution.
--
-- SELECT upper(regexp_replace("transactionId", '\s+', '', 'g')) AS normalized_trxid,
--        count(*)                                            AS rows_involved,
--        array_agg(id     ORDER BY "createdAt" ASC, id ASC)  AS row_ids,
--        array_agg(status ORDER BY "createdAt" ASC, id ASC)  AS row_statuses,
--        array_agg(to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS')
--                  ORDER BY "createdAt" ASC, id ASC)         AS row_created_at
-- FROM "Payment"
-- WHERE "transactionId" IS NOT NULL
-- GROUP BY 1
-- HAVING count(*) FILTER (WHERE status <> 'REJECTED') > 1
-- ORDER BY rows_involved DESC, normalized_trxid;

-- § OPS-2 · GATE B — duplicate live submissions per order (BEFORE deploy).
-- Expected: 0 rows. Any row = STOP; the one-active-per-order index would fail.
--
-- SELECT "orderId", count(*) AS active_payments,
--        array_agg(id     ORDER BY "createdAt" ASC, id ASC) AS row_ids,
--        array_agg(status ORDER BY "createdAt" ASC, id ASC) AS row_statuses
-- FROM "Payment"
-- WHERE "status" IN ('PENDING', 'SUBMITTED')
-- GROUP BY "orderId"
-- HAVING count(*) > 1;

-- § OPS-3 · Accounting reconciliation matrix (BEFORE deploy; informational).
-- The migration only writes the NULL/NULL bucket. Any NON-NULL bucket with
-- rows must be reconciled manually with explicit approval before deploy.
--
-- SELECT
--   CASE WHEN o."amountPaid" IS NULL THEN 'NULL' ELSE 'NON-NULL' END   AS amount_paid_state,
--   COALESCE(o."paymentStatus"::text, 'NULL')                          AS payment_status_state,
--   count(*)                                                           AS orders,
--   count(*) FILTER (WHERE s.paid IS NOT NULL
--                      AND o."amountPaid" IS DISTINCT FROM s.paid)     AS inconsistent_with_aggregate
-- FROM "Order" o
-- LEFT JOIN (
--   SELECT "orderId", SUM("amount") AS paid FROM "Payment"
--   WHERE status = 'VERIFIED' GROUP BY "orderId"
-- ) s ON s."orderId" = o.id
-- GROUP BY 1, 2
-- ORDER BY 1, 2;

-- § OPS-4 · Post-migration verification — all expected to return 0 rows.
--
-- (a) duplicate live submissions per order (index A invariant):
-- SELECT "orderId", count(*) FROM "Payment"
-- WHERE "status" IN ('PENDING', 'SUBMITTED') GROUP BY "orderId" HAVING count(*) > 1;
--
-- (b) duplicate normalized TrxIDs inside the unique predicate (index B invariant):
-- SELECT "transactionIdNormalized", count(*) FROM "Payment"
-- WHERE "transactionIdNormalized" IS NOT NULL
--   AND "status" IN ('PENDING', 'SUBMITTED', 'VERIFIED', 'REFUNDED')
-- GROUP BY 1 HAVING count(*) > 1;
--
-- (c) eligible rows still missing a normalized TrxID (backfill completeness):
-- SELECT id, "transactionId" FROM "Payment"
-- WHERE "transactionId" IS NOT NULL AND "transactionIdNormalized" IS NULL;
--
-- (d) stored amountPaid vs recomputed VERIFIED aggregate:
-- SELECT o.id, o."amountPaid" AS stored_paid, s.paid AS recomputed
-- FROM "Order" o
-- JOIN (SELECT "orderId", SUM("amount") AS paid FROM "Payment"
--       WHERE status = 'VERIFIED' GROUP BY "orderId") s ON s."orderId" = o.id
-- WHERE o."amountPaid" IS DISTINCT FROM s.paid;
--
-- (e) paymentStatus consistency (PAID iff fully covered, where set):
-- SELECT o.id, o."amountPaid", o."totalAmount", o."paymentStatus"
-- FROM "Order" o
-- WHERE o."paymentStatus" = 'PAID' AND o."amountPaid" < o."totalAmount";
--
-- (f) FK integrity — payments pointing at a missing account (must be none):
-- SELECT p.id FROM "Payment" p
-- LEFT JOIN "PaymentAccount" a ON a.id = p."paymentAccountId"
-- WHERE p."paymentAccountId" IS NOT NULL AND a.id IS NULL;
--
-- (g) index presence (expect the two partial unique indexes):
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'Payment'
--   AND indexname IN ('payment_one_active_submission_per_order', 'payment_trxid_active_unique');
