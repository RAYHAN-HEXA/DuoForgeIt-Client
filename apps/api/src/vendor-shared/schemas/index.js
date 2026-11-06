import { z } from 'zod';
import { LEGACY_PAYMENT_METHODS, MARKETPLACE_UPLOAD_LIMITS, PRICING_MODELS, SERVICE_TYPES, STORAGE_FOLDERS, UPLOAD_LIMITS, } from '../constants/index.js';
// ─── Pagination ──────────────────────────────────────────────
export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
// ─── Auth / profile (Firebase owns credentials; profile lives in Neon) ─────
/** Client-side login form (Firebase handles the actual credential check). */
export const loginFormSchema = z.object({
    email: z.email('Enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});
/** Client-side registration form (Firebase creates the account). */
export const registerFormSchema = z
    .object({
    fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
    email: z.email('Enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(128),
    confirmPassword: z.string(),
})
    .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});
export const forgotPasswordSchema = z.object({
    email: z.email('Enter a valid email address'),
});
export const profileUpdateSchema = z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z
        .string()
        .trim()
        .regex(/^(\+?880|0)1[3-9]\d{8}$/, 'Must be a valid Bangladeshi phone number')
        .optional()
        .or(z.literal('')),
    profileImage: z.url().optional(),
});
// ─── Contact form ────────────────────────────────────────────
export const contactSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    subject: z.string().trim().max(200).optional(),
    message: z.string().trim().min(10).max(5000),
    /**
     * Honeypot — humans never see it, bots fill it. NOT rejected by the schema:
     * the API accepts silently (202) and discards so bots learn nothing.
     */
    website: z.string().max(500).optional(),
});
// ─── Catalog (admin CRUD, Phase 3+) ──────────────────────────
export const serviceOptionSchema = z.object({
    groupKey: z.string().trim().min(1).max(50),
    label: z.string().trim().min(1).max(120),
    /** Money as string with up to 2 decimals; may be negative for discounts. */
    priceDelta: z
        .string()
        .regex(/^-?\d+(\.\d{1,2})?$/)
        .default('0'),
    daysDelta: z.number().int().default(0),
    isDefault: z.boolean().default(false),
    displayOrder: z.number().int().default(0),
});
export const serviceUpsertSchema = z.object({
    slug: z
        .string()
        .trim()
        .min(3)
        .max(120)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase kebab-case'),
    name: z.string().trim().min(3).max(160),
    tagline: z.string().trim().max(200).optional(),
    description: z.string().trim().min(10),
    basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    deliveryDays: z.number().int().min(1).max(365),
    categoryId: z.uuid(),
    imageUrl: z.url().optional(),
    isFeatured: z.boolean().default(false),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().default(0),
    options: z.array(serviceOptionSchema).max(30).default([]),
});
// ─── Cart (Phase 3+) ─────────────────────────────────────────
export const cartItemAddSchema = z.object({
    serviceId: z.uuid(),
    quantity: z.number().int().min(1).max(10).default(1),
    optionIds: z.array(z.uuid()).max(20).default([]),
    requirements: z.string().trim().max(8000).optional(),
});
// ─── Orders / checkout (Phase 4+) ────────────────────────────
export const founderPreferenceSchema = z.enum(['FOUNDER_A', 'FOUNDER_B', 'AUTO_ASSIGN']);
export const checkoutSchema = z.object({
    idempotencyKey: z.uuid(),
    items: z
        .array(z.object({
        serviceId: z.uuid(),
        quantity: z.number().int().min(1).max(10),
        optionIds: z.array(z.uuid()).max(20).default([]),
        requirements: z.string().trim().max(8000).optional(),
    }))
        .min(1)
        .max(20),
    /** ISO datetime; must be ≥ 24h from now (server-validated). */
    deadline: z.coerce.date(),
    founderPreference: founderPreferenceSchema,
    notes: z.string().trim().max(8000).optional(),
    /** Attachment ids from pre-uploaded files owned by this customer. */
    attachmentIds: z.array(z.uuid()).max(25).default([]),
});
// ─── Payments (Phase 4/5+) ───────────────────────────────────
/**
 * LEGACY v1 manual submission (bare method + TrxID). Pinned to the four
 * legacy rails — deliberately NOT z.enum(PAYMENT_METHODS) — so adding
 * 'OTHER' to the enum cannot change the live v1 endpoint. Superseded by
 * paymentSubmitV2Schema in the manual-payments v2 stage.
 */
export const paymentSubmitSchema = z.object({
    method: z.enum(LEGACY_PAYMENT_METHODS),
    transactionId: z.string().trim().min(6).max(60),
});
/**
 * Manual-payments v2 submission: the customer picks a receiving ACCOUNT
 * (server derives method/label/number from the PaymentAccount row — the
 * client never supplies receiving details), declares what it sent, and the
 * server independently validates the amount against the order's outstanding
 * balance and the screenshot namespace against the authenticated user.
 *
 * Trust-model note (accepted, same as every existing upload path): screenshot
 * MIME/size are client-DECLARED metadata — the server validates the declared
 * values, the server-minted Blob namespace, and (when Blob is configured)
 * the stored blob's real size/content-type before accepting the reference.
 */
export const paymentSubmitV2Schema = z.object({
    accountId: z.uuid(),
    transactionId: z.string().trim().min(6).max(60),
    /** Customer's own MFS number; required for wallet rails, optional for bank. */
    senderNumber: z.string().trim().max(32).optional(),
    /** Customer-declared amount (money string); must equal the outstanding. */
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    screenshotPathname: z.string().trim().min(5).max(300).optional(),
    screenshotMimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
    screenshotSizeBytes: z.number().int().positive().max(5 * 1024 * 1024).optional(),
});
/**
 * Admin verify/reject decision (manual-payments v2). A rejection REQUIRES a
 * customer-facing reason (5–2000 chars); verification note stays optional.
 */
export const paymentReviewSchema = z
    .object({
    decision: z.enum(['VERIFIED', 'REJECTED']),
    note: z.string().trim().max(2000).optional(),
})
    .refine((b) => b.decision !== 'REJECTED' || (b.note?.trim().length ?? 0) >= 5, {
    message: 'A rejection reason is required (at least 5 characters)',
    path: ['note'],
});
// ─── Payment accounts (admin-managed receiving accounts, v2) ──
/** Stable custom-rail keys: uppercase letters/digits/underscores, e.g. BKASH, UPAY. */
export const paymentMethodKeySchema = z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Uppercase letters, digits and underscores (e.g. BKASH, UPAY)');
export const paymentAccountCreateSchema = z.object({
    methodKey: paymentMethodKeySchema,
    label: z.string().trim().min(2).max(120),
    accountType: z.string().trim().max(40).optional(),
    accountNumber: z.string().trim().min(4).max(60),
    accountHolder: z.string().trim().min(2).max(120),
    instructions: z.string().trim().max(1000).optional(),
    /**
     * Private Blob pathname minted by POST /api/uploads/blob/token with
     * folder=paymentAccounts. The server additionally enforces the admin-only QR
     * namespace — a client can never attach an arbitrary id or URL.
     */
    qrPathname: z.string().trim().min(5).max(300).optional(),
    isActive: z.boolean().default(true),
    /** Omit to append after the current highest position (server-derived). */
    displayOrder: z.number().int().min(0).max(100_000).optional(),
});
/**
 * Admin edit contract. Nullable optional fields allow an administrator to
 * explicitly clear a value (e.g. `qrPathname: null` removes the QR image);
 * omitting the field leaves it unchanged.
 */
export const paymentAccountUpdateSchema = paymentAccountCreateSchema.partial().extend({
    accountType: z.string().trim().max(40).nullable().optional(),
    instructions: z.string().trim().max(1000).nullable().optional(),
    qrPathname: z.string().trim().min(5).max(300).nullable().optional(),
});
/**
 * Atomic display-order update. Every entry must reference a distinct account
 * and a distinct position; the service rejects unknown ids rather than
 * silently ignoring them.
 */
export const paymentAccountReorderSchema = z
    .object({
    items: z
        .array(z.object({
        id: z.uuid(),
        displayOrder: z.number().int().min(0).max(100_000),
    }))
        .min(1)
        .max(200),
})
    .superRefine((value, ctx) => {
    const ids = new Set();
    const positions = new Set();
    value.items.forEach((item, index) => {
        if (ids.has(item.id)) {
            ctx.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'Duplicate account id' });
        }
        ids.add(item.id);
        if (positions.has(item.displayOrder)) {
            ctx.addIssue({
                code: 'custom',
                path: ['items', index, 'displayOrder'],
                message: 'Duplicate display order',
            });
        }
        positions.add(item.displayOrder);
    });
});
/** Admin payment queue filters (v2): status/method/search/date range + paging. */
export const adminPaymentListQuerySchema = paginationQuerySchema.extend({
    status: z.string().trim().max(30).optional(),
    method: z.string().trim().max(30).optional(),
    search: z.string().trim().max(120).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});
// ─── Marketplace request forms (data-driven) ─────────────────
// Each service defines its own ServiceFormField rows; this builder turns those
// rows into the zod schema that validates a submission's `answers` JSON. The
// client never decides which fields exist or which are required.
/** Admin-authored per-field validation constraints (stored in validation JSON). */
export const formFieldValidationSchema = z.object({
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    /** Admin-authored regex (source string); applied only in submit mode. */
    pattern: z.string().min(1).max(300).optional(),
    message: z.string().trim().max(200).optional(),
    /** Max number of files for FILE fields (bounded by platform limits). */
    maxFiles: z.number().int().min(1).max(MARKETPLACE_UPLOAD_LIMITS.maxFilesPerRequest).optional(),
});
const BD_PHONE = /^(\+?880|0)1[3-9]\d{8}$/;
function fieldSchema(field, mode) {
    const v = field.validation ?? {};
    const message = v.message;
    // Type-level message so a *missing* required field says "X is required"
    // instead of zod's "expected string, received undefined".
    const requiredError = mode === 'submit' && field.required ? (message ?? `${field.label} is required`) : undefined;
    const typeParams = requiredError ? { error: requiredError } : undefined;
    let base;
    switch (field.type) {
        case 'TEXT': {
            let s = z.string(typeParams).trim();
            if (v.minLength)
                s = s.min(v.minLength, message);
            s = s.max(v.maxLength ?? 500, message);
            base = s;
            break;
        }
        case 'TEXTAREA': {
            let s = z.string(typeParams).trim();
            if (v.minLength)
                s = s.min(v.minLength, message);
            s = s.max(v.maxLength ?? 5000, message);
            base = s;
            break;
        }
        case 'NUMBER': {
            let s = z.coerce.number(typeParams);
            if (v.min !== undefined)
                s = s.min(v.min, message);
            if (v.max !== undefined)
                s = s.max(v.max, message);
            base = s;
            break;
        }
        case 'SELECT': {
            const options = field.options ?? [];
            base = options.length
                ? z.enum(options, { message: message ?? requiredError })
                : z.string(typeParams).max(200);
            break;
        }
        case 'MULTISELECT': {
            const options = field.options ?? [];
            const inner = options.length ? z.enum(options) : z.string().max(200);
            base = z.array(inner, typeParams).max(options.length || 50, message);
            break;
        }
        case 'DATE':
            base = z.coerce.date(typeParams);
            break;
        case 'CHECKBOX':
            base = z.boolean(typeParams);
            break;
        case 'FILE':
            // Upload references (staged RequestFile ids) — type/size already checked
            // server-side at upload registration; here we only bound the count.
            base = z
                .array(z.uuid(), typeParams)
                .max(v.maxFiles ?? MARKETPLACE_UPLOAD_LIMITS.maxFilesPerRequest, message);
            break;
        case 'URL':
            base = z.url({ message: message ?? requiredError }).max(2000);
            break;
        case 'PHONE':
            base = z
                .string(typeParams)
                .trim()
                .regex(BD_PHONE, message ?? 'Must be a valid Bangladeshi phone number');
            break;
    }
    if (mode === 'draft')
        return base.optional();
    if (!field.required)
        return base.optional();
    if (field.type === 'TEXT' || field.type === 'TEXTAREA') {
        // Required text fields must be non-empty (min(1) unless a longer min is set).
        const s = base;
        return s.min(1, message ?? `${field.label} is required`);
    }
    return base;
}
/**
 * Build the zod schema for a service request's `answers` object.
 *  - submit: required fields enforced; unknown keys rejected (FORM_INVALID).
 *  - draft:  everything optional; unknown keys stripped (autosave tolerance).
 */
export function buildRequestAnswersSchema(fields, mode = 'submit') {
    const shape = {};
    for (const field of fields) {
        shape[field.key] = fieldSchema(field, mode);
    }
    // draft: unknown keys stripped (autosave tolerance) — z.object's default.
    // submit: unknown keys rejected (FORM_INVALID) via strictObject.
    const schema = mode === 'draft' ? z.object(shape) : z.strictObject(shape);
    return schema;
}
/** Valid field keys: lowercase kebab/snake identifiers — keeps JSON keys safe. */
export const formFieldKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and underscores');
// ─── Marketplace public listing ──────────────────────────────
/**
 * Query for GET /api/marketplace/services.
 *  pricing: 'priced' = anything with an up-front number (FIXED/STARTING_FROM/RANGE),
 *           or one exact PRICING_MODELS value.
 */
export const marketplaceListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
    category: z.string().trim().max(120).optional(),
    search: z.string().trim().max(120).optional(),
    serviceType: z.enum(SERVICE_TYPES).optional(),
    pricing: z
        .union([z.enum(['priced']), z.enum(PRICING_MODELS)])
        .optional(),
    /** Section filters for the marketplace page: Popular / Featured rows. */
    badge: z.enum(['popular', 'featured']).optional(),
    sort: z.enum(['popular', 'price_asc', 'price_desc', 'newest']).default('popular'),
});
/** POST /api/marketplace/requests — answers are re-validated server-side
 *  against the service's stored form fields (buildRequestAnswersSchema). */
export const serviceRequestCreateSchema = z.object({
    answers: z.record(z.string(), z.unknown()).default({}),
    deadline: z.coerce.date().optional(),
    contactPreference: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'IN_APP']).optional(),
    notes: z.string().trim().max(2000).optional(),
});
/** POST /api/uploads/blob/token — request a scoped client-upload ticket.
 *  The server derives the pathname and upload constraints; the client cannot
 *  choose its own storage namespace. */
export const blobUploadTokenRequestSchema = z.object({
    folder: z.enum(STORAGE_FOLDERS),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(120),
    sizeBytes: z.number().int().positive().max(UPLOAD_LIMITS.maxFileSizeBytes),
    kind: z.enum(['ATTACHMENT', 'PHOTO']).optional(),
});
/** POST /api/marketplace/files — register a Blob-uploaded file as a
 *  staged RequestFile (requestId null until a request claims it). Type/size
 *  are re-validated server-side against MARKETPLACE_UPLOAD_LIMITS. */
export const requestFileRegisterSchema = z.object({
    /** Blob pathname returned by the scoped upload ticket. */
    storagePath: z.string().trim().min(5).max(300),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(120),
    sizeBytes: z.number().int().min(1),
    kind: z.enum(['ATTACHMENT', 'PHOTO']).default('ATTACHMENT'),
});
