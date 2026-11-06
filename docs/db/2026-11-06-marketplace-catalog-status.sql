-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace catalog status migration (review-only — NOT auto-run)
--
-- Date: 2026-11-06
-- Target: Neon production database (techservice-hub)
--
-- WHY
--   Current production state (audited 2026-11-06):
--     • 7 curated services are live on the legacy catalog (isActive=true)
--       but have status='ARCHIVED', so marketplace v2 cannot see them.
--     • 12 old v2-seed services have status='PUBLISHED' but isActive=false —
--       enabling the marketplace flag today would expose those 12 stale rows
--       and hide the current 7.
--   This migration flips the 7 curated services to PUBLISHED+active and
--   archives everything else, so both catalogs agree on the same 7 services.
--
-- PRECONDITIONS
--   1. A Neon branch snapshot (or pg_dump) exists.  ← REQUIRED, no exceptions.
--   2. The slug list below matches the 7 services actually for sale.
--   3. Run while the SERVICE_MARKETPLACE_ENABLED API flag is still OFF
--      (legacy catalog keeps working throughout — isActive only flips for
--      rows that are already active/inactive as intended).
--
-- ROLLBACK
--   See the "── Rollback ──" section at the bottom (inverse UPDATE), or
--   restore the Neon branch/snapshot.
--
-- NOTE
--   Re-running `npm run db:seed` AFTER this migration re-archives the 7
--   (seed.ts marks LEGACY_SERVICE_SLUGS as ARCHIVED). Don't re-seed prod
--   after applying this.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Pre-flight checks (run each; expected results noted inline) ──────────────

-- Expect 7 rows — the curated catalog currently for sale.
SELECT slug, name, status, "isActive", "basePrice"
FROM "Service"
WHERE slug IN (
  'business-website',
  'custom-software-project',
  'it-consulting-sprint',
  'online-store',
  'pitch-deck-design',
  'product-documentation',
  'product-ui-ux-design'
)
ORDER BY slug;

-- Data guard: no zero-price service may end up PUBLISHED.
-- Expect 0 rows among the 7 slugs above (it-consultation @ ৳0 must NOT be here).
SELECT slug, "basePrice"
FROM "Service"
WHERE "basePrice" = 0
  AND slug IN (
    'business-website', 'custom-software-project', 'it-consulting-sprint',
    'online-store', 'pitch-deck-design', 'product-documentation', 'product-ui-ux-design'
  );

-- Audit the "before" state for the runbook log.
SELECT status, "isActive", count(*) FROM "Service" GROUP BY status, "isActive" ORDER BY status, "isActive";

-- ── Migration ────────────────────────────────────────────────────────────────

BEGIN;

-- Publish the 7 curated services currently sold.
UPDATE "Service"
SET status = 'PUBLISHED', "isActive" = true, "updatedAt" = now()
WHERE slug IN (
  'business-website',
  'custom-software-project',
  'it-consulting-sprint',
  'online-store',
  'pitch-deck-design',
  'product-documentation',
  'product-ui-ux-design'
);

-- Archive obsolete/duplicate rows (including the zero-price it-consultation
-- and the 12 stale v2-seed services).
UPDATE "Service"
SET status = 'ARCHIVED', "isActive" = false, "updatedAt" = now()
WHERE slug NOT IN (
  'business-website',
  'custom-software-project',
  'it-consulting-sprint',
  'online-store',
  'pitch-deck-design',
  'product-documentation',
  'product-ui-ux-design'
);

COMMIT;

-- ── Post-flight verification ─────────────────────────────────────────────────

-- Expect exactly one row: PUBLISHED | true | 7.
SELECT status, "isActive", count(*) FROM "Service" GROUP BY status, "isActive" ORDER BY status, "isActive";

-- Marketplace v2 list source of truth — expect exactly these 7 slugs,
-- all with basePrice > 0.
SELECT slug, "basePrice" FROM "Service" WHERE status = 'PUBLISHED' ORDER BY slug;

-- Legacy catalog — expect the same 7 slugs.
SELECT slug FROM "Service" WHERE "isActive" = true ORDER BY slug;

-- ── Rollback (inverse) — only if post-launch verification fails ─────────────
-- BEGIN;
-- UPDATE "Service" SET status = 'ARCHIVED', "isActive" = true,  "updatedAt" = now()
--   WHERE slug IN ('business-website','custom-software-project','it-consulting-sprint',
--                  'online-store','pitch-deck-design','product-documentation','product-ui-ux-design');
-- COMMIT;
-- (The archived rows can stay archived; the legacy catalog only needs the 7
-- back at isActive=true. A full restore = Neon branch/snapshot.)
