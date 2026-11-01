import type { PublicUser } from '@tsh/shared';
import type { User, FounderProfile, Service, ServiceCategory, Testimonial, PortfolioProject } from '../generated/prisma/client.js';

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
    adminNote: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
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

export function toPaymentDto(p: {
  id: string;
  method: Payment['method'];
  status: Payment['status'];
  amount: Decimalish;
  transactionId: string | null;
  screenshotPublicId: string | null;
  adminNote: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}): PaymentDto {
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amount: p.amount.toString(),
    transactionId: p.transactionId,
    hasScreenshot: Boolean(p.screenshotPublicId),
    adminNote: p.adminNote,
    verifiedAt: p.verifiedAt?.toISOString() ?? null,
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
 * by the caller (they depend on Cloudinary config) and passed in.
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
    payments: order.payments.map(toPaymentDto),
    attachments: (order.attachments ?? []).map((a) =>
      toAttachmentDto(a, urls.attachments?.get(a.id) ?? null),
    ),
    deliverables: (order.deliverables ?? []).map((d) =>
      toDeliverableDto(d, urls.deliverables?.get(d.id) ?? null),
    ),
    revisions: (order.revisionRequests ?? []).map(toRevisionDto),
    review: order.reviews?.[0] ? toReviewDto(order.reviews[0]) : null,
    createdAt: order.createdAt.toISOString(),
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
    adminNote: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
  } & { order: { id: string; orderNumber: string; title: string; customer: { fullName: string } } },
): AdminPaymentDto {
  return {
    ...toPaymentDto(p),
    order: {
      id: p.order.id,
      orderNumber: p.order.orderNumber,
      title: p.order.title,
      customerName: p.order.customer.fullName,
    },
  };
}

export function toAdminOrderDto(order: OrderFull & { customer: { id: string; fullName: string; email: string } }, urls?: Parameters<typeof toOrderDto>[1]): AdminOrderDto {
  return {
    ...toOrderDto(order, urls),
    customer: {
      id: order.customer.id,
      fullName: order.customer.fullName,
      email: order.customer.email,
    },
  };
}
