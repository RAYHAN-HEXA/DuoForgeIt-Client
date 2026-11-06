import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { assertOwnedPathname, assertStoredBlob } from '../utils/blob.js';
import {
  buildRequestAnswersSchema,
  formFieldValidationSchema,
  buildOrderNumber,
  MARKETPLACE_UPLOAD_LIMITS,
  type MarketplaceCategoryDto,
  type MarketplaceListQuery,
  type MarketplacePackageDto,
  type MarketplaceServiceCardDto,
  type MarketplaceServiceDetailDto,
  type Paginated,
  type RequestFileRegister,
  type ServiceRequestCreate,
} from '@tsh/shared';
import { notifyUser } from './notification.service.js';
import { notifyFounders, emailShell } from './mail.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Public marketplace-v2 catalog queries. Every query filters status=PUBLISHED —
 * DRAFT/UNPUBLISHED/ARCHIVED services (including the archived legacy catalog)
 * are never visible here. These endpoints do not touch `isActive`, which
 * belongs to the legacy catalog pages.
 */

// ─── JSON column coercion (bad admin data degrades to empty, never crashes) ──

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toFaqArray(value: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is { q: string; a?: unknown } => {
      return Boolean(v) && typeof v === 'object' && typeof (v as Record<string, unknown>).q === 'string';
    })
    .map((v) => ({ q: v.q, a: typeof v.a === 'string' ? v.a : '' }));
}

function toPackageDtos(
  options: Array<{
    id: string;
    kind: string | null;
    label: string;
    description: string | null;
    priceFrom: Prisma.Decimal | null;
    priceTo: Prisma.Decimal | null;
    displayOrder: number;
  }>,
): MarketplacePackageDto[] {
  return [...options]
    .filter((o) => o.kind === 'PACKAGE' || o.kind === 'ADDON')
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((o) => ({
      id: o.id,
      kind: o.kind as 'PACKAGE' | 'ADDON',
      label: o.label,
      description: o.description,
      priceFrom: o.priceFrom?.toString() ?? null,
      priceTo: o.priceTo?.toString() ?? null,
    }));
}

// ─── Categories ──────────────────────────────────────────────

export async function listCategories(): Promise<MarketplaceCategoryDto[]> {
  // Only categories that actually contain published services surface.
  const [categories, counts] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { services: { some: { status: 'PUBLISHED' } } },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, slug: true, name: true, description: true, iconKey: true },
    }),
    prisma.service.groupBy({
      by: ['categoryId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    }),
  ]);
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconKey: c.iconKey,
    serviceCount: countByCategory.get(c.id) ?? 0,
  }));
}

// ─── Services ────────────────────────────────────────────────

const cardInclude = {
  category: { select: { slug: true, name: true, iconKey: true } },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof cardInclude }>;

function toCardDto(service: ServiceRow): MarketplaceServiceCardDto {
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    tagline: service.tagline,
    description: service.description,
    serviceType: service.serviceType as MarketplaceServiceCardDto['serviceType'],
    pricingModel: service.pricingModel as MarketplaceServiceCardDto['pricingModel'],
    basePrice: service.basePrice.toString(),
    priceFrom: service.priceFrom?.toString() ?? null,
    priceTo: service.priceTo?.toString() ?? null,
    priceNote: service.priceNote,
    deliveryEstimateText: service.deliveryEstimateText,
    thumbnail: service.thumbnail,
    imageUrl: service.imageUrl,
    isFeatured: service.isFeatured,
    isPopular: service.isPopular,
    updatedAt: service.updatedAt.toISOString(),
    category: service.category,
  };
}

const PRICED_MODELS = ['FIXED', 'STARTING_FROM', 'RANGE'] as const;

function buildWhere(query: MarketplaceListQuery): Prisma.ServiceWhereInput {
  const where: Prisma.ServiceWhereInput = { status: 'PUBLISHED' };
  if (query.category) where.category = { slug: query.category };
  if (query.serviceType) where.serviceType = query.serviceType;
  if (query.badge === 'popular') where.isPopular = true;
  if (query.badge === 'featured') where.isFeatured = true;
  if (query.pricing === 'priced') {
    where.pricingModel = { in: [...PRICED_MODELS] };
  } else if (query.pricing) {
    where.pricingModel = query.pricing;
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { tagline: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

function buildOrderBy(query: MarketplaceListQuery): Prisma.ServiceOrderByWithRelationInput[] {
  switch (query.sort) {
    case 'price_asc':
      return [{ priceFrom: { sort: 'asc', nulls: 'last' } }, { displayOrder: 'asc' }];
    case 'price_desc':
      return [{ priceFrom: { sort: 'desc', nulls: 'last' } }, { displayOrder: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'popular':
    default:
      return [{ isPopular: 'desc' }, { isFeatured: 'desc' }, { displayOrder: 'asc' }];
  }
}

export async function listServices(query: MarketplaceListQuery): Promise<Paginated<MarketplaceServiceCardDto>> {
  const where = buildWhere(query);
  const [rows, total] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy: buildOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: cardInclude,
    }),
    prisma.service.count({ where }),
  ]);
  return {
    items: rows.map(toCardDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getServiceBySlug(slug: string): Promise<MarketplaceServiceDetailDto> {
  const service = await prisma.service.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      ...cardInclude,
      options: {
        where: { kind: { not: null }, isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          kind: true,
          label: true,
          description: true,
          priceFrom: true,
          priceTo: true,
          displayOrder: true,
        },
      },
    },
  });
  if (!service) throw ApiError.notFound('Service not found');

  const packages = toPackageDtos(service.options);
  return {
    ...toCardDto(service),
    features: toStringArray(service.features),
    deliverables: toStringArray(service.deliverables),
    requirementsText: service.requirementsText,
    acceptedFileTypes: toStringArray(service.acceptedFileTypes),
    revisionPolicy: service.revisionPolicy,
    faqs: toFaqArray(service.faqs),
    packages: packages.filter((p) => p.kind === 'PACKAGE'),
    addOns: packages.filter((p) => p.kind === 'ADDON'),
  };
}

/** Form-field definitions for the request form (consumed by the M4 flow). */
export async function getServiceForm(slug: string) {
  const service = await prisma.service.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      id: true,
      slug: true,
      name: true,
      serviceType: true,
      formFields: {
        orderBy: { displayOrder: 'asc' },
        select: {
          key: true,
          label: true,
          type: true,
          options: true,
          required: true,
          validation: true,
          helpText: true,
        },
      },
    },
  });
  if (!service) throw ApiError.notFound('Service not found');
  return {
    service: {
      id: service.id,
      slug: service.slug,
      name: service.name,
      isRepair: service.serviceType === 'PC_REPAIR',
    },
    fields: service.formFields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: toStringArray(f.options),
      required: f.required,
      validation: (f.validation as Record<string, unknown> | null) ?? null,
      helpText: f.helpText,
    })),
  };
}

// ─── Request file uploads ────────────────────────────────────

/**
 * Server-side validation of marketplace upload metadata (enforced again at
 * registration; the Blob upload itself is signed client-side).
 * Photos are capped lower and must be image mime types; everything else is
 * checked against the shared extension whitelist (code/text files often
 * arrive as octet-stream, so the extension is the authority).
 */
export function validateMarketplaceFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  kind: 'ATTACHMENT' | 'PHOTO',
): void {
  const extension = (fileName.split('.').pop() ?? '').toLowerCase();
  const isPhoto = kind === 'PHOTO';
  const allowed = isPhoto
    ? MARKETPLACE_UPLOAD_LIMITS.photoExtensions
    : MARKETPLACE_UPLOAD_LIMITS.allowedExtensions;
  if (!allowed.includes(extension as never)) {
    throw ApiError.badRequest(`.${extension || '?'} files are not allowed`, 'FILE_TYPE_NOT_ALLOWED');
  }
  const maxBytes = isPhoto
    ? MARKETPLACE_UPLOAD_LIMITS.maxPhotoBytes
    : MARKETPLACE_UPLOAD_LIMITS.maxFileSizeBytes;
  if (sizeBytes > maxBytes) {
    throw ApiError.badRequest(
      `File exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`,
      'FILE_TOO_LARGE',
    );
  }
  if (isPhoto && !mimeType.startsWith('image/')) {
    throw ApiError.badRequest('Photos must be image files', 'FILE_TYPE_NOT_ALLOWED');
  }
}

/** Register a completed Blob upload as a staged RequestFile (no request yet). */
export async function registerRequestFile(input: RequestFileRegister & { userId: string }) {
  validateMarketplaceFile(input.fileName, input.mimeType, input.sizeBytes, input.kind);
  // The storage path must be a server-minted path under THIS user's namespace
  // and the referenced blob must exist with matching metadata.
  assertOwnedPathname(input.storagePath, 'requests', input.userId, 'file');
  await assertStoredBlob(input.storagePath, { contentType: input.mimeType, sizeBytes: input.sizeBytes });
  const file = await prisma.requestFile.create({
    data: {
      uploadedById: input.userId,
      storagePath: input.storagePath,
      originalName: input.fileName,
      mime: input.mimeType,
      size: input.sizeBytes,
      kind: input.kind,
    },
    select: { id: true, originalName: true, size: true },
  });
  return { fileId: file.id, fileName: file.originalName, sizeBytes: file.size };
}

// ─── Request submission (R1: pre-order, no money involved) ───

async function nextRequestNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const count = await prisma.serviceRequest.count({ where: { createdAt: { gte: start } } });
  return buildOrderNumber(year, count); // same TSH-YYYY-NNNNNN shape as orders
}

/**
 * Create a ServiceRequest from a service-specific form submission.
 * Answers are validated server-side against the stored ServiceFormField rows —
 * the client never decides which fields exist, which are required, or what
 * a valid value looks like. FILE answers are deferred to the M4 upload flow.
 */
export async function createRequest(input: ServiceRequestCreate & { userId: string; userName: string; userEmail: string; slug: string }) {
  const service = await prisma.service.findFirst({
    where: { slug: input.slug, status: 'PUBLISHED' },
    include: { formFields: { orderBy: { displayOrder: 'asc' } }, category: { select: { name: true } } },
  });
  if (!service) throw ApiError.notFound('Service not found');

  const fieldDefs = service.formFields.map((f) => {
    const validation = formFieldValidationSchema.safeParse(f.validation ?? {}).data ?? null;
    return { key: f.key, label: f.label, type: f.type, options: toStringArray(f.options), required: f.required, validation };
  });

  // FILE fields stay optional at validation (storage can be unconfigured —
  // the founder can request files later); provided answers are staged file ids.
  const validated = buildRequestAnswersSchema(
    fieldDefs.map((f) => (f.type === 'FILE' ? { ...f, required: false } : f)),
    'submit',
  ).safeParse(input.answers);
  if (!validated.success) {
    throw new ApiError(
      422,
      'FORM_INVALID',
      'Please correct the highlighted fields and try again',
      {
        issues: validated.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    );
  }
  const answers: Record<string, unknown> = { ...(validated.data as Record<string, unknown>) };

  // FILE answers hold staged RequestFile ids uploaded by this customer —
  // they are claimed into the request inside the same transaction below.
  const fileIds: string[] = [];
  for (const f of fieldDefs) {
    if (f.type !== 'FILE') continue;
    const value = answers[f.key];
    if (Array.isArray(value)) fileIds.push(...(value as string[]));
  }
  if (fileIds.length > 25) {
    throw ApiError.badRequest('Too many files attached to this request', 'FILE_TOO_LARGE');
  }

  // A service's DATE field named "deadline" doubles as the request deadline.
  // zod coerces DATE answers to Date instances; raw strings arrive from drafts.
  const rawDeadline = answers['deadline'];
  const deadlineFromAnswers =
    rawDeadline instanceof Date
      ? rawDeadline
      : typeof rawDeadline === 'string' && rawDeadline !== ''
        ? new Date(rawDeadline)
        : null;
  const effectiveDeadline =
    input.deadline ?? (deadlineFromAnswers && !Number.isNaN(deadlineFromAnswers.getTime()) ? deadlineFromAnswers : null);

  // R4 snapshot: freeze the service content the customer actually saw.
  const serviceSnapshot = {
    service: {
      id: service.id,
      slug: service.slug,
      name: service.name,
      serviceType: service.serviceType,
      pricingModel: service.pricingModel,
      basePrice: service.basePrice.toString(),
      priceFrom: service.priceFrom?.toString() ?? null,
      priceTo: service.priceTo?.toString() ?? null,
      priceNote: service.priceNote,
      deliveryEstimateText: service.deliveryEstimateText,
      categoryName: service.category.name,
    },
    capturedAt: new Date().toISOString(),
  };

  // One transactional unit: request + history + claim of staged files.
  const persistRequest = () =>
    prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: {
          referenceNo: await nextRequestNumber(),
          userId: input.userId,
          serviceId: service.id,
          status: 'REQUEST_SUBMITTED',
          answers: answers as Prisma.InputJsonValue,
          deadline: effectiveDeadline ?? null,
          contactPreference: input.contactPreference ?? null,
          notes: input.notes ?? null,
          serviceSnapshot,
          isRepair: service.serviceType === 'PC_REPAIR',
        },
        select: { id: true, referenceNo: true },
      });
      await tx.statusHistory.create({
        data: {
          entityType: 'REQUEST',
          entityId: request.id,
          fromStatus: null,
          toStatus: 'REQUEST_SUBMITTED',
          actorId: input.userId,
          note: 'Request submitted',
        },
      });
      if (fileIds.length) {
        // Claim staged uploads — only files uploaded BY this customer and not
        // yet bound to another request can be claimed (mirrors checkout).
        const claimed = await tx.requestFile.updateMany({
          where: { id: { in: fileIds }, uploadedById: input.userId, requestId: null },
          data: { requestId: request.id },
        });
        if (claimed.count !== fileIds.length) {
          throw ApiError.badRequest(
            'One or more files could not be linked to this request',
            'FILE_CLAIM_FAILED',
          );
        }
      }
      return request;
    });

  let created: { id: string; referenceNo: string };
  try {
    created = await persistRequest();
  } catch (err) {
    // Reference-number collision under concurrency — retry like checkout does.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      created = await persistRequest();
    } else {
      throw err;
    }
  }

  // Best-effort notifications (never fail the submission)
  await notifyUser({
    userId: input.userId,
    type: 'REQUEST_STATUS',
    title: 'Request submitted',
    body: `We received your ${service.name} request (${created.referenceNo}). You'll get a quotation here soon.`,
    link: '/dashboard',
  });
  void notifyFounders(
    `New service request ${created.referenceNo} — ${service.name}`,
    emailShell(
      `New service request: ${created.referenceNo}`,
      [
        ['Service', `${service.name} (${service.serviceType ?? ''})`],
        ['Customer', `${input.userName} (${input.userEmail})`],
        ['Deadline', input.deadline ? input.deadline.toISOString().slice(0, 10) : '—'],
        ['Repair flow', service.serviceType === 'PC_REPAIR' ? 'Yes — needs diagnosis' : 'No'],
        ['Reference', created.referenceNo],
      ],
      'Open admin panel',
      process.env.ADMIN_PANEL_URL ?? undefined,
    ),
  ).catch((err) => logger.error({ err }, 'Founder email failed'));

  return { requestId: created.id, referenceNo: created.referenceNo, status: 'REQUEST_SUBMITTED' as const };
}
