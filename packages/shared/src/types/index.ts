import type {
  AccountStatus,
  FounderDiscipline,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PricingModel,
  RevisionStatus,
  ServiceType,
  UserRole,
} from '../constants/index.js';

/** Consistent API response envelope used by every endpoint. */
export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

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
  /** Stable sitemap/metadata timestamp — ISO 8601. */
  updatedAt: string;
  category: { id: string; slug: string; name: string };
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
  portfolioUrl: string | null;
  portfolioImageUrl: string | null;
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
  /** Short-lived signed URL for the private blob; minted per request. */
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
  // ── Manual-payments v2 (optional until API stages populate them) ──
  /** Customer's own MFS number for wallet rails (null for legacy rows). */
  senderNumber?: string | null;
  /** Required customer-facing reason when status is REJECTED. */
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  /** Immutable submission-time snapshots of the receiving account. */
  methodKeySnapshot?: string | null;
  methodLabelSnapshot?: string | null;
  accountTypeSnapshot?: string | null;
  accountNumberSnapshot?: string | null;
  accountHolderSnapshot?: string | null;
  instructionsSnapshot?: string | null;
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
  preferredFounder: { displayName: string } | null;
  assignedFounder: { id: string; displayName: string } | null;
  items: OrderItemDto[];
  statusHistory: OrderStatusEventDto[];
  payments: PaymentDto[];
  attachments: OrderAttachmentDto[];
  deliverables: DeliverableDto[];
  revisions: RevisionRequestDto[];
  review: ReviewDto | null;
  createdAt: string;
  // ── Manual-payments v2 accounting (optional until API stages populate) ──
  /** Σ VERIFIED payment amounts (money string) — '0.00' until money clears. */
  amountPaid?: string;
  /** totalAmount − amountPaid (money string). */
  outstandingAmount?: string;
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

/**
 * Short-lived, pathname-scoped client-upload ticket minted by
 * `POST /api/uploads/blob/token`. The browser uploads directly to Vercel Blob
 * with the scoped token; `BLOB_READ_WRITE_TOKEN` never leaves the server.
 */
export type BlobUploadTicketDto = {
  /** Server-minted pathname the client MUST upload to. */
  pathname: string;
  /** Scoped client token (pathname/content-type/size/expiry constrained). */
  token: string;
  access: 'private';
  /** ISO timestamp after which the token is rejected. */
  expiresAt: string;
};

export type AdminStatsDto = {
  customers: number;
  orders: { total: number; pending: number; active: number; completed: number };
  /** Verified money minus refunds (money string). */
  revenue: { verified: string; pending: string };
  pendingPayments: number;
  /** Last 12 months, oldest first. */
  monthly: Array<{ month: string; revenue: string; orders: number }>;
  popularServices: Array<{ name: string; orders: number }>;
  founderWorkload: Array<{ id: string; displayName: string; active: number; completed: number }>;
};

export type AdminPaymentDto = PaymentDto & {
  order: {
    id: string;
    orderNumber: string;
    title: string;
    customerName: string;
    // ── Manual-payments v2 (optional until API stages populate) ──
    totalAmount?: string;
    outstandingAmount?: string;
    customerEmail?: string;
  };
  /** True when a screenshot reference is stored (URL is minted per request). */
  hasScreenshot?: boolean;
  /** Reviewer display names — null until the corresponding review happened. */
  verifiedByName?: string | null;
  rejectedByName?: string | null;
};

/** Per-status payment counts for the admin review dashboard (Stage 6). */
export type AdminPaymentStatsDto = {
  counts: Record<PaymentStatus, number>;
  total: number;
  /** Σ amounts awaiting review (PENDING + SUBMITTED, money string). */
  awaitingAmount: string;
};

/** Server-paginated admin payment queue response (Stage 6). */
export type AdminPaymentQueueDto = {
  items: AdminPaymentDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ─── Payment accounts (manual-payments v2) ───────────────────

/** Customer-facing enabled receiving account — safe fields only. */
export type PaymentAccountOptionDto = {
  id: string;
  /** Stable rail key (BKASH / NAGAD / UPAY / …) for icon/badge lookup. */
  methodKey: string;
  /** Admin-authored display name, shown verbatim to customers. */
  label: string;
  accountType: string | null;
  accountNumber: string;
  accountHolder: string;
  instructions: string | null;
  /** Short-lived signed URL for the private QR image; null when absent/unconfigured. */
  qrUrl?: string | null;
};

/** Admin view of a receiving account — includes disabled rows + audit fields. */
export type AdminPaymentAccountDto = PaymentAccountOptionDto & {
  isActive: boolean;
  displayOrder: number;
  /** Whether a QR identifier is stored, even when blob storage is unconfigured. */
  hasQr: boolean;
  /** Number of historical payments referencing this account. */
  usageCount: number;
  createdById: string | null;
  updatedById: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Per-rail counts over the admin queue's current filter set. */
export type AdminPaymentMethodBreakdownDto = {
  methodKey: string;
  count: number;
};

/**
 * Customer-facing result of a v2 manual payment submission (manual-payments
 * v2, Stage 2). Snapshots reflect the receiving account AT SUBMISSION TIME —
 * later admin edits never rewrite them. Raw storage pathnames and admin
 * audit fields deliberately stay server-side.
 */
export type PaymentSubmissionDto = {
  id: string;
  orderId: string;
  /** Stable rail key from the account snapshot (BKASH / NAGAD / UPAY / …). */
  methodKey: string;
  /** Account label snapshot at submission time. */
  methodLabel: string | null;
  /** Receiving-account number snapshot — the account the customer paid. */
  accountNumber: string | null;
  /** Customer's own MFS number, as submitted. */
  senderNumber: string | null;
  /** Server-computed exact outstanding amount the payment must cover. */
  amount: string;
  /** Original customer-submitted transaction ID (normalized copy stays server-side). */
  transactionId: string;
  status: PaymentStatus;
  /** True when screenshot metadata was attached; never exposes the storage pathname. */
  hasScreenshot: boolean;
  createdAt: string;
};

export type AdminOrderDto = OrderDto & {
  customer: { id: string; fullName: string; email: string };
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

// ─── Marketplace v2 (public, PUBLISHED-only) ─────────────────

export type MarketplaceCategoryDto = {
  slug: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  /** Number of PUBLISHED services in the category. */
  serviceCount: number;
};

export type MarketplacePackageDto = {
  id: string;
  kind: 'PACKAGE' | 'ADDON';
  label: string;
  description: string | null;
  priceFrom: string | null;
  priceTo: string | null;
};

export type MarketplaceServiceCardDto = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  serviceType: ServiceType;
  pricingModel: PricingModel;
  /** FIXED price / STARTING_FROM floor (money string). */
  basePrice: string;
  priceFrom: string | null;
  priceTo: string | null;
  priceNote: string | null;
  /** Shown only when an admin set it — never fabricated (R6). */
  deliveryEstimateText: string | null;
  thumbnail: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isPopular: boolean;
  /** Stable sitemap/metadata timestamp — ISO 8601. */
  updatedAt: string;
  category: { slug: string; name: string; iconKey: string | null };
};

export type MarketplaceServiceDetailDto = MarketplaceServiceCardDto & {
  features: string[];
  deliverables: string[];
  requirementsText: string | null;
  acceptedFileTypes: string[];
  revisionPolicy: string | null;
  faqs: Array<{ q: string; a: string }>;
  packages: MarketplacePackageDto[];
  addOns: MarketplacePackageDto[];
};

/** Response of GET /api/marketplace/services/:slug — form fields for M4 request forms. */
export type MarketplaceServiceFormDto = {
  service: { id: string; slug: string; name: string; isRepair: boolean };
  fields: Array<{
    key: string;
    label: string;
    type: string;
    options: string[] | null;
    required: boolean;
    validation: Record<string, unknown> | null;
    helpText: string | null;
  }>;
};
