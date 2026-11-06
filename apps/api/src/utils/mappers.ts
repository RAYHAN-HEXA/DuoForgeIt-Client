import type { PublicUser, AdminPaymentAccountDto, PaymentAccountOptionDto } from '@tsh/shared';
import type { User, FounderProfile, Service, ServiceCategory, Testimonial, PortfolioProject, PaymentAccount } from '../generated/prisma/client.js';
import { hasBlobStorage } from '../config/env.js';
import { signedDownloadUrl } from './blob.js';
import { subtractMoney } from './money.js';

/** Strip internal fields for API responses. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    profileImage: user.profileImage,
    role: user.role,
    emailVerified: user.emailVerified,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

type ServiceWithRelations = Service & {
  category: ServiceCategory;
  options: Array<{
    id: string;
    groupKey: string;
    label: string;
    priceDelta: { toString(): string };
    daysDelta: number;
    isDefault: boolean;
    displayOrder: number;
  }>;
};

/** Map a Prisma service row to its DTO — money becomes strings. */
export function toServiceDto(service: ServiceWithRelations) {
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    tagline: service.tagline,
    description: service.description,
    basePrice: service.basePrice.toString(),
    deliveryDays: service.deliveryDays,
    imageUrl: service.imageUrl,
    isFeatured: service.isFeatured,
    category: { id: service.category.id, slug: service.category.slug, name: service.category.name },
    options: [...service.options]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((o) => ({
        id: o.id,
        groupKey: o.groupKey,
        label: o.label,
        priceDelta: o.priceDelta.toString(),
        daysDelta: o.daysDelta,
        isDefault: o.isDefault,
        displayOrder: o.displayOrder,
      })),
  };
}

export function toFounderDto(profile: FounderProfile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    title: profile.title,
    bio: profile.bio,
    photoUrl: profile.photoUrl,
    portfolioUrl: profile.portfolioUrl,
    portfolioImageUrl: profile.portfolioImageUrl,
    skills: profile.skills,
    discipline: profile.discipline,
    isSelectable: profile.isSelectable,
  };
}

export function toTestimonialDto(t: Testimonial) {
  return {
    id: t.id,
    authorName: t.authorName,
    authorTitle: t.authorTitle,
    quote: t.quote,
    avatarUrl: t.avatarUrl,
    rating: t.rating,
  };
}

export function toPortfolioDto(p: PortfolioProject) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    projectUrl: p.projectUrl,
  };
}

// ─── Orders ──────────────────────────────────────────────────

import type {
  AdminOrderDto,
  AdminPaymentDto,
  OrderDto,
  OrderSummaryDto,
  PaymentDto,
  OrderAttachmentDto,
  DeliverableDto,
  RevisionRequestDto,
  ReviewDto,
  OrderItemOptionSnapshotDto,
  OrderItemDto,
  OrderStatusEventDto,
} from '@tsh/shared';
import type { Order, OrderItem, Payment, OrderAttachment, Deliverable, RevisionRequest, Review } from '../generated/prisma/client.js';

type Decimalish = { toString(): string };

type OrderItemFull = OrderItem & {
  optionSnapshots: Array<{ label: string; priceDelta: Decimalish; daysDelta: number }>;
};

type OrderFull = Order & {
  preferredFounder: { displayName: string } | null;
  /** Raw include is the User row — fullName maps to the DTO's displayName. */
  assignedFounder: { id: string; fullName: string } | null;
  items: OrderItemFull[];
  statusHistory: Array<{ fromStatus: Order['status'] | null; toStatus: Order['status']; note: string | null; createdAt: Date }>;
  payments: Array<{
    id: string;
    method: Payment['method'];
    status: Payment['status'];
    amount: Decimalish;
    transactionId: string | null;
    screenshotPublicId: string | null;
    /** Private Blob pathname (new submissions); screenshotPublicId stays for legacy rows. */
    blobPath?: string | null;
    adminNote: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    // Manual-payments v2 (optional — legacy rows are null/absent)
    rejectionReason?: string | null;
    rejectedAt?: Date | null;
  }>;
  attachments?: OrderAttachment[];
  deliverables?: Deliverable[];
  revisionRequests?: RevisionRequest[];
  reviews?: Review[];
};

export function toOrderItemDto(item: OrderItemFull): OrderItemDto {
  return {
    id: item.id,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    basePrice: item.basePrice.toString(),
    quantity: item.quantity,
    lineTotal: item.lineTotal.toString(),
    requirements: item.requirements,
    optionSnapshots: [...item.optionSnapshots].map(
      (o): OrderItemOptionSnapshotDto => ({
        label: o.label,
        priceDelta: o.priceDelta.toString(),
        daysDelta: o.daysDelta,
      }),
    ),
  };
}

export function toPaymentDto(
  p: {
    id: string;
    method: Payment['method'];
    status: Payment['status'];
    amount: Decimalish;
    transactionId: string | null;
    screenshotPublicId: string | null;
    /** Private Blob pathname (new submissions); screenshotPublicId stays for legacy rows. */
    blobPath?: string | null;
    adminNote: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    rejectionReason?: string | null;
    rejectedAt?: Date | null;
  },
  options: { includeAdminFields?: boolean } = {},
): PaymentDto {
  const rejected = p.status === 'REJECTED';
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amount: p.amount.toString(),
    transactionId: p.transactionId,
    hasScreenshot: Boolean(p.blobPath || p.screenshotPublicId),
    // Staff-only notes stay hidden from customer responses. The legacy
    // `adminNote` remains populated for REJECTED rows because the customer
    // order page has always rendered it as the rejection reason; v2 also
    // exposes the dedicated rejectionReason field.
    adminNote: options.includeAdminFields || rejected ? p.adminNote : null,
    verifiedAt: p.verifiedAt?.toISOString() ?? null,
    rejectionReason: rejected ? (p.rejectionReason ?? p.adminNote) : null,
    rejectedAt: rejected ? (p.rejectedAt?.toISOString() ?? null) : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toAttachmentDto(
  a: OrderAttachment,
  downloadUrl: string | null,
): OrderAttachmentDto {
  return {
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
    downloadUrl,
  };
}

export function toDeliverableDto(d: Deliverable, downloadUrl: string | null): DeliverableDto {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    version: d.version,
    downloadCount: d.downloadCount,
    createdAt: d.createdAt.toISOString(),
    downloadUrl,
  };
}

export function toRevisionDto(r: RevisionRequest): RevisionRequestDto {
  return {
    id: r.id,
    description: r.description,
    status: r.status,
    adminResponse: r.adminResponse,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toReviewDto(r: Review): ReviewDto {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    isPublic: r.isPublic,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Full order DTO. Signed download URLs for attachments/deliverables are minted
 * by the caller (they depend on Blob storage config) and passed in.
 */
export function toOrderDto(
  order: OrderFull,
  urls: { attachments?: Map<string, string | null>; deliverables?: Map<string, string | null> } = {},
): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    title: order.title,
    deadline: order.deadline.toISOString(),
    totalAmount: order.totalAmount.toString(),
    notes: order.notes,
    preferredFounder: order.preferredFounder,
    assignedFounder: order.assignedFounder
      ? { id: order.assignedFounder.id, displayName: order.assignedFounder.fullName }
      : null,
    items: order.items.map(toOrderItemDto),
    statusHistory: [...order.statusHistory]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((h): OrderStatusEventDto => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt.toISOString(),
      })),
    payments: order.payments.map((p) => toPaymentDto(p)),
    attachments: (order.attachments ?? []).map((a) =>
      toAttachmentDto(a, urls.attachments?.get(a.id) ?? null),
    ),
    deliverables: (order.deliverables ?? []).map((d) =>
      toDeliverableDto(d, urls.deliverables?.get(d.id) ?? null),
    ),
    revisions: (order.revisionRequests ?? []).map(toRevisionDto),
    review: order.reviews?.[0] ? toReviewDto(order.reviews[0]) : null,
    createdAt: order.createdAt.toISOString(),
    // Stage 1 accounting columns — Σ VERIFIED payments and the derived
    // balance. Both were declared optional on the DTO since Stage 1; the
    // Stage 6 admin dashboard needs the server-calculated values, so the
    // mapper now always populates them (customers see only their own order).
    amountPaid: order.amountPaid?.toString() ?? '0.00',
    outstandingAmount: subtractMoney(
      order.totalAmount.toString(),
      order.amountPaid?.toString() ?? '0.00',
    ),
  };
}

export function toOrderSummaryDto(
  order: Order & {
    items: Array<{ id: string }>;
    payments: Array<{ status: Payment['status'] }>;
  },
): OrderSummaryDto {
  // Worst payment status wins: REJECTED > PENDING/SUBMITTED > VERIFIED > none
  const rank: Record<string, number> = { REJECTED: 3, REFUNDED: 2, PENDING: 1, SUBMITTED: 1, VERIFIED: 0 };
  let paymentStatus: OrderSummaryDto['paymentStatus'] = null;
  for (const p of order.payments) {
    if (paymentStatus === null || (rank[p.status] ?? 0) > (rank[paymentStatus] ?? 0)) {
      paymentStatus = p.status;
    }
  }
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    title: order.title,
    deadline: order.deadline.toISOString(),
    totalAmount: order.totalAmount.toString(),
    itemCount: order.items.length,
    paymentStatus,
    createdAt: order.createdAt.toISOString(),
  };
}

export function toAdminPaymentDto(
  p: {
    id: string;
    method: Payment['method'];
    status: Payment['status'];
    amount: Decimalish;
    transactionId: string | null;
    screenshotPublicId: string | null;
    /** Private Blob pathname (new submissions); screenshotPublicId stays for legacy rows. */
    blobPath?: string | null;
    adminNote: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    // ── Manual-payments v2 fields (null on legacy rows) ──
    senderNumber?: string | null;
    rejectedAt?: Date | null;
    methodKeySnapshot?: string | null;
    methodLabelSnapshot?: string | null;
    accountTypeSnapshot?: string | null;
    accountNumberSnapshot?: string | null;
    accountHolderSnapshot?: string | null;
    instructionsSnapshot?: string | null;
    verifiedBy?: { fullName: string } | null;
    rejectedBy?: { fullName: string } | null;
  } & {
    order: {
      id: string;
      orderNumber: string;
      title: string;
      customer: { fullName: string; email: string };
      totalAmount?: Decimalish;
      amountPaid?: Decimalish | null;
    };
  },
): AdminPaymentDto {
  return {
    ...toPaymentDto(p, { includeAdminFields: true }),
    senderNumber: p.senderNumber ?? null,
    methodKeySnapshot: p.methodKeySnapshot ?? null,
    methodLabelSnapshot: p.methodLabelSnapshot ?? null,
    accountTypeSnapshot: p.accountTypeSnapshot ?? null,
    accountNumberSnapshot: p.accountNumberSnapshot ?? null,
    accountHolderSnapshot: p.accountHolderSnapshot ?? null,
    instructionsSnapshot: p.instructionsSnapshot ?? null,
    hasScreenshot: Boolean(p.blobPath || p.screenshotPublicId),
    verifiedByName: p.verifiedBy?.fullName ?? null,
    rejectedByName: p.rejectedBy?.fullName ?? null,
    order: {
      id: p.order.id,
      orderNumber: p.order.orderNumber,
      title: p.order.title,
      customerName: p.order.customer.fullName,
      customerEmail: p.order.customer.email,
      // Queue rows include the order accounting columns so the dashboard can
      // show the order's payment position without a second query; when the
      // caller omits them the keys are omitted too — never fabricated.
      ...(p.order.totalAmount !== undefined
        ? {
            totalAmount: subtractMoney(p.order.totalAmount.toString(), '0.00'),
            ...(p.order.amountPaid !== undefined
              ? {
                  outstandingAmount: subtractMoney(
                    subtractMoney(p.order.totalAmount.toString(), '0.00'),
                    (p.order.amountPaid ?? '0.00').toString(),
                  ),
                }
              : {}),
          }
        : {}),
    },
  };
}

/**
 * Customer-safe receiving-account DTO. Deliberately excludes isActive,
 * displayOrder, usage counts, audit ids and the raw storage pathname.
 * QR images are exposed only as short-lived presigned URLs minted from the
 * private blobPath; accounts still referencing never-migrated Cloudinary
 * assets get qrUrl: null until the one-shot migration backfills blobPath.
 */
export async function toPaymentAccountOptionDto(a: PaymentAccount): Promise<PaymentAccountOptionDto> {
  return {
    id: a.id,
    methodKey: a.methodKey,
    label: a.label,
    accountType: a.accountType,
    accountNumber: a.accountNumber,
    accountHolder: a.accountHolder,
    instructions: a.instructions,
    qrUrl: a.blobPath && hasBlobStorage ? await signedDownloadUrl(a.blobPath) : null,
  };
}

type PaymentAccountWithMeta = PaymentAccount & {
  _count: { payments: number };
  createdBy: { fullName: string } | null;
  updatedBy: { fullName: string } | null;
};

/** Admin DTO — management view with usage and safe audit display fields. */
export async function toAdminPaymentAccountDto(a: PaymentAccountWithMeta): Promise<AdminPaymentAccountDto> {
  return {
    ...(await toPaymentAccountOptionDto(a)),
    isActive: a.isActive,
    displayOrder: a.displayOrder,
    hasQr: Boolean(a.blobPath || a.qrPublicId),
    usageCount: a._count.payments,
    createdById: a.createdById,
    updatedById: a.updatedById,
    createdByName: a.createdBy?.fullName ?? null,
    updatedByName: a.updatedBy?.fullName ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toAdminOrderDto(order: OrderFull & { customer: { id: string; fullName: string; email: string } }, urls?: Parameters<typeof toOrderDto>[1]): AdminOrderDto {
  return {
    ...toOrderDto(order, urls),
    // Customer-safe mapping hides staff-only notes; admins get the full view.
    payments: order.payments.map((p) => toPaymentDto(p, { includeAdminFields: true })),
    customer: {
      id: order.customer.id,
      fullName: order.customer.fullName,
      email: order.customer.email,
    },
  };
}
