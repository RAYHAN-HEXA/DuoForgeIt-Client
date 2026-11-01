import { describe, expect, it } from 'vitest';
import { buildOrderNumber, formatBDT, isValidOrderNumber } from './index.js';

describe('formatBDT', () => {
  it('formats decimal strings with the taka sign', () => {
    expect(formatBDT('1500')).toBe('৳1,500');
    expect(formatBDT('123456.5')).toBe('৳1,23,456.50');
  });

  it('returns a placeholder for invalid input', () => {
    expect(formatBDT('not-a-number')).toBe('৳—');
  });
});

describe('order numbers', () => {
  it('builds zero-padded numbers for the year', () => {
    expect(buildOrderNumber(2026, 0)).toBe('TSH-2026-000001');
    expect(buildOrderNumber(2026, 122)).toBe('TSH-2026-000123');
  });

  it('validates against the pattern', () => {
    expect(isValidOrderNumber('TSH-2026-000123')).toBe(true);
    expect(isValidOrderNumber('TSH-26-123')).toBe(false);
  });
});
