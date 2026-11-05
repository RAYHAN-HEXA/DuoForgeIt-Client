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
/** Client-side registration form (Firebase creates the account). */
export declare const registerFormSchema: z.ZodObject<{
    fullName: z.ZodString;
    email: z.ZodEmail;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, z.core.$strip>;
export type RegisterForm = z.infer<typeof registerFormSchema>;
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
export declare const serviceOptionSchema: z.ZodObject<{
    groupKey: z.ZodString;
    label: z.ZodString;
    priceDelta: z.ZodDefault<z.ZodString>;
    daysDelta: z.ZodDefault<z.ZodNumber>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const serviceUpsertSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    tagline: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    basePrice: z.ZodString;
    deliveryDays: z.ZodNumber;
    categoryId: z.ZodUUID;
    imageUrl: z.ZodOptional<z.ZodURL>;
    isFeatured: z.ZodDefault<z.ZodBoolean>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        groupKey: z.ZodString;
        label: z.ZodString;
        priceDelta: z.ZodDefault<z.ZodString>;
        daysDelta: z.ZodDefault<z.ZodNumber>;
        isDefault: z.ZodDefault<z.ZodBoolean>;
        displayOrder: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
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
 * values and the namespace, but does not verify the uploaded bytes here.
 * Signature-level `allowed_formats` enforcement is a separately reviewed
 * future hardening.
 */
export declare const paymentSubmitV2Schema: z.ZodObject<{
    accountId: z.ZodUUID;
    transactionId: z.ZodString;
    senderNumber: z.ZodOptional<z.ZodString>;
    amount: z.ZodString;
    screenshotPublicId: z.ZodOptional<z.ZodString>;
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
        REJECTED: "REJECTED";
        VERIFIED: "VERIFIED";
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
    qrPublicId: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    displayOrder: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Admin edit contract. Nullable optional fields allow an administrator to
 * explicitly clear a value (e.g. `qrPublicId: null` removes the QR image);
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
    qrPublicId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
        WHATSAPP: "WHATSAPP";
        PHONE: "PHONE";
        EMAIL: "EMAIL";
        IN_APP: "IN_APP";
    }>>;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ServiceRequestCreate = z.infer<typeof serviceRequestCreateSchema>;
/** POST /api/marketplace/files — register a Cloudinary-uploaded file as a
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
