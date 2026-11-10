import { z } from 'zod';
import { type FormFieldType } from '../constants/index.js';
export declare const paginationQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
/** Client-side login form (Firebase handles the actual credential check). */
export declare const loginFormSchema: z.ZodObject<{
    email: z.ZodEmail;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginForm = z.infer<typeof loginFormSchema>;
/** Client-side registration form (Firebase creates the account *after* the
 *  emailed OTP is verified — an unproven address can never create an account). */
export declare const registerFormSchema: z.ZodObject<{
    fullName: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, z.core.$strip>;
export type RegisterForm = z.infer<typeof registerFormSchema>;
export declare const OTP_PURPOSES: readonly ["REGISTER", "VERIFY"];
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
/**
 * POST /api/auth/otp/request — email a 6-digit code. REGISTER pre-checks that
 * the address isn't already linked to an account; VERIFY remediates existing
 * (legacy) unverified accounts. The server re-runs this schema so a bypassed
 * client form still hits strict syntax + disposable-domain rejection.
 */
export declare const otpRequestSchema: z.ZodObject<{
    email: z.ZodString;
    purpose: z.ZodEnum<{
        REGISTER: "REGISTER";
        VERIFY: "VERIFY";
    }>;
    fullName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
/** POST /api/auth/otp/verify — check the code, get a single-use grant token. */
export declare const otpVerifySchema: z.ZodObject<{
    email: z.ZodString;
    purpose: z.ZodEnum<{
        REGISTER: "REGISTER";
        VERIFY: "VERIFY";
    }>;
    code: z.ZodString;
}, z.core.$strip>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
/** POST /api/auth/sync — optional proof that the email passed OTP verification. */
export declare const authSyncSchema: z.ZodObject<{
    registrationGrant: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AuthSyncInput = z.infer<typeof authSyncSchema>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodEmail;
}, z.core.$strip>;
export declare const profileUpdateSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    phone: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    profileImage: z.ZodOptional<z.ZodURL>;
}, z.core.$strip>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export declare const contactSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodEmail;
    subject: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
    website: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const serviceFaqSchema: z.ZodObject<{
    q: z.ZodString;
    a: z.ZodString;
}, z.core.$strip>;
export type ServiceFaq = z.infer<typeof serviceFaqSchema>;
export declare const serviceOptionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUUID>;
    kind: z.ZodEnum<{
        PACKAGE: "PACKAGE";
        ADDON: "ADDON";
    }>;
    label: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priceFrom: z.ZodOptional<z.ZodString>;
    priceTo: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ServiceOptionInput = z.infer<typeof serviceOptionSchema>;
export declare const serviceFormFieldInputSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUUID>;
    key: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<{
        TEXT: "TEXT";
        TEXTAREA: "TEXTAREA";
        NUMBER: "NUMBER";
        SELECT: "SELECT";
        MULTISELECT: "MULTISELECT";
        DATE: "DATE";
        CHECKBOX: "CHECKBOX";
        FILE: "FILE";
        URL: "URL";
        PHONE: "PHONE";
    }>;
    options: z.ZodDefault<z.ZodArray<z.ZodString>>;
    required: z.ZodDefault<z.ZodBoolean>;
    helpText: z.ZodOptional<z.ZodString>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ServiceFormFieldInput = z.infer<typeof serviceFormFieldInputSchema>;
/**
 * Full admin editor contract for creating/replacing a marketplace service.
 * Pricing consistency is enforced here so the web form and API never drift.
 */
export declare const serviceUpsertSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    tagline: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    categoryId: z.ZodUUID;
    serviceType: z.ZodEnum<{
        SD_WEB: "SD_WEB";
        COMMERCIAL_WEB: "COMMERCIAL_WEB";
        JAVA_OOP: "JAVA_OOP";
        PRESENTATION: "PRESENTATION";
        LAB_REPORT: "LAB_REPORT";
        ASSIGNMENT_FORMATTING: "ASSIGNMENT_FORMATTING";
        PROJECT_DOCUMENTATION: "PROJECT_DOCUMENTATION";
        HARDWARE_PROJECT: "HARDWARE_PROJECT";
        PC_REPAIR: "PC_REPAIR";
        CONSULTATION: "CONSULTATION";
    }>;
    pricingModel: z.ZodEnum<{
        FIXED: "FIXED";
        STARTING_FROM: "STARTING_FROM";
        RANGE: "RANGE";
        CUSTOM_QUOTE: "CUSTOM_QUOTE";
    }>;
    basePrice: z.ZodDefault<z.ZodString>;
    priceFrom: z.ZodOptional<z.ZodString>;
    priceTo: z.ZodOptional<z.ZodString>;
    priceNote: z.ZodOptional<z.ZodString>;
    deliveryDays: z.ZodDefault<z.ZodNumber>;
    deliveryEstimateText: z.ZodOptional<z.ZodString>;
    revisionPolicy: z.ZodOptional<z.ZodString>;
    requirementsText: z.ZodOptional<z.ZodString>;
    features: z.ZodDefault<z.ZodArray<z.ZodString>>;
    deliverables: z.ZodDefault<z.ZodArray<z.ZodString>>;
    acceptedFileTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    faqs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        q: z.ZodString;
        a: z.ZodString;
    }, z.core.$strip>>>;
    imageUrl: z.ZodOptional<z.ZodURL>;
    thumbnail: z.ZodOptional<z.ZodURL>;
    bannerImage: z.ZodOptional<z.ZodURL>;
    founderDiscipline: z.ZodDefault<z.ZodEnum<{
        WEB_SOFTWARE_ECOMMERCE: "WEB_SOFTWARE_ECOMMERCE";
        DESIGN_DOCS_UX: "DESIGN_DOCS_UX";
        BOTH: "BOTH";
    }>>;
    isFeatured: z.ZodDefault<z.ZodBoolean>;
    isPopular: z.ZodDefault<z.ZodBoolean>;
    status: z.ZodDefault<z.ZodEnum<{
        DRAFT: "DRAFT";
        PUBLISHED: "PUBLISHED";
        UNPUBLISHED: "UNPUBLISHED";
        ARCHIVED: "ARCHIVED";
    }>>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodUUID>;
        kind: z.ZodEnum<{
            PACKAGE: "PACKAGE";
            ADDON: "ADDON";
        }>;
        label: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priceFrom: z.ZodOptional<z.ZodString>;
        priceTo: z.ZodOptional<z.ZodString>;
        isActive: z.ZodDefault<z.ZodBoolean>;
        displayOrder: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    formFields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodUUID>;
        key: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<{
            TEXT: "TEXT";
            TEXTAREA: "TEXTAREA";
            NUMBER: "NUMBER";
            SELECT: "SELECT";
            MULTISELECT: "MULTISELECT";
            DATE: "DATE";
            CHECKBOX: "CHECKBOX";
            FILE: "FILE";
            URL: "URL";
            PHONE: "PHONE";
        }>;
        options: z.ZodDefault<z.ZodArray<z.ZodString>>;
        required: z.ZodDefault<z.ZodBoolean>;
        helpText: z.ZodOptional<z.ZodString>;
        displayOrder: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ServiceUpsertInput = z.infer<typeof serviceUpsertSchema>;
/** GET /api/admin/services — management list filters. */
export declare const adminServiceListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        DRAFT: "DRAFT";
        PUBLISHED: "PUBLISHED";
        UNPUBLISHED: "UNPUBLISHED";
        ARCHIVED: "ARCHIVED";
    }>>;
    categoryId: z.ZodOptional<z.ZodUUID>;
    sort: z.ZodDefault<z.ZodEnum<{
        display_order: "display_order";
        updated_desc: "updated_desc";
        name_asc: "name_asc";
    }>>;
}, z.core.$strip>;
export type AdminServiceListQuery = z.infer<typeof adminServiceListQuerySchema>;
/** PATCH /api/admin/services/:id/status */
export declare const adminServiceStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        DRAFT: "DRAFT";
        PUBLISHED: "PUBLISHED";
        UNPUBLISHED: "UNPUBLISHED";
        ARCHIVED: "ARCHIVED";
    }>;
}, z.core.$strip>;
export type AdminServiceStatusInput = z.infer<typeof adminServiceStatusSchema>;
export declare const cartItemAddSchema: z.ZodObject<{
    serviceId: z.ZodUUID;
    quantity: z.ZodDefault<z.ZodNumber>;
    optionIds: z.ZodDefault<z.ZodArray<z.ZodUUID>>;
    requirements: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const founderPreferenceSchema: z.ZodEnum<{
    FOUNDER_A: "FOUNDER_A";
    FOUNDER_B: "FOUNDER_B";
    AUTO_ASSIGN: "AUTO_ASSIGN";
}>;
export declare const checkoutSchema: z.ZodObject<{
    idempotencyKey: z.ZodUUID;
    items: z.ZodArray<z.ZodObject<{
        serviceId: z.ZodUUID;
        quantity: z.ZodNumber;
        optionIds: z.ZodDefault<z.ZodArray<z.ZodUUID>>;
        requirements: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    deadline: z.ZodCoercedDate<unknown>;
    founderPreference: z.ZodEnum<{
        FOUNDER_A: "FOUNDER_A";
        FOUNDER_B: "FOUNDER_B";
        AUTO_ASSIGN: "AUTO_ASSIGN";
    }>;
    notes: z.ZodOptional<z.ZodString>;
    attachmentIds: z.ZodDefault<z.ZodArray<z.ZodUUID>>;
}, z.core.$strip>;
/**
 * LEGACY v1 manual submission (bare method + TrxID). Pinned to the four
 * legacy rails — deliberately NOT z.enum(PAYMENT_METHODS) — so adding
 * 'OTHER' to the enum cannot change the live v1 endpoint. Superseded by
 * paymentSubmitV2Schema in the manual-payments v2 stage.
 */
export declare const paymentSubmitSchema: z.ZodObject<{
    method: z.ZodEnum<{
        BKASH: "BKASH";
        NAGAD: "NAGAD";
        ROCKET: "ROCKET";
        BANK_TRANSFER: "BANK_TRANSFER";
    }>;
    transactionId: z.ZodString;
}, z.core.$strip>;
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
export declare const paymentSubmitV2Schema: z.ZodObject<{
    accountId: z.ZodUUID;
    transactionId: z.ZodString;
    senderNumber: z.ZodOptional<z.ZodString>;
    amount: z.ZodString;
    screenshotPathname: z.ZodOptional<z.ZodString>;
    screenshotMimeType: z.ZodOptional<z.ZodEnum<{
        "image/png": "image/png";
        "image/jpeg": "image/jpeg";
        "image/webp": "image/webp";
    }>>;
    screenshotSizeBytes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Admin verify/reject decision (manual-payments v2). A rejection REQUIRES a
 * customer-facing reason (5–2000 chars); verification note stays optional.
 */
export declare const paymentReviewSchema: z.ZodObject<{
    decision: z.ZodEnum<{
        VERIFIED: "VERIFIED";
        REJECTED: "REJECTED";
    }>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Stable custom-rail keys: uppercase letters/digits/underscores, e.g. BKASH, UPAY. */
export declare const paymentMethodKeySchema: z.ZodString;
export declare const paymentAccountCreateSchema: z.ZodObject<{
    methodKey: z.ZodString;
    label: z.ZodString;
    accountType: z.ZodOptional<z.ZodString>;
    accountNumber: z.ZodString;
    accountHolder: z.ZodString;
    instructions: z.ZodOptional<z.ZodString>;
    qrPathname: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    displayOrder: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Admin edit contract. Nullable optional fields allow an administrator to
 * explicitly clear a value (e.g. `qrPathname: null` removes the QR image);
 * omitting the field leaves it unchanged.
 */
export declare const paymentAccountUpdateSchema: z.ZodObject<{
    methodKey: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    accountNumber: z.ZodOptional<z.ZodString>;
    accountHolder: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    displayOrder: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    accountType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    instructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    qrPathname: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
/**
 * Atomic display-order update. Every entry must reference a distinct account
 * and a distinct position; the service rejects unknown ids rather than
 * silently ignoring them.
 */
export declare const paymentAccountReorderSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        displayOrder: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Admin payment queue filters (v2): status/method/search/date range + paging. */
export declare const adminPaymentListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    status: z.ZodOptional<z.ZodString>;
    method: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodCoercedDate<unknown>>;
    to: z.ZodOptional<z.ZodCoercedDate<unknown>>;
}, z.core.$strip>;
/** Admin-authored per-field validation constraints (stored in validation JSON). */
export declare const formFieldValidationSchema: z.ZodObject<{
    minLength: z.ZodOptional<z.ZodNumber>;
    maxLength: z.ZodOptional<z.ZodNumber>;
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
    pattern: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    maxFiles: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
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
/**
 * Build the zod schema for a service request's `answers` object.
 *  - submit: required fields enforced; unknown keys rejected (FORM_INVALID).
 *  - draft:  everything optional; unknown keys stripped (autosave tolerance).
 */
export declare function buildRequestAnswersSchema(fields: readonly ServiceFormFieldDef[], mode?: 'draft' | 'submit'): z.ZodType<Record<string, unknown>>;
/** Valid field keys: lowercase kebab/snake identifiers — keeps JSON keys safe. */
export declare const formFieldKeySchema: z.ZodString;
/**
 * Query for GET /api/marketplace/services.
 *  pricing: 'priced' = anything with an up-front number (FIXED/STARTING_FROM/RANGE),
 *           or one exact PRICING_MODELS value.
 */
export declare const marketplaceListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    category: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    serviceType: z.ZodOptional<z.ZodEnum<{
        SD_WEB: "SD_WEB";
        COMMERCIAL_WEB: "COMMERCIAL_WEB";
        JAVA_OOP: "JAVA_OOP";
        PRESENTATION: "PRESENTATION";
        LAB_REPORT: "LAB_REPORT";
        ASSIGNMENT_FORMATTING: "ASSIGNMENT_FORMATTING";
        PROJECT_DOCUMENTATION: "PROJECT_DOCUMENTATION";
        HARDWARE_PROJECT: "HARDWARE_PROJECT";
        PC_REPAIR: "PC_REPAIR";
        CONSULTATION: "CONSULTATION";
    }>>;
    pricing: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
        priced: "priced";
    }>, z.ZodEnum<{
        FIXED: "FIXED";
        STARTING_FROM: "STARTING_FROM";
        RANGE: "RANGE";
        CUSTOM_QUOTE: "CUSTOM_QUOTE";
    }>]>>;
    badge: z.ZodOptional<z.ZodEnum<{
        popular: "popular";
        featured: "featured";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        popular: "popular";
        price_asc: "price_asc";
        price_desc: "price_desc";
        newest: "newest";
    }>>;
}, z.core.$strip>;
export type MarketplaceListQuery = z.infer<typeof marketplaceListQuerySchema>;
/** POST /api/marketplace/requests — answers are re-validated server-side
 *  against the service's stored form fields (buildRequestAnswersSchema). */
export declare const serviceRequestCreateSchema: z.ZodObject<{
    answers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    deadline: z.ZodOptional<z.ZodCoercedDate<unknown>>;
    contactPreference: z.ZodOptional<z.ZodEnum<{
        PHONE: "PHONE";
        WHATSAPP: "WHATSAPP";
        EMAIL: "EMAIL";
        IN_APP: "IN_APP";
    }>>;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ServiceRequestCreate = z.infer<typeof serviceRequestCreateSchema>;
/** POST /api/uploads/blob/token — request a scoped client-upload ticket.
 *  The server derives the pathname and upload constraints; the client cannot
 *  choose its own storage namespace. */
export declare const blobUploadTokenRequestSchema: z.ZodObject<{
    folder: z.ZodEnum<{
        requirements: "requirements";
        deliveries: "deliveries";
        misc: "misc";
        payments: "payments";
        paymentAccounts: "paymentAccounts";
        requests: "requests";
    }>;
    fileName: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    kind: z.ZodOptional<z.ZodEnum<{
        ATTACHMENT: "ATTACHMENT";
        PHOTO: "PHOTO";
    }>>;
}, z.core.$strip>;
export type BlobUploadTokenRequest = z.infer<typeof blobUploadTokenRequestSchema>;
/** POST /api/marketplace/files — register a Blob-uploaded file as a
 *  staged RequestFile (requestId null until a request claims it). Type/size
 *  are re-validated server-side against MARKETPLACE_UPLOAD_LIMITS. */
export declare const requestFileRegisterSchema: z.ZodObject<{
    storagePath: z.ZodString;
    fileName: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    kind: z.ZodDefault<z.ZodEnum<{
        ATTACHMENT: "ATTACHMENT";
        PHOTO: "PHOTO";
    }>>;
}, z.core.$strip>;
export type RequestFileRegister = z.infer<typeof requestFileRegisterSchema>;
/** One priced line on an admin-authored quotation. */
export declare const quotationItemSchema: z.ZodObject<{
    label: z.ZodString;
    amount: z.ZodString;
}, z.core.$strip>;
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
/** POST /api/admin/requests/:id/quotations — the server derives the total
 *  price from the items and the version/validity windows; the client cannot
 *  set either. */
export declare const quotationCreateSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        amount: z.ZodString;
    }, z.core.$strip>>;
    scopeText: z.ZodOptional<z.ZodString>;
    deliverables: z.ZodDefault<z.ZodArray<z.ZodString>>;
    estimatedTimeline: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type QuotationCreate = z.infer<typeof quotationCreateSchema>;
/** POST /api/marketplace/quotations/:id/accept — creates the order. The
 *  idempotency key makes retries safe (unique on Order.idempotencyKey). */
export declare const quotationAcceptSchema: z.ZodObject<{
    idempotencyKey: z.ZodUUID;
}, z.core.$strip>;
export type QuotationAccept = z.infer<typeof quotationAcceptSchema>;
/** POST /api/marketplace/quotations/:id/decline — customer declines a sent
 *  quotation; a reason is required so the founders can re-quote. */
export declare const quotationDeclineSchema: z.ZodObject<{
    reason: z.ZodString;
}, z.core.$strip>;
export type QuotationDecline = z.infer<typeof quotationDeclineSchema>;
/** PATCH /api/admin/requests/:id/status — transition-validated server-side
 *  against REQUEST_TRANSITIONS. */
export declare const requestStatusUpdateSchema: z.ZodObject<{
    status: z.ZodEnum<{
        REJECTED: "REJECTED";
        REQUEST_SUBMITTED: "REQUEST_SUBMITTED";
        UNDER_REVIEW: "UNDER_REVIEW";
        DIAGNOSIS_SCHEDULED: "DIAGNOSIS_SCHEDULED";
        DIAGNOSIS_SENT: "DIAGNOSIS_SENT";
        QUOTATION_SENT: "QUOTATION_SENT";
        QUOTATION_DECLINED: "QUOTATION_DECLINED";
        QUOTATION_EXPIRED: "QUOTATION_EXPIRED";
        ACCEPTED_AWAITING_PAYMENT: "ACCEPTED_AWAITING_PAYMENT";
        ORDER_CREATED: "ORDER_CREATED";
        CANCELLED: "CANCELLED";
    }>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RequestStatusUpdate = z.infer<typeof requestStatusUpdateSchema>;
/** GET /api/admin/requests + GET /api/marketplace/requests — shared paging. */
export declare const requestListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    status: z.ZodOptional<z.ZodEnum<{
        REJECTED: "REJECTED";
        REQUEST_SUBMITTED: "REQUEST_SUBMITTED";
        UNDER_REVIEW: "UNDER_REVIEW";
        DIAGNOSIS_SCHEDULED: "DIAGNOSIS_SCHEDULED";
        DIAGNOSIS_SENT: "DIAGNOSIS_SENT";
        QUOTATION_SENT: "QUOTATION_SENT";
        QUOTATION_DECLINED: "QUOTATION_DECLINED";
        QUOTATION_EXPIRED: "QUOTATION_EXPIRED";
        ACCEPTED_AWAITING_PAYMENT: "ACCEPTED_AWAITING_PAYMENT";
        ORDER_CREATED: "ORDER_CREATED";
        CANCELLED: "CANCELLED";
    }>>;
}, z.core.$strip>;
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;
