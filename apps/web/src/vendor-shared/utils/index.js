import { ORDER_NUMBER_PATTERN } from '../constants/index.js';
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
