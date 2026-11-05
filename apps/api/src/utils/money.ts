/**
 * Money math over the string-decimal convention (Decimal(12,2) columns come
 * back as strings; never let them touch JS floats). Implemented with BigInt
 * cents — exact, dependency-free, and obvious.
 */

function toCents(value: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return 0n;
  const sign = m[1] === '-' ? -1n : 1n;
  const frac = ((m[3] ?? '') + '0').slice(0, 2);
  return sign * (BigInt(m[2]!) * 100n + BigInt(frac));
}

function toMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** basePrice + Σ selected option priceDeltas — per-unit price, 2 decimals. */
export function unitPrice(basePrice: string, optionPriceDeltas: string[]): string {
  return toMoney(optionPriceDeltas.reduce((acc, d) => acc + toCents(d), toCents(basePrice)));
}

/** perUnit × quantity — line total, 2 decimals. */
export function lineTotal(perUnit: string, quantity: number): string {
  return toMoney(toCents(perUnit) * BigInt(quantity));
}

/** Σ money strings — order total, 2 decimals. */
export function sumMoney(values: string[]): string {
  return toMoney(values.reduce((acc, v) => acc + toCents(v), 0n));
}

/** deliveryDays + Σ daysDeltas — floor 1 day so options can never make it 0. */
export function estimateDays(deliveryDays: number, optionDaysDeltas: number[]): number {
  return Math.max(1, deliveryDays + optionDaysDeltas.reduce((a, d) => a + d, 0));
}

/** a − b over money strings — outstanding amount = totalAmount − amountPaid. */
export function subtractMoney(a: string, b: string): string {
  return toMoney(toCents(a) - toCents(b));
}

/**
 * Strict parse of a client-submitted money string to exact BigInt cents.
 * Unlike toCents (lenient, DB-shaped input), this returns null for anything
 * malformed — callers reject, never silently treat garbage as 0.
 */
export function parseMoneyToCents(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const frac = ((m[2] ?? '') + '0').slice(0, 2);
  return BigInt(m[1]!) * 100n + BigInt(frac);
}
