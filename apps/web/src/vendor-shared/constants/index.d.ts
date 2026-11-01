/**
 * Domain constants shared by web and api.
 * NOTE: plain const objects (not TS enums) so this package stays
 * erasable-syntax only and bundles cleanly everywhere.
 */
export declare const USER_ROLES: readonly ["CUSTOMER", "ADMIN"];
export type UserRole = (typeof USER_ROLES)[number];
export declare const ACCOUNT_STATUSES: readonly ["ACTIVE", "SUSPENDED"];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
/** Customer-facing order pipeline (stage 1–7) plus terminal failure states. */
export declare const ORDER_STATUSES: readonly ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS", "QUALITY_REVIEW", "COMPLETED", "DELIVERED", "REJECTED", "CANCELLED"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Ordered pipeline used by the UI progress tracker (REJECTED/CANCELLED are off-track). */
export declare const ORDER_PIPELINE: readonly OrderStatus[];
export declare const PAYMENT_STATUSES: readonly ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED", "REFUNDED"];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export declare const PAYMENT_METHODS: readonly ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export declare const REVISION_STATUSES: readonly ["OPEN", "IN_PROGRESS", "RESOLVED", "DECLINED"];
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export declare const NOTIFICATION_TYPES: readonly ["ORDER_STATUS", "PAYMENT", "REVISION", "DELIVERABLE", "GENERAL"];
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
