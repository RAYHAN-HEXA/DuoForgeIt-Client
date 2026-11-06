/**
 * Domain constants shared by web and api.
 * NOTE: plain const objects (not TS enums) so this package stays
 * erasable-syntax only and bundles cleanly everywhere.
 */
export const USER_ROLES = ['CUSTOMER', 'ADMIN'];
export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED'];
/** Customer-facing order pipeline (stage 1–7) plus terminal failure states.
 *  The last three values belong to the v2 marketplace pipeline (quotation-paid
 *  orders); legacy cart-checkout orders never occupy them. */
export const ORDER_STATUSES = [
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'IN_PROGRESS',
    'QUALITY_REVIEW',
    'COMPLETED',
    'DELIVERED',
    'REJECTED',
    'CANCELLED',
    'PAID_SCHEDULED',
    'REVIEW_REVISION',
    'DELIVERED_COMPLETED',
];
/** Ordered pipeline used by the UI progress tracker (REJECTED/CANCELLED are off-track). */
export const ORDER_PIPELINE = [
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'IN_PROGRESS',
    'QUALITY_REVIEW',
    'COMPLETED',
    'DELIVERED',
];
export const PAYMENT_STATUSES = [
    'PENDING',
    'SUBMITTED',
    'VERIFIED',
    'REJECTED',
    'REFUNDED',
];
/**
 * Rails known to the PaymentMethod enum. 'OTHER' covers admin-configured
 * custom rails (e.g. Upay) — the stable identity and display label for any
 * payment live in its methodKey/methodLabel snapshots. NOTE: the legacy
 * manual submission endpoint (paymentSubmitSchema) deliberately pins the four
 * legacy rails so the live v1 flow is unchanged; the v2 schema
 * (paymentSubmitV2Schema) is account-driven and needs no method at all.
 */
export const PAYMENT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER', 'OTHER'];
/** Legacy rails accepted by the v1 manual submission endpoint. */
export const LEGACY_PAYMENT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER'];
export const REVISION_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DECLINED'];
export const NOTIFICATION_TYPES = [
    'ORDER_STATUS',
    'PAYMENT',
    'REVISION',
    'DELIVERABLE',
    'GENERAL',
    // Marketplace v2 + wallet events
    'REQUEST_STATUS',
    'QUOTATION',
    'WALLET_DEPOSIT',
    'WALLET_WITHDRAWAL',
    'WALLET_REFUND',
];
/** Founder A = engineering, Founder B = design/docs, BOTH = assignable to either. */
export const FOUNDER_DISCIPLINES = ['WEB_SOFTWARE_ECOMMERCE', 'DESIGN_DOCS_UX', 'BOTH'];
export const FOUNDER_PREFERENCES = ['FOUNDER_A', 'FOUNDER_B', 'AUTO_ASSIGN'];
/**
 * Legal order-status transitions, enforced server-side in order.service.
 * Key = from-status, value = allowed to-statuses (admin actions unless noted).
 */
export const ORDER_TRANSITIONS = {
    SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
    IN_PROGRESS: ['QUALITY_REVIEW', 'CANCELLED'],
    QUALITY_REVIEW: ['COMPLETED', 'IN_PROGRESS'],
    COMPLETED: ['DELIVERED'],
    DELIVERED: [],
    REJECTED: [],
    CANCELLED: [],
    // Marketplace-only statuses below: never reachable through the legacy map —
    // quotation-paid orders are gated by ORDER_TRANSITIONS_V2 instead.
    PAID_SCHEDULED: [],
    REVIEW_REVISION: [],
    DELIVERED_COMPLETED: [],
};
/**
 * Legal transitions for marketplace orders (created from an accepted quotation
 * + wallet payment, so they always start at PAID_SCHEDULED). Cancelling before
 * DELIVERED_COMPLETED triggers an automatic wallet refund (Addendum REF rules).
 */
export const ORDER_TRANSITIONS_V2 = {
    PAID_SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['REVIEW_REVISION', 'DELIVERED_COMPLETED', 'CANCELLED'],
    REVIEW_REVISION: ['IN_PROGRESS', 'DELIVERED_COMPLETED', 'CANCELLED'],
    DELIVERED_COMPLETED: [],
    CANCELLED: [],
};
/** V2 order statuses from which a cancel still owes the customer a refund. */
export const V2_REFUNDABLE_ON_CANCEL = [
    'PAID_SCHEDULED',
    'IN_PROGRESS',
    'REVIEW_REVISION',
];
/** Statuses a customer may cancel from (before real work starts). */
export const CUSTOMER_CANCELLABLE = ['SUBMITTED', 'UNDER_REVIEW'];
/** Statuses that accept revision requests. */
export const REVISION_ALLOWED = [
    'IN_PROGRESS',
    'QUALITY_REVIEW',
    'DELIVERED',
];
export const UPLOAD_LIMITS = {
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB per file
    maxFilesPerRequest: 5,
    allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/zip',
        'application/x-zip-compressed',
    ],
    /**
     * Extension allow-list for the general upload folders. The server maps the
     * declared MIME type to its canonical extensions and stores the file with a
     * server-generated name, so a client-supplied extension can never become a
     * pathname component.
     */
    allowedExtensions: [
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
        'png',
        'jpg',
        'jpeg',
        'webp',
        'zip',
    ],
};
/** Remote storage namespaces. Pathnames are always minted server-side. */
export const STORAGE_FOLDERS = [
    'requirements',
    'deliveries',
    'misc',
    'payments',
    'paymentAccounts',
    'requests',
];
export const ORDER_NUMBER_PATTERN = /^TSH-\d{4}-\d{6}$/;
export const API_PREFIX = '/api';
// ═══════════════ Service Marketplace v2 ═══════════════
// Request → quotation → wallet payment → delivery. A ServiceRequest is the
// pre-order, unpaid unit; Orders are created only when a quotation is accepted
// AND paid from the wallet, in one transaction (Addendum PAY-02).
/** Machine-readable service kinds. Thesis/academic-writing is deliberately absent. */
export const SERVICE_TYPES = [
    'SD_WEB',
    'COMMERCIAL_WEB',
    'JAVA_OOP',
    'PRESENTATION',
    'LAB_REPORT',
    'ASSIGNMENT_FORMATTING',
    'PROJECT_DOCUMENTATION',
    'HARDWARE_PROJECT',
    'PC_REPAIR',
    'CONSULTATION',
];
export const PRICING_MODELS = ['FIXED', 'STARTING_FROM', 'RANGE', 'CUSTOM_QUOTE'];
/** Marketplace-only lifecycle. Legacy catalog rows keep `isActive`; v2 reads `status`. */
export const SERVICE_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'];
export const FORM_FIELD_TYPES = [
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'SELECT',
    'MULTISELECT',
    'DATE',
    'CHECKBOX',
    'FILE',
    'URL',
    'PHONE',
];
export const SERVICE_OPTION_KINDS = ['PACKAGE', 'ADDON'];
export const REQUEST_FILE_KINDS = ['ATTACHMENT', 'PHOTO', 'DELIVERABLE'];
/**
 * Request-side lifecycle (no money ever moved on these statuses). Repair-only
 * stages sit between submission and quotation; the payment step is the same
 * wallet flow as every other service.
 */
export const REQUEST_STATUSES = [
    'REQUEST_SUBMITTED',
    'UNDER_REVIEW',
    'DIAGNOSIS_SCHEDULED',
    'DIAGNOSIS_SENT',
    'QUOTATION_SENT',
    'QUOTATION_DECLINED',
    'QUOTATION_EXPIRED',
    'ACCEPTED_AWAITING_PAYMENT',
    'ORDER_CREATED',
    'CANCELLED',
    'REJECTED',
];
export const REPAIR_REQUEST_STATUSES = [
    'DIAGNOSIS_SCHEDULED',
    'DIAGNOSIS_SENT',
];
/**
 * Legal request-status transitions. Repair-only targets are stripped for
 * non-repair services by `allowedRequestTransitions` — the map holds the
 * superset so both flows share one enforcement point.
 */
export const REQUEST_TRANSITIONS = {
    REQUEST_SUBMITTED: ['UNDER_REVIEW', 'DIAGNOSIS_SCHEDULED', 'CANCELLED', 'REJECTED'],
    UNDER_REVIEW: ['QUOTATION_SENT', 'DIAGNOSIS_SCHEDULED', 'CANCELLED', 'REJECTED'],
    DIAGNOSIS_SCHEDULED: ['DIAGNOSIS_SENT', 'CANCELLED', 'REJECTED'],
    DIAGNOSIS_SENT: [
        'ACCEPTED_AWAITING_PAYMENT',
        'QUOTATION_DECLINED',
        'QUOTATION_EXPIRED',
        'CANCELLED',
        'REJECTED',
    ],
    QUOTATION_SENT: [
        'ACCEPTED_AWAITING_PAYMENT',
        'QUOTATION_DECLINED',
        'QUOTATION_EXPIRED',
        'CANCELLED',
        'REJECTED',
    ],
    QUOTATION_DECLINED: ['QUOTATION_SENT', 'CANCELLED'],
    QUOTATION_EXPIRED: ['QUOTATION_SENT', 'CANCELLED'],
    ACCEPTED_AWAITING_PAYMENT: ['ORDER_CREATED', 'QUOTATION_EXPIRED', 'CANCELLED'],
    ORDER_CREATED: [], // terminal on the request side — the order pipeline takes over
    CANCELLED: [],
    REJECTED: [],
};
/** Statuses from which the customer may still cancel (everything pre-payment). */
export const REQUEST_CANCELLABLE = [
    'REQUEST_SUBMITTED',
    'UNDER_REVIEW',
    'DIAGNOSIS_SCHEDULED',
    'DIAGNOSIS_SENT',
    'QUOTATION_SENT',
    'QUOTATION_DECLINED',
    'QUOTATION_EXPIRED',
    'ACCEPTED_AWAITING_PAYMENT',
];
export const QUOTATION_STATUSES = [
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'SUPERSEDED',
];
/** Open decision default: quotations stay valid for 7 days. */
export const QUOTATION_VALIDITY_DAYS = 7;
export const REPAIR_DEVICE_TYPES = ['LAPTOP', 'DESKTOP'];
export const REPAIR_ISSUE_CATEGORIES = [
    'WINDOWS_BOOT',
    'SOFTWARE_DRIVERS',
    'PERFORMANCE',
    'HARDWARE_DIAGNOSIS',
    'LAPTOP_SPECIFIC',
    'GENERAL_TROUBLESHOOTING',
];
export const CONTACT_PREFERENCES = ['WHATSAPP', 'PHONE', 'EMAIL', 'IN_APP'];
export const STATUS_ENTITY_TYPES = ['REQUEST', 'ORDER'];
/** Marketplace uploads: 10 MB per file, photos 5 MB, 5 files per request (defaults). */
export const MARKETPLACE_UPLOAD_LIMITS = {
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxPhotoBytes: 5 * 1024 * 1024,
    maxFilesPerRequest: 5,
    /** Extension whitelist — code/text files often arrive as octet-stream. */
    allowedExtensions: [
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'md',
        'java', 'py', 'c', 'cpp', 'h', 'ipynb',
        'zip',
        'png', 'jpg', 'jpeg', 'webp',
    ],
    photoExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};
export const PAYMENT_MODES = ['WALLET'];
/** Order.paymentStatus — null/absent means the legacy manual-payment path. */
export const ORDER_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
/** Machine-readable error codes introduced by the marketplace + wallet. */
export const MARKETPLACE_ERROR_CODES = {
    FORM_INVALID: 'FORM_INVALID',
    FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    QUOTATION_EXPIRED: 'QUOTATION_EXPIRED',
    QUOTATION_NOT_ACCEPTABLE: 'QUOTATION_NOT_ACCEPTABLE',
    INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
};
/**
 * Machine-readable error codes for the manual-payments v2 flow
 * (zero-cost Bangladesh manual verification). Surfaced via the standard
 * `{ success, error: { code, message, details } }` envelope so the UI can
 * branch on them without parsing messages.
 */
export const PAYMENT_ERROR_CODES = {
    /** The submitted TrxID (normalized) already backs a non-rejected payment. */
    DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
    /** The order already has a PENDING/SUBMITTED payment awaiting review. */
    PAYMENT_ALREADY_PENDING: 'PAYMENT_ALREADY_PENDING',
    /** The payment was already verified — review endpoint is a no-op guard. */
    PAYMENT_ALREADY_VERIFIED: 'PAYMENT_ALREADY_VERIFIED',
    /** The payment was already rejected — resubmit a corrected payment instead. */
    PAYMENT_ALREADY_REJECTED: 'PAYMENT_ALREADY_REJECTED',
    /** The payment is not in the reviewable (SUBMITTED) state. */
    PAYMENT_NOT_REVIEWABLE: 'PAYMENT_NOT_REVIEWABLE',
    /** Verified payments already cover the order total. */
    ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
    /** Customer-declared amount ≠ outstanding (details carry the expected value). */
    AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
    /** Unknown, disabled, or non-existent receiving account id. */
    INVALID_PAYMENT_ACCOUNT: 'INVALID_PAYMENT_ACCOUNT',
    /** Payment account is referenced by payments — disable it instead of deleting. */
    ACCOUNT_IN_USE: 'ACCOUNT_IN_USE',
};
// ═══════════════ Wallet (Addendum v1.1) ═══════════════
export const WALLET_STATUSES = ['ACTIVE', 'FROZEN', 'CLOSED'];
/** Append-only ledger entry types (Addendum LED-03). */
export const WALLET_TX_TYPES = [
    'DEPOSIT',
    'ORDER_PAYMENT',
    'REFUND',
    'WITHDRAWAL_HOLD',
    'WITHDRAWAL_RELEASE',
    'WITHDRAWAL',
    'FEE',
    'ADMIN_CREDIT',
    'ADMIN_DEBIT',
    'REVERSAL',
];
export const WALLET_TX_DIRECTIONS = ['CREDIT', 'DEBIT'];
/** Where a ledger entry points: deposit, withdrawal, order, manual adjustment. */
export const WALLET_REF_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'ORDER', 'ADMIN_ADJUSTMENT', 'REVERSAL'];
/** Deposit/withdrawal rails. BANK_TRANSFER is seeded disabled (Addendum §19 Q4). */
export const WALLET_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'BINANCE', 'BANK_TRANSFER'];
export const DEPOSIT_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED'];
export const DEPOSIT_DECLINE_REASONS = [
    'TRX_NOT_FOUND',
    'AMOUNT_MISMATCH',
    'DUPLICATE',
    'SUSPECTED_FRAUD',
    'OTHER',
];
export const WITHDRAWAL_STATUSES = ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'];
/**
 * Default money limits (Addendum §19 Q8). Runtime overrides live in
 * WalletSetting rows; these are the seed/boot values.
 */
export const DEFAULT_WALLET_LIMITS = {
    depositMin: '100.00',
    depositMax: '50000.00',
    withdrawalMin: '200.00',
    withdrawalMax: '50000.00',
    dailyWithdrawalCap: '100000.00',
    holdingPeriodHours: 24,
    staleDepositHours: 72,
    maxPendingDepositsPerUser: 5,
    depositSubmissionsPerHour: 10,
};
