import { z } from 'zod';
import { PAYMENT_METHODS } from '../constants/index.js';
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
export const paymentSubmitSchema = z.object({
    method: z.enum(PAYMENT_METHODS),
    transactionId: z.string().trim().min(6).max(60),
});
export const paymentReviewSchema = z.object({
    note: z.string().trim().max(2000).optional(),
});
