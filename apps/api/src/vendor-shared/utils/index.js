import { ORDER_NUMBER_PATTERN, ORDER_TRANSITIONS, ORDER_TRANSITIONS_V2, REQUEST_TRANSITIONS, REPAIR_REQUEST_STATUSES, } from '../constants/index.js';
/** Format a money string (BDT) for display: ৳1,25,000 style grouping is
 * handled by Intl with en-IN which matches Bangladeshi lakh/crore grouping.
 * Whole amounts render without decimals; fractional amounts get exactly 2. */
export function formatBDT(amount) {
    const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
    if (!Number.isFinite(value))
        return '৳—';
    const hasCents = !Number.isInteger(value);
    return `৳${value.toLocaleString('en-IN', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: hasCents ? 2 : 0,
    })}`;
}
export function isValidOrderNumber(value) {
    return ORDER_NUMBER_PATTERN.test(value);
}
/** Build the next order number candidate from a zero-based yearly count. */
export function buildOrderNumber(year, zeroBasedCount) {
    return `TSH-${year}-${String(zeroBasedCount + 1).padStart(6, '0')}`;
}
/**
 * Card/detail price label per PRD v2.0:
 *   FIXED          → "Fixed ৳500"
 *   STARTING_FROM  → "From ৳1,500"
 *   RANGE          → "৳200-৳300"
 *   CUSTOM_QUOTE   → "Custom Quote"
 */
export function formatPriceLabel(input) {
    switch (input.pricingModel) {
        case 'FIXED':
            return `Fixed ${formatBDT(input.basePrice ?? '0')}`;
        case 'STARTING_FROM':
            return `From ${formatBDT(input.priceFrom ?? input.basePrice ?? '0')}`;
        case 'RANGE': {
            if (input.priceFrom == null || input.priceTo == null)
                return 'Custom Quote';
            return `${formatBDT(input.priceFrom)}-${formatBDT(input.priceTo)}`;
        }
        case 'CUSTOM_QUOTE':
            return 'Custom Quote';
    }
}
/** "৳200-৳300" — used wherever a from/to range is shown (add-ons, quotations). */
export function formatBdtRange(priceFrom, priceTo) {
    if (priceFrom == null && priceTo == null)
        return 'Custom Quote';
    if (priceTo == null)
        return formatBDT(priceFrom ?? '0');
    return `${formatBDT(priceFrom ?? '0')}-${formatBDT(priceTo)}`;
}
// ─── Marketplace state machines ──────────────────────────────
/** Targets that only PC_REPAIR requests may transition into. */
export function allowedRequestTransitions(from, isRepair) {
    const targets = REQUEST_TRANSITIONS[from] ?? [];
    return isRepair ? targets : targets.filter((t) => !REPAIR_REQUEST_STATUSES.includes(t));
}
export function isRequestTransitionAllowed(from, to, isRepair) {
    return allowedRequestTransitions(from, isRepair).includes(to);
}
/**
 * Order pipeline enforcement: legacy cart-checkout orders use ORDER_TRANSITIONS,
 * marketplace (quotation-paid) orders use ORDER_TRANSITIONS_V2.
 */
export function isOrderTransitionAllowed(origin, from, to) {
    const targets = origin === 'MARKETPLACE' ? ORDER_TRANSITIONS_V2[from] : ORDER_TRANSITIONS[from];
    return targets?.includes(to) ?? false;
}
