import { type OrderStatus, type PricingModel, type ServiceRequestStatus } from '../constants/index.js';
/** Format a money string (BDT) for display: ৳1,25,000 style grouping is
 * handled by Intl with en-IN which matches Bangladeshi lakh/crore grouping.
 * Whole amounts render without decimals; fractional amounts get exactly 2. */
export declare function formatBDT(amount: string | number): string;
export declare function isValidOrderNumber(value: string): boolean;
/** Build the next order number candidate from a zero-based yearly count. */
export declare function buildOrderNumber(year: number, zeroBasedCount: number): string;
export type PriceLabelInput = {
    pricingModel: PricingModel;
    /** FIXED price / fallback floor for STARTING_FROM (money string). */
    basePrice: string | null;
    priceFrom: string | null;
    priceTo: string | null;
};
/**
 * Card/detail price label per PRD v2.0:
 *   FIXED          → "Fixed ৳500"
 *   STARTING_FROM  → "From ৳1,500"
 *   RANGE          → "৳200-৳300"
 *   CUSTOM_QUOTE   → "Custom Quote"
 */
export declare function formatPriceLabel(input: PriceLabelInput): string;
/** "৳200-৳300" — used wherever a from/to range is shown (add-ons, quotations). */
export declare function formatBdtRange(priceFrom: string | null, priceTo: string | null): string;
/** Targets that only PC_REPAIR requests may transition into. */
export declare function allowedRequestTransitions(from: ServiceRequestStatus, isRepair: boolean): readonly ServiceRequestStatus[];
export declare function isRequestTransitionAllowed(from: ServiceRequestStatus, to: ServiceRequestStatus, isRepair: boolean): boolean;
/**
 * Order pipeline enforcement: legacy cart-checkout orders use ORDER_TRANSITIONS,
 * marketplace (quotation-paid) orders use ORDER_TRANSITIONS_V2.
 */
export declare function isOrderTransitionAllowed(origin: 'LEGACY' | 'MARKETPLACE', from: OrderStatus, to: OrderStatus): boolean;
