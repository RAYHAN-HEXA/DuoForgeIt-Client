import { z } from 'zod';
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
export declare const paymentSubmitSchema: z.ZodObject<{
    method: z.ZodEnum<{
        BKASH: "BKASH";
        NAGAD: "NAGAD";
        ROCKET: "ROCKET";
        BANK_TRANSFER: "BANK_TRANSFER";
    }>;
    transactionId: z.ZodString;
}, z.core.$strip>;
export declare const paymentReviewSchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
