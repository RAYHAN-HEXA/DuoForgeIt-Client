/**
 * Domain constants shared by web and api.
 * NOTE: plain const objects (not TS enums) so this package stays
 * erasable-syntax only and bundles cleanly everywhere.
 */
export const USER_ROLES = ['CUSTOMER', 'ADMIN'];
export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED'];
/** Customer-facing order pipeline (stage 1–7) plus terminal failure states. */
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
export const PAYMENT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER'];
export const REVISION_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DECLINED'];
export const NOTIFICATION_TYPES = [
    'ORDER_STATUS',
    'PAYMENT',
    'REVISION',
    'DELIVERABLE',
    'GENERAL',
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
};
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
};
export const ORDER_NUMBER_PATTERN = /^TSH-\d{4}-\d{6}$/;
export const API_PREFIX = '/api';
