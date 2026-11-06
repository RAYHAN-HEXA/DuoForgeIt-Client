/**
 * One-shot migration: copy legacy Cloudinary assets into the private Vercel
 * Blob store and backfill `blobPath` on every referencing row.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Cloudinary → Blob cutover changed WHERE the API stores and serves files
 * from, but it did not (and must not) delete anything from Cloudinary. Rows
 * created before the cutover reference Cloudinary public ids
 * (`cloudinaryPublicId` / `screenshotPublicId` / `qrPublicId` /
 * `proofPublicId`) and have a NULL `blobPath`. Until this script runs:
 *   - download URLs for those rows are null (the API never signs a
 *     Cloudinary id into a Blob URL), and
 *   - the files themselves remain safe on Cloudinary, untouched.
 *
 * Cloudinary public ids in this project are already valid Blob pathnames
 * (`techservice-hub/<folder>/<userId>/<uuid>`), so each asset is copied to
 * the SAME pathname in the Blob store and `blobPath` is set to that id. No
 * Cloudinary asset is ever deleted by this script.
 *
 * USAGE (from apps/api)
 *   npx tsx scripts/migrate-cloudinary-to-blob.ts            # dry run (default)
 *   npx tsx scripts/migrate-cloudinary-to-blob.ts --apply    # copy + backfill
 *
 * REQUIRED ENV (process env or apps/api/.env — loaded directly, bypassing the
 * runtime zod schema which intentionally no longer knows Cloudinary):
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 *   BLOB_READ_WRITE_TOKEN, DATABASE_URL
 *
 * IDEMPOTENT: assets already present in the Blob store (same pathname, same
 * byte size) are skipped; rows with blobPath already set are never rewritten.
 */
import 'dotenv/config';
import * as crypto from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { head, put } from '@vercel/blob';

const APPLY = process.argv.includes('--apply');
const ROOT_PREFIX = 'techservice-hub/';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const CLOUD = requireEnv('CLOUDINARY_CLOUD_NAME');
const API_KEY = requireEnv('CLOUDINARY_API_KEY');
const API_SECRET = requireEnv('CLOUDINARY_API_SECRET');
requireEnv('BLOB_READ_WRITE_TOKEN'); // consumed by @vercel/blob via env

const prisma = new PrismaClient();

/** Cloudinary "s--SIG--" delivery signature: first 8 chars of base64url(sha1(path + secret)). */
function cloudinarySignature(pathWithType: string): string {
  return crypto
    .createHash('sha1')
    .update(pathWithType + API_SECRET)
    .digest('base64url')
    .slice(0, 8);
}

/** All Cloudinary resources under the techservice-hub/ prefix (paginated). */
async function listCloudinaryAssets(): Promise<
  Array<{ publicId: string; resourceType: string; format: string; bytes: number }>
> {
  const assets: Array<{ publicId: string; resourceType: string; format: string; bytes: number }> = [];
  let nextCursor: string | undefined;
  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUD}/resources`);
    url.searchParams.set('prefix', ROOT_PREFIX);
    url.searchParams.set('max_results', '500');
    if (nextCursor) url.searchParams.set('next_cursor', nextCursor);
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}` },
    });
    if (!res.ok) {
      throw new Error(`Cloudinary list failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      resources: Array<{ public_id: string; resource_type: string; format: string; bytes: number }>;
      next_cursor?: string;
    };
    for (const r of body.resources) {
      assets.push({ publicId: r.public_id, resourceType: r.resource_type, format: r.format, bytes: r.bytes });
    }
    nextCursor = body.next_cursor;
  } while (nextCursor);
  return assets;
}

/** Authenticated delivery URL for one Cloudinary asset. */
function cloudinaryDownloadUrl(asset: { publicId: string; resourceType: string; format: string }): string {
  const pathWithType = `${asset.resourceType}/upload/${asset.publicId}.${asset.format}`;
  const sig = cloudinarySignature(pathWithType);
  return `https://res.cloudinary.com/${CLOUD}/${pathWithType.replace(
    `${asset.resourceType}/upload/`,
    `${asset.resourceType}/upload/s--${sig}--/`,
  )}`;
}

type BackfillTarget = {
  label: string;
  ids: () => Promise<Array<{ legacyId: string }>>;
  backfill: (legacyId: string, blobPath: string) => Promise<number>;
};

const targets: BackfillTarget[] = [
  {
    label: 'OrderAttachment.cloudinaryPublicId',
    ids: () =>
      prisma.orderAttachment.findMany({ where: { blobPath: null, cloudinaryPublicId: { not: null } }, select: { cloudinaryPublicId: true } })
        .then((rows) => rows.filter((r): r is { cloudinaryPublicId: string } => r.cloudinaryPublicId !== null).map((r) => ({ legacyId: r.cloudinaryPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.orderAttachment.updateMany({ where: { cloudinaryPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'Deliverable.cloudinaryPublicId',
    ids: () =>
      prisma.deliverable.findMany({ where: { blobPath: null, cloudinaryPublicId: { not: null } }, select: { cloudinaryPublicId: true } })
        .then((rows) => rows.filter((r): r is { cloudinaryPublicId: string } => r.cloudinaryPublicId !== null).map((r) => ({ legacyId: r.cloudinaryPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.deliverable.updateMany({ where: { cloudinaryPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'Payment.screenshotPublicId',
    ids: () =>
      prisma.payment.findMany({ where: { blobPath: null, screenshotPublicId: { not: null } }, select: { screenshotPublicId: true } })
        .then((rows) => rows.filter((r): r is { screenshotPublicId: string } => r.screenshotPublicId !== null).map((r) => ({ legacyId: r.screenshotPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.payment.updateMany({ where: { screenshotPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'PaymentAccount.qrPublicId',
    ids: () =>
      prisma.paymentAccount.findMany({ where: { blobPath: null, qrPublicId: { not: null } }, select: { qrPublicId: true } })
        .then((rows) => rows.filter((r): r is { qrPublicId: string } => r.qrPublicId !== null).map((r) => ({ legacyId: r.qrPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.paymentAccount.updateMany({ where: { qrPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'DepositRequest.screenshotPublicId',
    ids: () =>
      prisma.depositRequest.findMany({ where: { blobPath: null, screenshotPublicId: { not: null } }, select: { screenshotPublicId: true } })
        .then((rows) => rows.filter((r): r is { screenshotPublicId: string } => r.screenshotPublicId !== null).map((r) => ({ legacyId: r.screenshotPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.depositRequest.updateMany({ where: { screenshotPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'WithdrawalRequest.proofPublicId',
    ids: () =>
      prisma.withdrawalRequest.findMany({ where: { blobPath: null, proofPublicId: { not: null } }, select: { proofPublicId: true } })
        .then((rows) => rows.filter((r): r is { proofPublicId: string } => r.proofPublicId !== null).map((r) => ({ legacyId: r.proofPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.withdrawalRequest.updateMany({ where: { proofPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
  {
    label: 'PaymentMethodConfig.qrPublicId',
    ids: () =>
      prisma.paymentMethodConfig.findMany({ where: { blobPath: null, qrPublicId: { not: null } }, select: { qrPublicId: true } })
        .then((rows) => rows.filter((r): r is { qrPublicId: string } => r.qrPublicId !== null).map((r) => ({ legacyId: r.qrPublicId }))),
    backfill: (legacyId, blobPath) =>
      prisma.paymentMethodConfig.updateMany({ where: { qrPublicId: legacyId, blobPath: null }, data: { blobPath } }).then((r) => r.count),
  },
];

async function main(): Promise<void> {
  console.log(`Cloudinary → Blob migration — ${APPLY ? 'APPLY' : 'DRY RUN'} mode`);
  console.log(`Cloud: ${CLOUD} (assets are NEVER deleted from Cloudinary)`);

  // Collect every legacy id the database still references.
  const needed = new Map<string, string[]>(); // legacyId → target labels
  for (const target of targets) {
    const rows = await target.ids();
    for (const { legacyId } of rows) {
      const labels = needed.get(legacyId) ?? [];
      labels.push(target.label);
      needed.set(legacyId, labels);
    }
  }

  const dbIds = [...needed.keys()];
  console.log(`\nLegacy rows awaiting migration: ${dbIds.length} distinct asset reference(s)`);

  if (dbIds.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // Sanity: every referenced id must stay inside the project namespace — the
  // signed download URL and the Blob pathname are both derived from it.
  const foreign = dbIds.filter((id) => !id.startsWith(ROOT_PREFIX));
  if (foreign.length > 0) {
    console.error(`\nREFUSING: ${foreign.length} reference(s) outside ${ROOT_PREFIX}:`);
    for (const id of foreign.slice(0, 10)) console.error(`  - ${id}`);
    console.error('Resolve these rows manually before running the migration.');
    process.exit(1);
  }

  // Map Cloudinary assets by id (only those the DB actually references).
  console.log('\nListing Cloudinary assets under techservice-hub/ …');
  const cloudAssets = new Map((await listCloudinaryAssets()).map((a) => [a.publicId, a]));

  const missing = dbIds.filter((id) => !cloudAssets.has(id));
  if (missing.length > 0) {
    console.warn(`\nWARNING: ${missing.length} referenced asset(s) NOT found on Cloudinary:`);
    for (const id of missing.slice(0, 10)) console.warn(`  - ${id} (referenced by ${needed.get(id)!.join(', ')})`);
    console.warn('Those rows will keep blobPath = null (no dead links are created).');
  }

  let copied = 0;
  let skippedExisting = 0;
  let backfilledRows = 0;

  for (const id of dbIds) {
    const asset = cloudAssets.get(id);
    if (!asset) continue;

    const already = await head(id).then(
      () => true,
      () => false,
    );
    if (already) {
      const meta = await head(id);
      if (meta.size === asset.bytes) {
        console.log(`  = exists  ${id}`);
        skippedExisting++;
      } else {
        console.warn(`  ! size mismatch on Blob (${meta.size}) vs Cloudinary (${asset.bytes}) for ${id} — re-copying`);
        if (!APPLY) continue;
        await copyAsset(id, asset);
        copied++;
      }
    } else {
      console.log(`  + copy    ${id} (${asset.bytes} bytes, ${asset.resourceType}/${asset.format})`);
      if (!APPLY) continue;
      await copyAsset(id, asset);
      copied++;
    }

    if (APPLY) {
      for (const target of targets.filter((t) => needed.get(id)!.includes(t.label))) {
        backfilledRows += await target.backfill(id, id);
      }
    }
  }

  console.log(`\nSummary: ${copied} copied, ${skippedExisting} already present, ${backfilledRows} row(s) backfilled.`);
  if (!APPLY) console.log('Dry run only — re-run with --apply to execute.');
}

async function copyAsset(id: string, asset: { bytes: number; format: string; resourceType: string }): Promise<void> {
  const url = cloudinaryDownloadUrl(asset);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cloudinary download failed (${res.status}) for ${id}: ${await res.text()}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length !== asset.bytes) {
    throw new Error(`Byte count mismatch for ${id}: got ${buffer.length}, expected ${asset.bytes}`);
  }
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  await put(id, buffer, { access: 'private', contentType });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
