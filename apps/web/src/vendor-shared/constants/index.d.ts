/**
 * Domain constants shared by web and api.
 * NOTE: plain const objects (not TS enums) so this package stays
 * erasable-syntax only and bundles cleanly everywhere.
 */
export declare const USER_ROLES: readonly ["CUSTOMER", "ADMIN"];
export type UserRole = (typeof USER_ROLES)[number];
export declare const ACCOUNT_STATUSES: readonly ["ACTIVE", "SUSPENDED"];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
/** Customer-facing order pipeline (stage 1–7) plus terminal failure states.
 *  The last three values belong to the v2 marketplace pipeline (quotation-paid
 *  orders); legacy cart-checkout orders never occupy them. */
export declare const ORDER_STATUSES: readonly ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS", "QUALITY_REVIEW", "COMPLETED", "DELIVERED", "REJECTED", "CANCELLED", "PAID_SCHEDULED", "REVIEW_REVISION", "DELIVERED_COMPLETED"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Ordered pipeline used by the UI progress tracker (REJECTED/CANCELLED are off-track). */
export declare const ORDER_PIPELINE: readonly OrderStatus[];
export declare const PAYMENT_STATUSES: readonly ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED", "REFUNDED"];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/**
 * Rails known to the PaymentMethod enum. 'OTHER' covers admin-configured
 * custom rails (e.g. Upay) — the stable identity and display label for any
 * payment live in its methodKey/methodLabel snapshots. NOTE: the legacy
 * manual submission endpoint (paymentSubmitSchema) deliberately pins the four
 * legacy rails so the live v1 flow is unchanged; the v2 schema
 * (paymentSubmitV2Schema) is account-driven and needs no method at all.
 */
export declare const PAYMENT_METHODS: readonly ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER", "OTHER"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/** Legacy rails accepted by the v1 manual submission endpoint. */
export declare const LEGACY_PAYMENT_METHODS: readonly ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"];
export declare const REVISION_STATUSES: readonly ["OPEN", "IN_PROGRESS", "RESOLVED", "DECLINED"];
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export declare const NOTIFICATION_TYPES: readonly ["ORDER_STATUS", "PAYMENT", "REVISION", "DELIVERABLE", "GENERAL", "REQUEST_STATUS", "QUOTATION", "WALLET_DEPOSIT", "WALLET_WITHDRAWAL", "WALLET_REFUND"];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
/** Founder A = engineering, Founder B = design/docs, BOTH = assignable to either. */
export declare const FOUNDER_DISCIPLINES: readonly ["WEB_SOFTWARE_ECOMMERCE", "DESIGN_DOCS_UX", "BOTH"];
export type FounderDiscipline = (typeof FOUNDER_DISCIPLINES)[number];
export declare const FOUNDER_PREFERENCES: readonly ["FOUNDER_A", "FOUNDER_B", "AUTO_ASSIGN"];
export type FounderPreference = (typeof FOUNDER_PREFERENCES)[number];
/**
 * Legal order-status transitions, enforced server-side in order.service.
 * Key = from-status, value = allowed to-statuses (admin actions unless noted).
 */
export declare const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]>;
/**
 * Legal transitions for marketplace orders (created from an accepted quotation
 * + wallet payment, so they always start at PAID_SCHEDULED). Cancelling before
 * DELIVERED_COMPLETED triggers an automatic wallet refund (Addendum REF rules).
 */
export declare const ORDER_TRANSITIONS_V2: Partial<Record<OrderStatus, readonly OrderStatus[]>>;
/** V2 order statuses from which a cancel still owes the customer a refund. */
export declare const V2_REFUNDABLE_ON_CANCEL: readonly OrderStatus[];
/** Statuses a customer may cancel from (before real work starts). */
export declare const CUSTOMER_CANCELLABLE: readonly OrderStatus[];
/** Statuses that accept revision requests. */
export declare const REVISION_ALLOWED: readonly OrderStatus[];
export declare const UPLOAD_LIMITS: {
    readonly maxFileSizeBytes: number;
    readonly maxFilesPerRequest: 5;
    readonly allowedMimeTypes: readonly ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/png", "image/jpeg", "image/webp", "application/zip", "application/x-zip-compressed"];
};
export declare const ORDER_NUMBER_PATTERN: RegExp;
export declare const API_PREFIX = "/api";
/** Machine-readable service kinds. Thesis/academic-writing is deliberately absent. */
export declare const SERVICE_TYPES: readonly ["SD_WEB", "COMMERCIAL_WEB", "JAVA_OOP", "PRESENTATION", "LAB_REPORT", "ASSIGNMENT_FORMATTING", "PROJECT_DOCUMENTATION", "HARDWARE_PROJECT", "PC_REPAIR", "CONSULTATION"];
export type ServiceType = (typeof SERVICE_TYPES)[number];
export declare const PRICING_MODELS: readonly ["FIXED", "STARTING_FROM", "RANGE", "CUSTOM_QUOTE"];
export type PricingModel = (typeof PRICING_MODELS)[number];
/** Marketplace-only lifecycle. Legacy catalog rows keep `isActive`; v2 reads `status`. */
export declare const SERVICE_STATUSES: readonly ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"];
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export declare const FORM_FIELD_TYPES: readonly ["TEXT", "TEXTAREA", "NUMBER", "SELECT", "MULTISELECT", "DATE", "CHECKBOX", "FILE", "URL", "PHONE"];
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export declare const SERVICE_OPTION_KINDS: readonly ["PACKAGE", "ADDON"];
export type ServiceOptionKind = (typeof SERVICE_OPTION_KINDS)[number];
export declare const REQUEST_FILE_KINDS: readonly ["ATTACHMENT", "PHOTO", "DELIVERABLE"];
export type RequestFileKind = (typeof REQUEST_FILE_KINDS)[number];
/**
 * Request-side lifecycle (no money ever moved on these statuses). Repair-only
 * stages sit between submission and quotation; the payment step is the same
 * wallet flow as every other service.
 */
export declare const REQUEST_STATUSES: readonly ["REQUEST_SUBMITTED", "UNDER_REVIEW", "DIAGNOSIS_SCHEDULED", "DIAGNOSIS_SENT", "QUOTATION_SENT", "QUOTATION_DECLINED", "QUOTATION_EXPIRED", "ACCEPTED_AWAITING_PAYMENT", "ORDER_CREATED", "CANCELLED", "REJECTED"];
export type ServiceRequestStatus = (typeof REQUEST_STATUSES)[number];
export declare const REPAIR_REQUEST_STATUSES: readonly ServiceRequestStatus[];
/**
 * Legal request-status transitions. Repair-only targets are stripped for
 * non-repair services by `allowedRequestTransitions` — the map holds the
 * superset so both flows share one enforcement point.
 */
export declare const REQUEST_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]>;
/** Statuses from which the customer may still cancel (everything pre-payment). */
export declare const REQUEST_CANCELLABLE: readonly ServiceRequestStatus[];
export declare const QUOTATION_STATUSES: readonly ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "SUPERSEDED"];
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
/** Open decision default: quotations stay valid for 7 days. */
export declare const QUOTATION_VALIDITY_DAYS = 7;
export declare const REPAIR_DEVICE_TYPES: readonly ["LAPTOP", "DESKTOP"];
export type RepairDeviceType = (typeof REPAIR_DEVICE_TYPES)[number];
export declare const REPAIR_ISSUE_CATEGORIES: readonly ["WINDOWS_BOOT", "SOFTWARE_DRIVERS", "PERFORMANCE", "HARDWARE_DIAGNOSIS", "LAPTOP_SPECIFIC", "GENERAL_TROUBLESHOOTING"];
export type RepairIssueCategory = (typeof REPAIR_ISSUE_CATEGORIES)[number];
export declare const CONTACT_PREFERENCES: readonly ["WHATSAPP", "PHONE", "EMAIL", "IN_APP"];
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];
export declare const STATUS_ENTITY_TYPES: readonly ["REQUEST", "ORDER"];
export type StatusEntityType = (typeof STATUS_ENTITY_TYPES)[number];
/** Marketplace uploads: 10 MB per file, photos 5 MB, 5 files per request (defaults). */
export declare const MARKETPLACE_UPLOAD_LIMITS: {
    readonly maxFileSizeBytes: number;
    readonly maxPhotoBytes: number;
    readonly maxFilesPerRequest: 5;
    /** Extension whitelist — code/text files often arrive as octet-stream. */
    readonly allowedExtensions: readonly ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md", "java", "py", "c", "cpp", "h", "ipynb", "zip", "png", "jpg", "jpeg", "webp"];
    readonly photoExtensions: readonly ["png", "jpg", "jpeg", "webp"];
};
export declare const PAYMENT_MODES: readonly ["WALLET"];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
/** Order.paymentStatus — null/absent means the legacy manual-payment path. */
export declare const ORDER_PAYMENT_STATUSES: readonly ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"];
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];
/** Machine-readable error codes introduced by the marketplace + wallet. */
export declare const MARKETPLACE_ERROR_CODES: {
    readonly FORM_INVALID: "FORM_INVALID";
    readonly FILE_TYPE_NOT_ALLOWED: "FILE_TYPE_NOT_ALLOWED";
    readonly FILE_TOO_LARGE: "FILE_TOO_LARGE";
    readonly QUOTATION_EXPIRED: "QUOTATION_EXPIRED";
    readonly QUOTATION_NOT_ACCEPTABLE: "QUOTATION_NOT_ACCEPTABLE";
    readonly INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION";
    readonly INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE";
};
/**
 * Machine-readable error codes for the manual-payments v2 flow
 * (zero-cost Bangladesh manual verification). Surfaced via the standard
 * `{ success, error: { code, message, details } }` envelope so the UI can
 * branch on them without parsing messages.
 */
export declare const PAYMENT_ERROR_CODES: {
    /** The submitted TrxID (normalized) already backs a non-rejected payment. */
    readonly DUPLICATE_TRANSACTION: "DUPLICATE_TRANSACTION";
    /** The order already has a PENDING/SUBMITTED payment awaiting review. */
    readonly PAYMENT_ALREADY_PENDING: "PAYMENT_ALREADY_PENDING";
    /** The payment was already verified — review endpoint is a no-op guard. */
    readonly PAYMENT_ALREADY_VERIFIED: "PAYMENT_ALREADY_VERIFIED";
    /** The payment was already rejected — resubmit a corrected payment instead. */
    readonly PAYMENT_ALREADY_REJECTED: "PAYMENT_ALREADY_REJECTED";
    /** The payment is not in the reviewable (SUBMITTED) state. */
    readonly PAYMENT_NOT_REVIEWABLE: "PAYMENT_NOT_REVIEWABLE";
    /** Verified payments already cover the order total. */
    readonly ORDER_ALREADY_PAID: "ORDER_ALREADY_PAID";
    /** Customer-declared amount ≠ outstanding (details carry the expected value). */
    readonly AMOUNT_MISMATCH: "AMOUNT_MISMATCH";
    /** Unknown, disabled, or non-existent receiving account id. */
    readonly INVALID_PAYMENT_ACCOUNT: "INVALID_PAYMENT_ACCOUNT";
    /** Payment account is referenced by payments — disable it instead of deleting. */
    readonly ACCOUNT_IN_USE: "ACCOUNT_IN_USE";
};
export declare const WALLET_STATUSES: readonly ["ACTIVE", "FROZEN", "CLOSED"];
export type WalletStatus = (typeof WALLET_STATUSES)[number];
/** Append-only ledger entry types (Addendum LED-03). */
export declare const WALLET_TX_TYPES: readonly ["DEPOSIT", "ORDER_PAYMENT", "REFUND", "WITHDRAWAL_HOLD", "WITHDRAWAL_RELEASE", "WITHDRAWAL", "FEE", "ADMIN_CREDIT", "ADMIN_DEBIT", "REVERSAL"];
export type WalletTxType = (typeof WALLET_TX_TYPES)[number];
export declare const WALLET_TX_DIRECTIONS: readonly ["CREDIT", "DEBIT"];
export type WalletTxDirection = (typeof WALLET_TX_DIRECTIONS)[number];
/** Where a ledger entry points: deposit, withdrawal, order, manual adjustment. */
export declare const WALLET_REF_TYPES: readonly ["DEPOSIT", "WITHDRAWAL", "ORDER", "ADMIN_ADJUSTMENT", "REVERSAL"];
export type WalletRefType = (typeof WALLET_REF_TYPES)[number];
/** Deposit/withdrawal rails. BANK_TRANSFER is seeded disabled (Addendum §19 Q4). */
export declare const WALLET_METHODS: readonly ["BKASH", "NAGAD", "ROCKET", "BINANCE", "BANK_TRANSFER"];
export type WalletMethod = (typeof WALLET_METHODS)[number];
export declare const DEPOSIT_STATUSES: readonly ["PENDING", "APPROVED", "DECLINED", "CANCELLED"];
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];
export declare const DEPOSIT_DECLINE_REASONS: readonly ["TRX_NOT_FOUND", "AMOUNT_MISMATCH", "DUPLICATE", "SUSPECTED_FRAUD", "OTHER"];
export type DepositDeclineReason = (typeof DEPOSIT_DECLINE_REASONS)[number];
export declare const WITHDRAWAL_STATUSES: readonly ["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"];
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
/**
 * Default money limits (Addendum §19 Q8). Runtime overrides live in
 * WalletSetting rows; these are the seed/boot values.
 */
export declare const DEFAULT_WALLET_LIMITS: {
    readonly depositMin: "100.00";
    readonly depositMax: "50000.00";
    readonly withdrawalMin: "200.00";
    readonly withdrawalMax: "50000.00";
    readonly dailyWithdrawalCap: "100000.00";
    readonly holdingPeriodHours: 24;
    readonly staleDepositHours: 72;
    readonly maxPendingDepositsPerUser: 5;
    readonly depositSubmissionsPerHour: 10;
};
