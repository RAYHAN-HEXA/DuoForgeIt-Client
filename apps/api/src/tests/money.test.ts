import { describe, expect, it } from 'vitest';
import { estimateDays, lineTotal, sumMoney, unitPrice } from '../utils/money.js';

/** Money math must be exact string-decimal math — floats are forbidden. */

describe('unitPrice', () => {
  it('adds option deltas to the base price', () => {
    expect(unitPrice('6000.00', ['3000.00', '2500.00'])).toBe('11500.00');
  });

  it('applies negative deltas (discounts)', () => {
    expect(unitPrice('25000.00', ['-5000.00'])).toBe('20000.00');
  });

  it('keeps two decimals', () => {
    expect(unitPrice('1000.5', ['0.25'])).toBe('1000.75');
  });
});

describe('lineTotal', () => {
  it('multiplies the unit price by quantity', () => {
    expect(lineTotal('11500.00', 2)).toBe('23000.00');
    expect(lineTotal('33.33', 3)).toBe('99.99');
  });
});

describe('sumMoney', () => {
  it('sums money strings exactly', () => {
    expect(sumMoney(['1000.01', '2000.02', '3.97'])).toBe('3004.00');
    expect(sumMoney([])).toBe('0.00');
  });

  it('avoids the 0.1+0.2 float trap', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
  });
});

describe('estimateDays', () => {
  it('adds day deltas to the delivery estimate', () => {
    expect(estimateDays(14, [7, 0])).toBe(21);
    expect(estimateDays(14, [-7])).toBe(7);
  });

  it('never goes below one day', () => {
    expect(estimateDays(2, [-7])).toBe(1);
  });
});
