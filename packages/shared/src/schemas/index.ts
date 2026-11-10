import { z } from 'zod';
import {
  FOUNDER_DISCIPLINES,
  FORM_FIELD_TYPES,
  LEGACY_PAYMENT_METHODS,
  MARKETPLACE_UPLOAD_LIMITS,
  PRICING_MODELS,
  REQUEST_STATUSES,
  SERVICE_OPTION_KINDS,
  SERVICE_STATUSES,
  SERVICE_TYPES,
  STORAGE_FOLDERS,
  UPLOAD_LIMITS,
  type FormFieldType,
} from '../constants/index.js';
import { emailFieldSchema } from '../validation/email.js';

// ─── Pagination ──────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ─── Auth / profile (Firebase owns credentials; profile lives in Neon) ─────

/** Client-side login form (Firebase handles the actual credential check). */
export const loginFormSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type LoginForm = z.infer<typeof loginFormSchema>;

/** Client-side registration form (Firebase creates the account *after* the
 *  emailed OTP is verified — an unproven address can never create an account). */
export const registerFormSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
    email: emailFieldSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterForm = z.infer<typeof registerFormSchema>;

// ─── Email OTP (registration gate + legacy-account verification) ──────────

export const OTP_PURPOSES = ['REGISTER', 'VERIFY'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/**
 * POST /api/auth/otp/request — email a 6-digit code. REGISTER pre-checks that
 * the address isn't already linked to an account; VERIFY remediates existing
 * (legacy) unverified accounts. The server re-runs this schema so a bypassed
 * client form still hits strict syntax + disposable-domain rejection.
 */
export const otpRequestSchema = z.object({
  email: emailFieldSchema,
  purpose: z.enum(OTP_PURPOSES),
  /** Optional — used only to personalise the REGISTER email. */
  fullName: z.string().trim().max(120).optional(),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** POST /api/auth/otp/verify — check the code, get a single-use grant token. */
export const otpVerifySchema = z.object({
  email: emailFieldSchema,
  purpose: z.enum(OTP_PURPOSES),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** POST /api/auth/sync — optional proof that the email passed OTP verification. */
export const authSyncSchema = z.object({
  registrationGrant: z.string().trim().min(20).max(200).optional(),
});
export type AuthSyncInput = z.infer<typeof authSyncSchema>;

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
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

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

// ─── Catalog (admin CRUD) ────────────────────────────────────

/** Non-negative money as a string with up to 2 decimals — never a float. */
const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Use a number with up to 2 decimals');

/** Integer cents from a validated money string (for comparisons only). */
function moneyCents(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const serviceFaqSchema = z.object({
  q: z.string().trim().min(3).max(200),
  a: z.string().trim().min(1).max(2000),
});
export type ServiceFaq = z.infer<typeof serviceFaqSchema>;

export const serviceOptionSchema = z
  .object({
    /** Present when editing an existing row (omitted → create). */
    id: z.uuid().optional(),
    kind: z.enum(SERVICE_OPTION_KINDS),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    priceFrom: moneyStringSchema.optional(),
    priceTo: moneyStringSchema.optional(),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    const from = moneyCents(value.priceFrom);
    const to = moneyCents(value.priceTo);
    if (from !== null && to !== null && from > to) {
      ctx.addIssue({ code: 'custom', path: ['priceTo'], message: 'Max price must be ≥ min price' });
    }
  });
export type ServiceOptionInput = z.infer<typeof serviceOptionSchema>;

export const serviceFormFieldInputSchema = z
  .object({
    id: z.uuid().optional(),
    key: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Start with a letter; letters, numbers and underscores only'),
    label: z.string().trim().min(1).max(160),
    type: z.enum(FORM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    required: z.boolean().default(false),
    helpText: z.string().trim().max(500).optional(),
    displayOrder: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if ((value.type === 'SELECT' || value.type === 'MULTISELECT') && value.options.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Select fields need at least one option' });
    }
  });
export type ServiceFormFieldInput = z.infer<typeof serviceFormFieldInputSchema>;

/**
 * Full admin editor contract for creating/replacing a marketplace service.
 * Pricing consistency is enforced here so the web form and API never drift.
 */
export const serviceUpsertSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase kebab-case'),
    name: z.string().trim().min(3).max(160),
    tagline: z.string().trim().max(200).optional(),
    description: z.string().trim().min(10).max(8000),
    categoryId: z.uuid(),
    serviceType: z.enum(SERVICE_TYPES),
    pricingModel: z.enum(PRICING_MODELS),
    basePrice: moneyStringSchema.default('0'),
    priceFrom: moneyStringSchema.optional(),
    priceTo: moneyStringSchema.optional(),
    priceNote: z.string().trim().max(200).optional(),
    deliveryDays: z.number().int().min(1).max(365).default(7),
    deliveryEstimateText: z.string().trim().max(120).optional(),
    revisionPolicy: z.string().trim().max(2000).optional(),
    requirementsText: z.string().trim().max(4000).optional(),
    features: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    deliverables: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    acceptedFileTypes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    faqs: z.array(serviceFaqSchema).max(20).default([]),
    imageUrl: z.url().optional(),
    thumbnail: z.url().optional(),
    bannerImage: z.url().optional(),
    founderDiscipline: z.enum(FOUNDER_DISCIPLINES).default('BOTH'),
    isFeatured: z.boolean().default(false),
    isPopular: z.boolean().default(false),
    status: z.enum(SERVICE_STATUSES).default('DRAFT'),
    displayOrder: z.number().int().min(0).default(0),
    options: z.array(serviceOptionSchema).max(30).default([]),
    formFields: z.array(serviceFormFieldInputSchema).max(40).default([]),
  })
  .superRefine((value, ctx) => {
    const from = moneyCents(value.priceFrom);
    const to = moneyCents(value.priceTo);

    if (value.pricingModel === 'STARTING_FROM' && from === null) {
      ctx.addIssue({ code: 'custom', path: ['priceFrom'], message: 'Starting-from pricing needs a price' });
    }
    if (value.pricingModel === 'RANGE') {
      if (from === null) {
        ctx.addIssue({ code: 'custom', path: ['priceFrom'], message: 'Range pricing needs a minimum price' });
      }
      if (to === null) {
        ctx.addIssue({ code: 'custom', path: ['priceTo'], message: 'Range pricing needs a maximum price' });
      }
      if (from !== null && to !== null && from > to) {
        ctx.addIssue({ code: 'custom', path: ['priceTo'], message: 'Max price must be ≥ min price' });
      }
    }

    // A published service must never show a zero/absent price for priced models.
    if (value.status === 'PUBLISHED') {
      const base = moneyCents(value.basePrice) ?? 0;
      if (value.pricingModel === 'FIXED' && base <= 0) {
        ctx.addIssue({ code: 'custom', path: ['basePrice'], message: 'A published fixed-price service needs a price' });
      }
      if (value.pricingModel === 'STARTING_FROM' && (from ?? 0) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['priceFrom'], message: 'A published service needs a price' });
      }
      if (value.pricingModel === 'RANGE' && (from ?? 0) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['priceFrom'], message: 'A published service needs a price' });
      }
    }

    // Form-field keys must be unique within a service (matches the DB constraint).
    const seenKeys = new Set<string>();
    value.formFields.forEach((field, index) => {
      if (seenKeys.has(field.key)) {
        ctx.addIssue({ code: 'custom', path: ['formFields', index, 'key'], message: 'Duplicate field key' });
      }
      seenKeys.add(field.key);
    });
  });
export type ServiceUpsertInput = z.infer<typeof serviceUpsertSchema>;

/** GET /api/admin/services — management list filters. */
export const adminServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  sort: z.enum(['display_order', 'updated_desc', 'name_asc']).default('display_order'),
});
export type AdminServiceListQuery = z.infer<typeof adminServiceListQuerySchema>;

/** PATCH /api/admin/services/:id/status */
export const adminServiceStatusSchema = z.object({ status: z.enum(SERVICE_STATUSES) });
export type AdminServiceStatusInput = z.infer<typeof adminServiceStatusSchema>;

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
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.number().int().min(1).max(10),
        optionIds: z.array(z.uuid()).max(20).default([]),
        requirements: z.string().trim().max(8000).optional(),
      }),
    )
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
      .array(
        z.object({
          id: z.uuid(),
          displayOrder: z.number().int().min(0).max(100_000),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const positions = new Set<number>();
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

/** The shape of a ServiceFormField row as the builder consumes it. */
export type ServiceFormFieldDef = {
  key: string;
  label: string;
  type: FormFieldType;
  /** Choice strings for SELECT / MULTISELECT. */
  options?: string[] | null;
  required: boolean;
  validation?: z.infer<typeof formFieldValidationSchema> | null;
};

const BD_PHONE = /^(\+?880|0)1[3-9]\d{8}$/;

function fieldSchema(field: ServiceFormFieldDef, mode: 'draft' | 'submit'): z.ZodType {
  const v = field.validation ?? {};
  const message = v.message;
  // Type-level message so a *missing* required field says "X is required"
  // instead of zod's "expected string, received undefined".
  const requiredError =
    mode === 'submit' && field.required ? (message ?? `${field.label} is required`) : undefined;
  const typeParams = requiredError ? { error: requiredError } : undefined;
  let base: z.ZodType;
  switch (field.type) {
    case 'TEXT': {
      let s = z.string(typeParams).trim();
      if (v.minLength) s = s.min(v.minLength, message);
      s = s.max(v.maxLength ?? 500, message);
      base = s;
      break;
    }
    case 'TEXTAREA': {
      let s = z.string(typeParams).trim();
      if (v.minLength) s = s.min(v.minLength, message);
      s = s.max(v.maxLength ?? 5000, message);
      base = s;
      break;
    }
    case 'NUMBER': {
      let s = z.coerce.number(typeParams);
      if (v.min !== undefined) s = s.min(v.min, message);
      if (v.max !== undefined) s = s.max(v.max, message);
      base = s;
      break;
    }
    case 'SELECT': {
      const options = field.options ?? [];
      base = options.length
        ? z.enum(options as [string, ...string[]], { message: message ?? requiredError })
        : z.string(typeParams).max(200);
      break;
    }
    case 'MULTISELECT': {
      const options = field.options ?? [];
      const inner = options.length ? z.enum(options as [string, ...string[]]) : z.string().max(200);
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
  if (mode === 'draft') return base.optional();
  if (!field.required) return base.optional();
  if (field.type === 'TEXT' || field.type === 'TEXTAREA') {
    // Required text fields must be non-empty (min(1) unless a longer min is set).
    const s = base as z.ZodString;
    return s.min(1, message ?? `${field.label} is required`);
  }
  return base;
}

/**
 * Build the zod schema for a service request's `answers` object.
 *  - submit: required fields enforced; unknown keys rejected (FORM_INVALID).
 *  - draft:  everything optional; unknown keys stripped (autosave tolerance).
 */
export function buildRequestAnswersSchema(
  fields: readonly ServiceFormFieldDef[],
  mode: 'draft' | 'submit' = 'submit',
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.key] = fieldSchema(field, mode);
  }
  // draft: unknown keys stripped (autosave tolerance) — z.object's default.
  // submit: unknown keys rejected (FORM_INVALID) via strictObject.
  const schema = mode === 'draft' ? z.object(shape) : z.strictObject(shape);
  return schema as unknown as z.ZodType<Record<string, unknown>>;
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
export type MarketplaceListQuery = z.infer<typeof marketplaceListQuerySchema>;

/** POST /api/marketplace/requests — answers are re-validated server-side
 *  against the service's stored form fields (buildRequestAnswersSchema). */
export const serviceRequestCreateSchema = z.object({
  answers: z.record(z.string(), z.unknown()).default({}),
  deadline: z.coerce.date().optional(),
  contactPreference: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'IN_APP']).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ServiceRequestCreate = z.infer<typeof serviceRequestCreateSchema>;

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
export type BlobUploadTokenRequest = z.infer<typeof blobUploadTokenRequestSchema>;

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
export type RequestFileRegister = z.infer<typeof requestFileRegisterSchema>;

// ─── Marketplace payment bridge: quotations & request management ──────────

/** One priced line on an admin-authored quotation. */
export const quotationItemSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    amount: moneyStringSchema,
  })
  .superRefine((value, ctx) => {
    if ((moneyCents(value.amount) ?? 0) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Line amount must be greater than zero' });
    }
  });
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

/** POST /api/admin/requests/:id/quotations — the server derives the total
 *  price from the items and the version/validity windows; the client cannot
 *  set either. */
export const quotationCreateSchema = z.object({
  items: z.array(quotationItemSchema).min(1).max(20),
  scopeText: z.string().trim().min(10).max(4000).optional(),
  deliverables: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  estimatedTimeline: z.string().trim().max(160).optional(),
});
export type QuotationCreate = z.infer<typeof quotationCreateSchema>;

/** POST /api/marketplace/quotations/:id/accept — creates the order. The
 *  idempotency key makes retries safe (unique on Order.idempotencyKey). */
export const quotationAcceptSchema = z.object({
  idempotencyKey: z.uuid(),
});
export type QuotationAccept = z.infer<typeof quotationAcceptSchema>;

/** POST /api/marketplace/quotations/:id/decline — customer declines a sent
 *  quotation; a reason is required so the founders can re-quote. */
export const quotationDeclineSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type QuotationDecline = z.infer<typeof quotationDeclineSchema>;

/** PATCH /api/admin/requests/:id/status — transition-validated server-side
 *  against REQUEST_TRANSITIONS. */
export const requestStatusUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  note: z.string().trim().max(2000).optional(),
});
export type RequestStatusUpdate = z.infer<typeof requestStatusUpdateSchema>;

/** GET /api/admin/requests + GET /api/marketplace/requests — shared paging. */
export const requestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(REQUEST_STATUSES).optional(),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;
