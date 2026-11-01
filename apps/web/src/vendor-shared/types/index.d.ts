import type { AccountStatus, FounderDiscipline, NotificationType, OrderStatus, PaymentMethod, PaymentStatus, RevisionStatus, UserRole } from '../constants/index.js';
/** Consistent API response envelope used by every endpoint. */
export type ApiEnvelope<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};
export type Paginated<T> = {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
};
/** Public shape of a user — never includes role writes or internal fields clients can't see. */
export type PublicUser = {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    profileImage: string | null;
    role: UserRole;
    emailVerified: boolean;
    accountStatus: AccountStatus;
    createdAt: string;
};
export type ServiceOptionDto = {
    id: string;
    groupKey: string;
    label: string;
    /** Money values cross the API as strings — never floats. */
    priceDelta: string;
    daysDelta: number;
    isDefault: boolean;
    displayOrder: number;
};
export type ServiceDto = {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    description: string;
    basePrice: string;
    deliveryDays: number;
    imageUrl: string | null;
    isFeatured: boolean;
    category: {
        id: string;
        slug: string;
        name: string;
    };
    options: ServiceOptionDto[];
};
export type ServiceCategoryDto = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
};
export type FounderDto = {
    id: string;
    displayName: string;
    title: string;
    bio: string;
    photoUrl: string | null;
    skills: string[];
    discipline: FounderDiscipline;
    isSelectable: boolean;
};
export type TestimonialDto = {
    id: string;
    authorName: string;
    authorTitle: string | null;
    quote: string;
    avatarUrl: string | null;
    rating: number;
};
export type PortfolioProjectDto = {
    id: string;
    title: string;
    description: string;
    imageUrl: string | null;
    projectUrl: string | null;
};
export type HomepageDto = {
    categories: ServiceCategoryDto[];
    featuredServices: ServiceDto[];
    founders: FounderDto[];
    testimonials: TestimonialDto[];
    portfolio: PortfolioProjectDto[];
    content: Record<string, unknown>;
};
export type OrderItemOptionSnapshotDto = {
    label: string;
    priceDelta: string;
    daysDelta: number;
};
export type OrderItemDto = {
    id: string;
    serviceId: string;
    serviceName: string;
    basePrice: string;
    quantity: number;
    lineTotal: string;
    requirements: string | null;
    optionSnapshots: OrderItemOptionSnapshotDto[];
};
export type OrderStatusEventDto = {
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: string;
};
export type OrderAttachmentDto = {
    id: string;
    kind: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    /** Short-lived signed URL, minted per request. Never persisted. */
    downloadUrl: string | null;
};
export type PaymentDto = {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: string;
    transactionId: string | null;
    hasScreenshot: boolean;
    adminNote: string | null;
    verifiedAt: string | null;
    createdAt: string;
};
export type DeliverableDto = {
    id: string;
    title: string;
    description: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    version: number;
    downloadCount: number;
    createdAt: string;
    downloadUrl: string | null;
};
export type RevisionRequestDto = {
    id: string;
    description: string;
    status: RevisionStatus;
    adminResponse: string | null;
    createdAt: string;
};
export type OrderDto = {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    title: string;
    deadline: string;
    totalAmount: string;
    notes: string | null;
    preferredFounder: {
        displayName: string;
    } | null;
    assignedFounder: {
        id: string;
        displayName: string;
    } | null;
    items: OrderItemDto[];
    statusHistory: OrderStatusEventDto[];
    payments: PaymentDto[];
    attachments: OrderAttachmentDto[];
    deliverables: DeliverableDto[];
    revisions: RevisionRequestDto[];
    review: ReviewDto | null;
    createdAt: string;
};
export type OrderSummaryDto = {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    title: string;
    deadline: string;
    totalAmount: string;
    itemCount: number;
    /** Worst-case payment status across the order's payments (null → none submitted). */
    paymentStatus: PaymentStatus | null;
    createdAt: string;
};
export type CheckoutResultDto = {
    order: OrderDto;
    /** true → the idempotency key matched an earlier order (retry/replay). */
    replayed: boolean;
};
export type ReviewDto = {
    id: string;
    rating: number;
    comment: string | null;
    isPublic: boolean;
    createdAt: string;
};
/** Cart line as returned by GET /api/cart — totals computed server-side. */
export type CartItemDto = {
    id: string;
    quantity: number;
    requirements: string | null;
    service: {
        id: string;
        slug: string;
        name: string;
        imageUrl: string | null;
        basePrice: string;
        deliveryDays: number;
    };
    options: ServiceOptionDto[];
    /** basePrice + Σ option priceDeltas, per unit (money string). */
    unitPrice: string;
    /** unitPrice × quantity (money string). */
    lineTotal: string;
    /** deliveryDays + Σ option daysDeltas (floor 1). */
    estimatedDays: number;
};
export type CartDto = {
    id: string;
    items: CartItemDto[];
    /** Σ lineTotals (money string). */
    subtotal: string;
    /** Kept separate from subtotal for future fees; equals subtotal in v1. */
    total: string;
    /** Longest item estimate — the realistic project length for the whole cart. */
    estimatedDays: number;
};
export type NotificationsResponseDto = {
    items: NotificationDto[];
    unread: number;
};
/** Response of POST /api/uploads/sign — client uploads directly to Cloudinary. */
export type UploadSignatureDto = {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    /** Signature over folder + public_id + timestamp. */
    signature: string;
    folder: string;
    /** Pre-assigned public id the client MUST use (it is part of the signature). */
    publicId: string;
    uploadUrl: string;
};
export type AdminStatsDto = {
    customers: number;
    orders: {
        total: number;
        pending: number;
        active: number;
        completed: number;
    };
    /** Verified money minus refunds (money string). */
    revenue: {
        verified: string;
        pending: string;
    };
    pendingPayments: number;
    /** Last 12 months, oldest first. */
    monthly: Array<{
        month: string;
        revenue: string;
        orders: number;
    }>;
    popularServices: Array<{
        name: string;
        orders: number;
    }>;
    founderWorkload: Array<{
        id: string;
        displayName: string;
        active: number;
        completed: number;
    }>;
};
export type AdminPaymentDto = PaymentDto & {
    order: {
        id: string;
        orderNumber: string;
        title: string;
        customerName: string;
    };
};
export type AdminOrderDto = OrderDto & {
    customer: {
        id: string;
        fullName: string;
        email: string;
    };
};
export type NotificationDto = {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    readAt: string | null;
    createdAt: string;
};
