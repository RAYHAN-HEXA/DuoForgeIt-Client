import type {
  AdminServiceCategoryDto,
  AdminServiceDetailDto,
  AdminServiceFormFieldDto,
  AdminServiceListQuery,
  AdminServiceOptionDto,
  AdminServiceSummaryDto,
  Paginated,
  ServiceStatus,
  ServiceUpsertInput,
} from '@tsh/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Admin catalog management. These queries see every lifecycle status; the
 * public marketplace still filters `status = PUBLISHED` on its own endpoints.
 *
 * Safety rules:
 *  - Deleting a service is blocked while orders/carts/requests reference it —
 *    those relations are `onDelete: Restrict` and history must stay intact.
 *  - Removing an option that is linked from a cart deactivates it instead of
 *    deleting the row, so cart item option links never dangle.
 *  - Legacy options (`kind = null`) and their cart links are never touched.
 */

// ─── JSON column coercion (bad historical data degrades to empty) ──────────

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

// ─── Include shapes ─────────────────────────────────────────

const summaryInclude = {
  category: { select: { id: true, slug: true, name: true, iconKey: true } },
  _count: { select: { orderItems: true, cartItems: true, requests: true } },
} satisfies Prisma.ServiceInclude;

const detailInclude = {
  ...summaryInclude,
  options: {
    where: { kind: { not: null } },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      kind: true,
      label: true,
      description: true,
      priceFrom: true,
      priceTo: true,
      isActive: true,
      displayOrder: true,
    },
  },
  formFields: {
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      options: true,
      required: true,
      helpText: true,
      displayOrder: true,
    },
  },
} satisfies Prisma.ServiceInclude;

type SummaryRow = Prisma.ServiceGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.ServiceGetPayload<{ include: typeof detailInclude }>;

// ─── Mappers ────────────────────────────────────────────────

function toSummaryDto(service: SummaryRow): AdminServiceSummaryDto {
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    tagline: service.tagline,
    category: service.category,
    status: service.status,
    serviceType: service.serviceType,
    pricingModel: service.pricingModel,
    basePrice: service.basePrice.toString(),
    priceFrom: service.priceFrom?.toString() ?? null,
    priceTo: service.priceTo?.toString() ?? null,
    priceNote: service.priceNote,
    deliveryEstimateText: service.deliveryEstimateText,
    thumbnail: service.thumbnail,
    imageUrl: service.imageUrl,
    isFeatured: service.isFeatured,
    isPopular: service.isPopular,
    displayOrder: service.displayOrder,
    usage: {
      orders: service._count.orderItems,
      carts: service._count.cartItems,
      requests: service._count.requests,
    },
    updatedAt: service.updatedAt.toISOString(),
  };
}

function toOptionDto(option: DetailRow['options'][number]): AdminServiceOptionDto {
  return {
    id: option.id,
    kind: option.kind === 'PACKAGE' ? 'PACKAGE' : 'ADDON',
    label: option.label,
    description: option.description,
    priceFrom: option.priceFrom?.toString() ?? null,
    priceTo: option.priceTo?.toString() ?? null,
    isActive: option.isActive,
    displayOrder: option.displayOrder,
  };
}

function toFormFieldDto(field: DetailRow['formFields'][number]): AdminServiceFormFieldDto {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    options: toStringArray(field.options),
    required: field.required,
    helpText: field.helpText,
    displayOrder: field.displayOrder,
  };
}

function toDetailDto(service: DetailRow): AdminServiceDetailDto {
  return {
    ...toSummaryDto(service as unknown as SummaryRow),
    description: service.description,
    bannerImage: service.bannerImage,
    deliveryDays: service.deliveryDays,
    revisionPolicy: service.revisionPolicy,
    requirementsText: service.requirementsText,
    features: toStringArray(service.features),
    deliverables: toStringArray(service.deliverables),
    acceptedFileTypes: toStringArray(service.acceptedFileTypes),
    faqs: toFaqArray(service.faqs),
    founderDiscipline: service.founderDiscipline,
    options: service.options.map(toOptionDto),
    formFields: service.formFields.map(toFormFieldDto),
    createdAt: service.createdAt.toISOString(),
  };
}

// ─── Queries ────────────────────────────────────────────────

export async function listCategories(): Promise<AdminServiceCategoryDto[]> {
  const [categories, counts] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),
    prisma.service.groupBy({ by: ['categoryId'], _count: { _all: true } }),
  ]);
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconKey: c.iconKey,
    isActive: c.isActive,
    displayOrder: c.displayOrder,
    serviceCount: countByCategory.get(c.id) ?? 0,
  }));
}

export async function listServices(query: AdminServiceListQuery): Promise<Paginated<AdminServiceSummaryDto>> {
  const where: Prisma.ServiceWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
      { tagline: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
    query.sort === 'updated_desc'
      ? [{ updatedAt: 'desc' }]
      : query.sort === 'name_asc'
        ? [{ name: 'asc' }]
        : [{ displayOrder: 'asc' }, { name: 'asc' }];

  const [rows, total] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: summaryInclude,
    }),
    prisma.service.count({ where }),
  ]);

  return {
    items: rows.map(toSummaryDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getService(id: string): Promise<AdminServiceDetailDto> {
  const service = await prisma.service.findUnique({ where: { id }, include: detailInclude });
  if (!service) throw ApiError.notFound('Service not found');
  return toDetailDto(service);
}

// ─── Write helpers ──────────────────────────────────────────

function optionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type NormalizedPricing = {
  basePrice: string;
  priceFrom: string | null;
  priceTo: string | null;
};

/**
 * Normalise the editor's pricing fields into the three stored columns. The
 * card/detail price label is derived from `pricingModel` + these values.
 */
function normalizePricing(input: ServiceUpsertInput): NormalizedPricing {
  switch (input.pricingModel) {
    case 'FIXED':
      return { basePrice: input.basePrice, priceFrom: null, priceTo: null };
    case 'STARTING_FROM':
      return { basePrice: input.priceFrom ?? input.basePrice, priceFrom: input.priceFrom ?? input.basePrice, priceTo: null };
    case 'RANGE':
      return {
        basePrice: input.priceFrom ?? input.basePrice,
        priceFrom: input.priceFrom ?? null,
        priceTo: input.priceTo ?? null,
      };
    case 'CUSTOM_QUOTE':
    default:
      return { basePrice: input.basePrice, priceFrom: null, priceTo: null };
  }
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) {
    throw new ApiError(400, 'CATEGORY_NOT_FOUND', 'Choose an existing category for this service');
  }
}

async function assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
  const existing = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError(409, 'SERVICE_SLUG_TAKEN', `The slug “${slug}” is already used by another service`, {
      slug,
    });
  }
}

/** Publish gate used by create/update/status changes. */
function assertPublishable(input: {
  status: string;
  serviceType: string | null;
  pricingModel: string | null;
  basePrice: string;
  priceFrom: string | null;
  priceTo: string | null;
}): void {
  if (input.status !== 'PUBLISHED') return;

  if (!input.serviceType) {
    throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'Choose a service type before publishing');
  }
  if (!input.pricingModel) {
    throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'Choose a pricing model before publishing');
  }

  const cents = (value: string | null) => (value === null ? 0 : Math.round(Number(value) * 100));
  if (input.pricingModel === 'FIXED' && cents(input.basePrice) <= 0) {
    throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'A published fixed-price service needs a price');
  }
  if (input.pricingModel === 'STARTING_FROM' && cents(input.priceFrom) <= 0) {
    throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'A published service needs a starting price');
  }
  if (input.pricingModel === 'RANGE') {
    if (cents(input.priceFrom) <= 0 || cents(input.priceTo) <= 0) {
      throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'A published range service needs both prices');
    }
    if (cents(input.priceFrom) > cents(input.priceTo)) {
      throw new ApiError(422, 'SERVICE_NOT_PUBLISHABLE', 'The maximum price must be at least the minimum price');
    }
  }
}

function scalarData(input: ServiceUpsertInput) {
  const pricing = normalizePricing(input);
  return {
    name: input.name,
    tagline: optionalString(input.tagline),
    description: input.description,
    categoryId: input.categoryId,
    serviceType: input.serviceType,
    pricingModel: input.pricingModel,
    basePrice: pricing.basePrice,
    priceFrom: pricing.priceFrom,
    priceTo: pricing.priceTo,
    priceNote: optionalString(input.priceNote),
    deliveryDays: input.deliveryDays,
    deliveryEstimateText: optionalString(input.deliveryEstimateText),
    revisionPolicy: optionalString(input.revisionPolicy),
    requirementsText: optionalString(input.requirementsText),
    features: input.features as Prisma.InputJsonValue,
    deliverables: input.deliverables as Prisma.InputJsonValue,
    acceptedFileTypes: input.acceptedFileTypes as Prisma.InputJsonValue,
    faqs: input.faqs as Prisma.InputJsonValue,
    imageUrl: optionalString(input.imageUrl),
    thumbnail: optionalString(input.thumbnail),
    bannerImage: optionalString(input.bannerImage),
    founderDiscipline: input.founderDiscipline,
    isFeatured: input.isFeatured,
    isPopular: input.isPopular,
    status: input.status,
    displayOrder: input.displayOrder,
  };
}

function optionScalarData(option: ServiceUpsertInput['options'][number], index: number) {
  return {
    kind: option.kind,
    groupKey: option.kind === 'PACKAGE' ? 'package' : 'addon',
    label: option.label,
    description: optionalString(option.description),
    // Legacy price-delta columns stay neutral for v2 packages/add-ons.
    priceDelta: '0',
    daysDelta: 0,
    priceFrom: option.priceFrom ?? null,
    priceTo: option.priceTo ?? null,
    isActive: option.isActive,
    displayOrder: option.displayOrder ?? index,
  };
}

function formFieldData(field: ServiceUpsertInput['formFields'][number], index: number) {
  return {
    label: field.label,
    type: field.type,
    options: field.options as Prisma.InputJsonValue,
    required: field.required,
    helpText: optionalString(field.helpText),
    displayOrder: field.displayOrder ?? index,
  };
}

// ─── Mutations ──────────────────────────────────────────────

export async function createService(input: ServiceUpsertInput): Promise<AdminServiceDetailDto> {
  await assertCategoryExists(input.categoryId);
  await assertSlugAvailable(input.slug);
  assertPublishable({
    status: input.status,
    serviceType: input.serviceType,
    pricingModel: input.pricingModel,
    basePrice: input.basePrice,
    priceFrom: input.priceFrom ?? null,
    priceTo: input.priceTo ?? null,
  });

  const service = await prisma.$transaction(async (tx) => {
    const created = await tx.service.create({
      data: {
        slug: input.slug,
        ...scalarData(input),
        // Newly created published services join the legacy catalog too.
        isActive: input.status === 'PUBLISHED',
        options: {
          create: input.options.map((option, index) => optionScalarData(option, index)),
        },
        formFields: {
          create: input.formFields.map((field, index) => ({
            key: field.key,
            ...formFieldData(field, index),
          })),
        },
      },
    });

    return tx.service.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  return toDetailDto(service);
}

export async function updateService(id: string, input: ServiceUpsertInput): Promise<AdminServiceDetailDto> {
  const existing = await prisma.service.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!existing) throw ApiError.notFound('Service not found');

  await assertCategoryExists(input.categoryId);
  await assertSlugAvailable(input.slug, id);
  assertPublishable({
    status: input.status,
    serviceType: input.serviceType,
    pricingModel: input.pricingModel,
    basePrice: input.basePrice,
    priceFrom: input.priceFrom ?? null,
    priceTo: input.priceTo ?? null,
  });

  const service = await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id },
      data: {
        slug: input.slug,
        ...scalarData(input),
        // Archiving must hide a legacy-catalog service everywhere. Publishing
        // deliberately preserves isActive so v2 rows stay out of the legacy
        // catalog (seeded v2 services are PUBLISHED with isActive = false).
        ...(input.status === 'ARCHIVED' ? { isActive: false } : {}),
      },
    });

    // ── Options: update by id, create new, deactivate referenced removals ──
    const currentOptions = await tx.serviceOption.findMany({
      where: { serviceId: id, kind: { not: null } },
      select: { id: true },
    });
    const incomingIds = new Set(input.options.map((o) => o.id).filter((value): value is string => Boolean(value)));

    for (const row of currentOptions) {
      if (incomingIds.has(row.id)) continue;
      const references = await tx.cartItemOption.count({ where: { serviceOptionId: row.id } });
      if (references > 0) {
        await tx.serviceOption.update({ where: { id: row.id }, data: { isActive: false } });
      } else {
        await tx.serviceOption.delete({ where: { id: row.id } });
      }
    }

    for (const [index, option] of input.options.entries()) {
      const data = optionScalarData(option, index);
      if (option.id) {
        const result = await tx.serviceOption.updateMany({
          where: { id: option.id, serviceId: id },
          data,
        });
        if (result.count === 0) await tx.serviceOption.create({ data: { serviceId: id, ...data } });
      } else {
        await tx.serviceOption.create({ data: { serviceId: id, ...data } });
      }
    }

    // ── Form fields: key is the stable identity; upsert by serviceId+key ──
    const incomingKeys = input.formFields.map((field) => field.key);
    await tx.serviceFormField.deleteMany({
      where: { serviceId: id, ...(incomingKeys.length > 0 ? { key: { notIn: incomingKeys } } : {}) },
    });
    for (const [index, field] of input.formFields.entries()) {
      await tx.serviceFormField.upsert({
        where: { serviceId_key: { serviceId: id, key: field.key } },
        update: formFieldData(field, index),
        create: { serviceId: id, key: field.key, ...formFieldData(field, index) },
      });
    }

    return tx.service.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  return toDetailDto(service);
}

export async function setServiceStatus(id: string, status: ServiceStatus): Promise<AdminServiceDetailDto> {
  const existing = await prisma.service.findUnique({
    where: { id },
    select: { id: true, serviceType: true, pricingModel: true, basePrice: true, priceFrom: true, priceTo: true },
  });
  if (!existing) throw ApiError.notFound('Service not found');

  assertPublishable({
    status,
    serviceType: existing.serviceType,
    pricingModel: existing.pricingModel,
    basePrice: existing.basePrice.toString(),
    priceFrom: existing.priceFrom?.toString() ?? null,
    priceTo: existing.priceTo?.toString() ?? null,
  });

  const service = await prisma.service.update({
    where: { id },
    data: {
      status,
      // Archiving removes it from the legacy catalog too; publishing never
      // flips isActive on (v2 rows are intentionally inactive there).
      ...(status === 'ARCHIVED' ? { isActive: false } : {}),
    },
    include: detailInclude,
  });
  return toDetailDto(service);
}

export async function deleteService(id: string): Promise<void> {
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { orderItems: true, cartItems: true, requests: true } },
    },
  });
  if (!service) throw ApiError.notFound('Service not found');

  const usage = {
    orders: service._count.orderItems,
    carts: service._count.cartItems,
    requests: service._count.requests,
  };
  if (usage.orders + usage.carts + usage.requests > 0) {
    throw new ApiError(
      409,
      'SERVICE_IN_USE',
      'This service is referenced by orders, carts or requests. Archive it instead of deleting.',
      { usage },
    );
  }

  await prisma.service.delete({ where: { id } });
}
