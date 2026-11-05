import { describe, expect, it } from 'vitest';
import { formatBdtRange, formatPriceLabel } from './index.js';

describe('formatPriceLabel', () => {
  it('renders FIXED with the base price', () => {
    expect(
      formatPriceLabel({ pricingModel: 'FIXED', basePrice: '500', priceFrom: null, priceTo: null }),
    ).toBe('Fixed ৳500');
  });

  it('renders STARTING_FROM from priceFrom', () => {
    expect(
      formatPriceLabel({ pricingModel: 'STARTING_FROM', basePrice: null, priceFrom: '1500', priceTo: null }),
    ).toBe('From ৳1,500');
  });

  it('renders STARTING_FROM falling back to basePrice', () => {
    expect(
      formatPriceLabel({ pricingModel: 'STARTING_FROM', basePrice: '2000', priceFrom: null, priceTo: null }),
    ).toBe('From ৳2,000');
  });

  it('renders RANGE as from-to with the taka sign on both ends', () => {
    expect(
      formatPriceLabel({ pricingModel: 'RANGE', basePrice: null, priceFrom: '200', priceTo: '300' }),
    ).toBe('৳200-৳300');
  });

  it('renders CUSTOM_QUOTE without any number', () => {
    expect(
      formatPriceLabel({ pricingModel: 'CUSTOM_QUOTE', basePrice: null, priceFrom: null, priceTo: null }),
    ).toBe('Custom Quote');
  });

  it('degrades an incomplete RANGE to Custom Quote (never shows a wrong price)', () => {
    expect(
      formatPriceLabel({ pricingModel: 'RANGE', basePrice: null, priceFrom: '200', priceTo: null }),
    ).toBe('Custom Quote');
  });

  it('formats fractional amounts with two decimals', () => {
    expect(
      formatPriceLabel({ pricingModel: 'FIXED', basePrice: '499.50', priceFrom: null, priceTo: null }),
    ).toBe('Fixed ৳499.50');
  });
});

describe('formatBdtRange', () => {
  it('formats a full range', () => {
    expect(formatBdtRange('200', '300')).toBe('৳200-৳300');
  });

  it('formats a single bound as one amount', () => {
    expect(formatBdtRange('1500', null)).toBe('৳1,500');
  });

  it('returns Custom Quote when nothing is set', () => {
    expect(formatBdtRange(null, null)).toBe('Custom Quote');
  });
});
