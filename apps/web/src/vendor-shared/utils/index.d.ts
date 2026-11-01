/** Format a money string (BDT) for display: ৳1,25,000 style grouping is
 * handled by Intl with en-IN which matches Bangladeshi lakh/crore grouping.
 * Whole amounts render without decimals; fractional amounts get exactly 2. */
export declare function formatBDT(amount: string | number): string;
export declare function isValidOrderNumber(value: string): boolean;
/** Build the next order number candidate from a zero-based yearly count. */
export declare function buildOrderNumber(year: number, zeroBasedCount: number): string;
