import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { assertOwnedPathname, assertStoredBlob } from '../utils/blob.js';
import {
  allowedRequestTransitions,
  buildRequestAnswersSchema,
  formFieldValidationSchema,
  buildOrderNumber,
  MARKETPLACE_UPLOAD_LIMITS,
  QUOTATION_VALIDITY_DAYS,
  REQUEST_CANCELLABLE,
  type MarketplaceCategoryDto,
  type MarketplaceListQuery,
  type MarketplacePackageDto,
  type MarketplaceServiceCardDto,
  type MarketplaceServiceDetailDto,
  type Paginated,
  type QuotationAccept,
  type QuotationCreate,
  type QuotationDto,
  type RequestListQuery,
  type RequestStatusUpdate,
  type RequestFileRegister,
  type ServiceRequestCreate,
  type ServiceRequestDetailDto,
  type ServiceRequestStatus,
  type ServiceRequestSummaryDto,
  type AdminServiceRequestDetailDto,
  type QuotationAcceptResultDto,
} from '@tsh/shared';
import { notifyUser } from './notification.service.js';
import { notifyFounders, emailShell, sendCustomerEmail } from './mail.service.js';
import { nextOrderNumber } from './order.service.js';
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

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace payment bridge: request → quotation → accept → order → bKash.
// The schema anticipated this flow (Order.acceptedQuotationId @unique,
// ACCEPTED_AWAITING_PAYMENT/ORDER_CREATED statuses) — these functions are its
// only writers. Prices are server-derived from quotation items; the client can
// never set a total.
// ─────────────────────────────────────────────────────────────────────────────

const quotationInclude = { request: { select: { id: true, userId: true, status: true, deadline: true, notes: true, serviceId: true, isRepair: true, serviceSnapshot: true } } } satisfies Prisma.QuotationInclude;

type QuotationRow = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>;

function money(value: Prisma.Decimal | number): string {
  return value.toFixed(2);
}

function toQuotationDto(q: {
  id: string;
  requestId: string;
  version: number;
  price: Prisma.Decimal;
  items: unknown;
  scopeText: string | null;
  deliverables: unknown;
  estimatedTimeline: string | null;
  validUntil: Date;
  status: string;
  sentAt: Date | null;
  respondedAt: Date | null;
  declineReason: string | null;
  createdAt: Date;
}): QuotationDto {
  const items = Array.isArray(q.items)
    ? q.items.filter((v): v is { label: string; amount: string } => Boolean(v) && typeof v === 'object' && typeof (v as { label?: unknown }).label === 'string' && typeof (v as { amount?: unknown }).amount === 'string')
    : [];
  return {
    id: q.id,
    requestId: q.requestId,
    version: q.version,
    price: money(q.price),
    items,
    scopeText: q.scopeText || null,
    deliverables: toStringArray(q.deliverables),
    estimatedTimeline: q.estimatedTimeline || null,
    validUntil: q.validUntil.toISOString(),
    status: q.status as QuotationDto['status'],
    sentAt: q.sentAt?.toISOString() ?? null,
    respondedAt: q.respondedAt?.toISOString() ?? null,
    declineReason: q.declineReason,
    createdAt: q.createdAt.toISOString(),
  };
}

const requestInclude = {
  service: { select: { name: true, slug: true } },
  user: { select: { id: true, fullName: true, email: true } },
  quotations: { orderBy: { version: 'desc' as const } },
} satisfies Prisma.ServiceRequestInclude;

type RequestWithRelations = Prisma.ServiceRequestGetPayload<{ include: typeof requestInclude }>;

// StatusHistory is polymorphic (entityType + bare entityId — no Prisma
// relation), so request timelines are queried separately from the row.

function toRequestSummary(r: RequestWithRelations): ServiceRequestSummaryDto {
  const sent = (r.quotations ?? []).find((q) => q.status === 'SENT');
  return {
    id: r.id,
    referenceNo: r.referenceNo,
    status: r.status,
    serviceName: r.service.name,
    serviceSlug: r.service.slug,
    quotedPrice: sent ? money(sent.price) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toRequestDetail(
  r: RequestWithRelations,
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date; actor: { fullName: string } | null }>,
): ServiceRequestDetailDto {
  return {
    ...toRequestSummary(r),
    deadline: r.deadline?.toISOString() ?? null,
    notes: r.notes,
    quotations: (r.quotations ?? []).map(toQuotationDto),
    statusHistory: history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      actorName: h.actor?.fullName ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    answers: (r.answers ?? {}) as Record<string, unknown>,
  };
}

/** Polymorphic REQUEST timeline — no Prisma relation, so a manual query. */
async function requestTimeline(requestId: string): Promise<Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date; actor: { fullName: string } | null }>> {
  return prisma.statusHistory.findMany({
    where: { entityType: 'REQUEST', entityId: requestId },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { fullName: true } } },
  });
}

/** Shortest legal transition path from `from` to `to` (BFS over the state machine). */
function transitionPathTo(from: ServiceRequestStatus, to: ServiceRequestStatus, isRepair: boolean): ServiceRequestStatus[] {
  if (from === to) return [];
  const queue: Array<{ status: ServiceRequestStatus; path: ServiceRequestStatus[] }> = [{ status: from, path: [] }];
  const seen = new Set<ServiceRequestStatus>([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of allowedRequestTransitions(cur.status ?? cur, isRepair)) {
      if (seen.has(next)) continue;
      const path = [...cur.path, next];
      if (next === to) return path;
      seen.add(next);
      queue.push({ status: next, path });
    }
  }
  throw new ApiError(400, 'INVALID_TRANSITION', `A ${from} request cannot reach ${to}`);
}

function requireTransition(from: ServiceRequestStatus, to: ServiceRequestStatus, isRepair = false): void {
  if (!allowedRequestTransitions(from, isRepair).includes(to)) {
    throw new ApiError(400, 'INVALID_TRANSITION', `A ${from} request cannot move to ${to}`);
  }
}

async function writeHistory(tx: Prisma.TransactionClient, entityId: string, from: string | null, to: string, actorId: string | null, note?: string): Promise<void> {
  await tx.statusHistory.create({
    data: { entityType: 'REQUEST', entityId, fromStatus: from, toStatus: to, actorId, note: note ?? null },
  });
}

// ─── Customer: my requests ──────────────────────────────────────────────────

export async function listOwnRequests(userId: string, query: RequestListQuery): Promise<Paginated<ServiceRequestSummaryDto>> {
  const where: Prisma.ServiceRequestWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: requestInclude,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return { items: rows.map(toRequestSummary), page: query.page, pageSize: query.pageSize, total };
}

export async function getOwnRequest(userId: string, id: string): Promise<ServiceRequestDetailDto> {
  const request = await prisma.serviceRequest.findFirst({
    where: { id, userId },
    include: requestInclude,
  });
  // Not-found for other customers' requests — never leak existence.
  if (!request) throw ApiError.notFound('Request not found');
  const history = await requestTimeline(id);
  return toRequestDetail(request, history);
}

export async function cancelOwnRequest(userId: string, id: string, note: string | undefined): Promise<ServiceRequestSummaryDto> {
  const request = await prisma.serviceRequest.findFirst({ where: { id, userId }, include: requestInclude });
  if (!request) throw ApiError.notFound('Request not found');
  if (!REQUEST_CANCELLABLE.includes(request.status)) {
    throw new ApiError(409, 'REQUEST_NOT_CANCELLABLE', 'This request can no longer be cancelled');
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' } });
    await writeHistory(tx, request.id, request.status, 'CANCELLED', null, note);
    return tx.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });
  });
  return toRequestSummary(updated);
}

// ─── Customer: quotation accept / decline ───────────────────────────────────

export async function acceptQuotation(requestId: string, userId: string, input: QuotationAccept): Promise<QuotationAcceptResultDto> {
  // Idempotent replay — same key returns the same order.
  const replay = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (replay) {
    if (replay.customerId !== userId || replay.requestId !== requestId) {
      throw new ApiError(409, 'IDEMPOTENCY_KEY_USED', 'This idempotency key was already used for a different order');
    }
    return { order: { id: replay.id, orderNumber: replay.orderNumber, totalAmount: money(replay.totalAmount) }, replayed: true };
  }

  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, userId } });
  // Other customers' requests do not exist.
  if (!request) throw ApiError.notFound('Request not found');
  if (request.status === 'ACCEPTED_AWAITING_PAYMENT' || request.status === 'ORDER_CREATED') {
    const linked = await prisma.order.findFirst({
      where: { requestId, acceptedQuotationId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (linked) return { order: { id: linked.id, orderNumber: linked.orderNumber, totalAmount: money(linked.totalAmount) }, replayed: true };
  }
  if (request.status !== 'QUOTATION_SENT') {
    throw new ApiError(409, 'QUOTATION_NOT_ACCEPTABLE', 'This request has no quotation awaiting your response');
  }
  const quotation = (await prisma.quotation.findFirst({
    where: { requestId, status: 'SENT' },
    orderBy: { version: 'desc' },
    include: quotationInclude,
  })) as QuotationRow | null;
  if (!quotation) throw new ApiError(409, 'QUOTATION_NOT_ACCEPTABLE', 'This request has no quotation awaiting your response');
  if (quotation.validUntil.getTime() < Date.now()) {
    // Expire it now so both sides agree on the state.
    await prisma.$transaction(async (tx) => {
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'EXPIRED' } });
      if (quotation.request.status === 'QUOTATION_SENT') {
        requireTransition('QUOTATION_SENT', 'QUOTATION_EXPIRED');
        await tx.serviceRequest.update({ where: { id: quotation.requestId }, data: { status: 'QUOTATION_EXPIRED' } });
        await writeHistory(tx, quotation.requestId, 'QUOTATION_SENT', 'QUOTATION_EXPIRED', null, 'Validity window elapsed');
      }
    });
    throw new ApiError(409, 'QUOTATION_EXPIRED', 'This quotation has expired — ask us for a fresh one');
  }
  if (quotation.request.status !== 'QUOTATION_SENT') {
    throw ApiError.conflict('This quotation is no longer awaiting your response', 'QUOTATION_NOT_ACCEPTABLE');
  }

  const snapshot = (quotation.request.serviceSnapshot ?? {}) as { name?: unknown };
  const serviceName = typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name : 'Marketplace service';
  const deadline = quotation.request.deadline ?? new Date(Date.now() + 14 * 864e5);

  // The accept transaction: quotation ACCEPTED, siblings SUPERSEDED, request
  // QUOTATION_SENT → ACCEPTED_AWAITING_PAYMENT → ORDER_CREATED, order created
  // with the unique acceptedQuotationId as the hard double-accept guard.
  const persist = () =>
    prisma.$transaction(async (tx) => {
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await tx.quotation.updateMany({ where: { requestId: quotation.requestId, id: { not: quotation.id }, status: 'SENT' }, data: { status: 'SUPERSEDED' } });
      requireTransition('QUOTATION_SENT', 'ACCEPTED_AWAITING_PAYMENT');
      await tx.serviceRequest.update({ where: { id: quotation.requestId }, data: { status: 'ACCEPTED_AWAITING_PAYMENT' } });
      await writeHistory(tx, quotation.requestId, 'QUOTATION_SENT', 'ACCEPTED_AWAITING_PAYMENT', null, `Quotation v${quotation.version} accepted`);
      requireTransition('ACCEPTED_AWAITING_PAYMENT', 'ORDER_CREATED');
      await tx.serviceRequest.update({ where: { id: quotation.requestId }, data: { status: 'ORDER_CREATED' } });
      await writeHistory(tx, quotation.requestId, 'ACCEPTED_AWAITING_PAYMENT', 'ORDER_CREATED', null, 'Order created — awaiting bKash payment');
      const order = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(),
          customerId: userId,
          requestId: quotation.requestId,
          acceptedQuotationId: quotation.id,
          status: 'SUBMITTED',
          title: serviceName,
          deadline,
          totalAmount: quotation.price,
          idempotencyKey: input.idempotencyKey,
          serviceSnapshot: quotation.request.serviceSnapshot ?? undefined,
          notes: quotation.request.notes ?? undefined,
          items: {
            create: [{
              serviceId: quotation.request.serviceId,
              serviceName,
              basePrice: quotation.price,
              quantity: 1,
              lineTotal: quotation.price,
              requirements: quotation.request.notes ?? null,
            }],
          },
          statusHistory: {
            create: [{ toStatus: 'SUBMITTED', note: 'Order created from an accepted quotation' }],
          },
        },
      });
      return order;
    });

  let order;
  try {
    order = await persist();
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      // Concurrent double-accept: the unique indexes decided the winner.
      const linked = await prisma.order.findUnique({ where: { acceptedQuotationId: quotation.id } });
      if (linked && linked.customerId === userId) {
        return { order: { id: linked.id, orderNumber: linked.orderNumber, totalAmount: money(linked.totalAmount) }, replayed: true };
      }
      const byKey = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (byKey && byKey.customerId === userId) {
        return { order: { id: byKey.id, orderNumber: byKey.orderNumber, totalAmount: money(byKey.totalAmount) }, replayed: true };
      }
    }
    throw err;
  }

  // Best-effort notifications.
  await notifyUser({
    userId,
    type: 'REQUEST_STATUS',
    title: `Order ${order.orderNumber} created`,
    body: 'Your quotation was accepted — pay via bKash from the order page.',
    link: `/orders/${order.id}`,
  });
  void sendCustomerEmail(
    (await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } }))?.email ?? '',
    `Quotation accepted — ${order.orderNumber}`,
    emailShell(
      'Your quotation was accepted',
      [
        ['Order', order.orderNumber],
        ['Amount', money(order.totalAmount)],
        ['Next step', 'Pay via bKash from the order page, then submit the Transaction ID'],
      ],
      'Pay now',
      `${process.env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app'}/orders/${order.id}`,
    ),
  ).catch((err) => logger.error({ err }, 'Quotation-accept customer email failed'));
  void notifyFounders(
    `Quotation accepted → ${order.orderNumber} awaiting bKash payment`,
    emailShell('A marketplace quotation was accepted', [['Order', order.orderNumber], ['Amount', money(order.totalAmount)]], 'Open admin console', `${process.env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app'}/admin/orders/${order.id}`),
  ).catch((err) => logger.error({ err }, 'Quotation-accept founder email failed'));

  return { order: { id: order.id, orderNumber: order.orderNumber, totalAmount: money(order.totalAmount) }, replayed: false };
}

export async function declineQuotation(requestId: string, userId: string, reason: string): Promise<QuotationDto> {
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, userId }, select: { id: true, userId: true, status: true } });
  if (!request) throw ApiError.notFound('Request not found');
  const quotation = (await prisma.quotation.findFirst({
    where: { requestId, status: 'SENT' },
    orderBy: { version: 'desc' },
    include: quotationInclude,
  })) as QuotationRow | null;
  if (!quotation) throw new ApiError(409, 'QUOTATION_NOT_DECLINABLE', 'This request has no quotation to decline');
  requireTransition(quotation.request.status, 'QUOTATION_DECLINED', false);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason } });
    await tx.serviceRequest.update({ where: { id: quotation.requestId }, data: { status: 'QUOTATION_DECLINED' } });
    await writeHistory(tx, quotation.requestId, quotation.request.status, 'QUOTATION_DECLINED', null, `Quotation v${quotation.version} declined: ${reason}`);
    return tx.quotation.findUniqueOrThrow({ where: { id: quotation.id }, include: quotationInclude });
  });
  void notifyFounders(`Request ${''}quotation declined`, emailShell('A customer declined a quotation', [['Reason', reason]], 'Open admin panel', process.env.ADMIN_PANEL_URL ?? undefined)).catch((err) => logger.error({ err }, 'Founder email failed'));
  return toQuotationDto(updated);
}

// ─── Admin: request review & quotations ─────────────────────────────────────

export async function adminListRequests(query: RequestListQuery): Promise<Paginated<(ServiceRequestSummaryDto & { customerName: string; customerEmail: string })>> {
  const where: Prisma.ServiceRequestWhereInput = query.status ? { status: query.status } : {};
  const [rows, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: requestInclude,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      ...toRequestSummary(r),
      customerName: r.user.fullName,
      customerEmail: r.user.email,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function adminGetRequest(id: string): Promise<AdminServiceRequestDetailDto> {
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!request) throw ApiError.notFound('Request not found');
  const history = await requestTimeline(id);
  const detail = toRequestDetail(request, history);
  return {
    ...detail,
    customerId: request.user.id,
    customerName: request.user.fullName,
    customerEmail: request.user.email,
    isRepair: request.isRepair,
  };
}

export async function adminUpdateRequestStatus(id: string, adminId: string, input: RequestStatusUpdate): Promise<ServiceRequestSummaryDto> {
  const request = await prisma.serviceRequest.findUnique({ where: { id }, include: requestInclude });
  if (!request) throw ApiError.notFound('Request not found');
  requireTransition(request.status, input.status, request.isRepair);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.update({ where: { id: request.id }, data: { status: input.status, ...(input.status === 'UNDER_REVIEW' && !request.assignedToId ? { assignedToId: adminId } : {}) } });
    await writeHistory(tx, request.id, request.status, input.status, adminId, input.note);
    return tx.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });
  });
  await notifyUser({
    userId: request.userId,
    type: 'REQUEST_STATUS',
    title: 'Request update',
    body: `Your request ${request.referenceNo} is now ${input.status.replaceAll('_', ' ').toLowerCase()}.`,
    link: `/requests/${request.id}`,
  });
  return toRequestSummary(updated);
}

export async function createQuotation(requestId: string, adminId: string, input: QuotationCreate): Promise<QuotationDto> {
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, isRepair: true } });
  if (!request) throw ApiError.notFound('Request not found');
  if (['ORDER_CREATED', 'CANCELLED', 'REJECTED'].includes(request.status)) {
    throw new ApiError(409, 'REQUEST_CLOSED', 'This request is closed — no further quotations');
  }
  const totalCents = input.items.reduce((sum, item) => sum + Math.round(parseFloat(item.amount) * 100), 0);
  const price = (totalCents / 100).toFixed(2);
  const maxVersion = await prisma.quotation.aggregate({ where: { requestId }, _max: { version: true } });
  const version = (maxVersion._max.version ?? 0) + 1;
  const quotation = await prisma.quotation.create({
    data: {
      requestId,
      version,
      price,
      items: input.items,
      scopeText: input.scopeText ?? '',
      deliverables: input.deliverables ?? [],
      estimatedTimeline: input.estimatedTimeline ?? '',
      validUntil: new Date(Date.now() + QUOTATION_VALIDITY_DAYS * 864e5),
      status: 'DRAFT',
      sentById: adminId,
    },
    include: quotationInclude,
  });
  return toQuotationDto(quotation as QuotationRow);
}

export async function sendQuotation(quotationId: string, adminId: string): Promise<QuotationDto> {
  const quotation = (await prisma.quotation.findUnique({ where: { id: quotationId }, include: quotationInclude })) as QuotationRow | null;
  if (!quotation) throw ApiError.notFound('Quotation not found');
  if (quotation.status !== 'DRAFT') throw new ApiError(409, 'QUOTATION_NOT_SENDABLE', 'Only a draft quotation can be sent');

  const validUntil = new Date(Date.now() + QUOTATION_VALIDITY_DAYS * 864e5);
  const updated = await prisma.$transaction(async (tx) => {
    // Supersede any earlier sent version — only one live offer at a time.
    await tx.quotation.updateMany({ where: { requestId: quotation.requestId, status: 'SENT' }, data: { status: 'SUPERSEDED' } });
    // Walk the legal transition path to QUOTATION_SENT (e.g. REQUEST_SUBMITTED
    // → UNDER_REVIEW → QUOTATION_SENT), one history row per hop.
    const path = transitionPathTo(quotation.request.status, 'QUOTATION_SENT', quotation.request.isRepair);
    let current = quotation.request.status;
    for (const hop of path) {
      await tx.serviceRequest.update({ where: { id: quotation.requestId }, data: { status: hop } });
      await writeHistory(tx, quotation.requestId, current, hop, adminId, hop === 'QUOTATION_SENT' ? `Quotation v${quotation.version} sent` : undefined);
      current = hop;
    }
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'SENT', sentAt: new Date(), sentById: adminId, validUntil } });
    return tx.quotation.findUniqueOrThrow({ where: { id: quotation.id }, include: quotationInclude });
  });

  // Best-effort customer notification — the whole point of sending is that
  // they see it, so also write the in-app row.
  await notifyUser({
    userId: quotation.request.userId,
    type: 'REQUEST_STATUS',
    title: 'Quotation ready',
    body: `Quotation v${quotation.version} for ${money(quotation.price)} is waiting in your requests.`,
    link: `/requests/${quotation.requestId}`,
  });
  void sendCustomerEmail(
    (await prisma.user.findUnique({ where: { id: quotation.request.userId }, select: { email: true } }))?.email ?? '',
    `Quotation ready — ${money(quotation.price)}`,
    emailShell(
      'Your quotation is ready',
      (Array.isArray(quotation.items) ? (quotation.items as Array<{ label: string; amount: string }>) : []).map((i) => [i.label, i.amount] as [string, string]),
      'Review and accept',
      `${process.env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app'}/requests/${quotation.requestId}`,
    ),
  ).catch((err) => logger.error({ err }, 'Quotation email failed'));

  return toQuotationDto(updated as QuotationRow);
}
