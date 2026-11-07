import { describe, expect, it } from 'vitest';
import { serviceUpsertSchema, type ServiceUpsertInput } from './index.js';

const CATEGORY_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const base: ServiceUpsertInput = {
  slug: 'sample-service',
  name: 'Sample service',
  description: 'A complete description for the sample service.',
  categoryId: CATEGORY_ID,
  serviceType: 'COMMERCIAL_WEB',
  pricingModel: 'FIXED',
  basePrice: '1500',
  deliveryDays: 7,
  features: [],
  deliverables: [],
  acceptedFileTypes: [],
  faqs: [],
  founderDiscipline: 'BOTH',
  isFeatured: false,
  isPopular: false,
  status: 'DRAFT',
  displayOrder: 0,
  options: [],
  formFields: [],
};

const parse = (patch: Partial<ServiceUpsertInput>) => serviceUpsertSchema.safeParse({ ...base, ...patch });

describe('serviceUpsertSchema', () => {
  it('accepts a minimal draft with defaults applied', () => {
    const parsed = serviceUpsertSchema.parse(base);
    expect(parsed.deliveryDays).toBe(7);
    expect(parsed.status).toBe('DRAFT');
    expect(parsed.options).toEqual([]);
  });

  it('requires a starting price for STARTING_FROM', () => {
    expect(parse({ pricingModel: 'STARTING_FROM' }).success).toBe(false);
    expect(parse({ pricingModel: 'STARTING_FROM', priceFrom: '1500' }).success).toBe(true);
  });

  it('requires both bounds for RANGE and rejects inverted bounds', () => {
    expect(parse({ pricingModel: 'RANGE', priceFrom: '500' }).success).toBe(false);
    expect(parse({ pricingModel: 'RANGE', priceFrom: '500', priceTo: '200' }).success).toBe(false);
    expect(parse({ pricingModel: 'RANGE', priceFrom: '200', priceTo: '500' }).success).toBe(true);
  });

  it('refuses to publish a priced service without a positive price', () => {
    expect(parse({ status: 'PUBLISHED', basePrice: '0' }).success).toBe(false);
    expect(parse({ status: 'PUBLISHED', basePrice: '500' }).success).toBe(true);
    expect(parse({ status: 'PUBLISHED', pricingModel: 'CUSTOM_QUOTE', basePrice: '0' }).success).toBe(true);
  });

  it('rejects duplicate form-field keys and empty select options', () => {
    const duplicate = parse({
      formFields: [
        { key: 'budget', label: 'Budget', type: 'NUMBER', options: [], required: false, displayOrder: 0 },
        { key: 'budget', label: 'Budget again', type: 'TEXT', options: [], required: false, displayOrder: 1 },
      ],
    });
    expect(duplicate.success).toBe(false);

    const selectWithoutOptions = parse({
      formFields: [{ key: 'size', label: 'Size', type: 'SELECT', options: [], required: false, displayOrder: 0 }],
    });
    expect(selectWithoutOptions.success).toBe(false);
  });

  it('validates option price ranges', () => {
    const inverted = parse({
      options: [
        { kind: 'PACKAGE', label: 'Basic', priceFrom: '500', priceTo: '200', isActive: true, displayOrder: 0 },
      ],
    });
    expect(inverted.success).toBe(false);
  });
});
