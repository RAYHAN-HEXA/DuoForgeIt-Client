import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_CATALOGUE,
  LEGACY_SERVICE_SLUGS,
  REPLACED_SERVICE_SLUGS,
  PAYMENT_METHOD_SEED,
} from '../catalogue.js';
import { formFieldKeySchema, REPAIR_ISSUE_CATEGORIES } from '@tsh/shared';

/** Collect every human-readable string in the catalogue (prices excluded). */
function* catalogueStrings(items: unknown[]): Generator<string> {
  for (const item of items) {
    if (typeof item === 'string') yield item;
    else if (Array.isArray(item)) yield* catalogueStrings(item);
    else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'priceFrom' || key === 'priceTo' || key === 'basePrice') continue;
        yield* catalogueStrings([value]);
      }
    }
  }
}

const allServices = MARKETPLACE_CATALOGUE.flatMap((c) => c.services);

describe('marketplace seed catalogue', () => {
  it('seeds exactly 6 categories and 12 services', () => {
    expect(MARKETPLACE_CATALOGUE).toHaveLength(6);
    expect(allServices).toHaveLength(12);
  });

  it('covers all six PRD v2.0 categories', () => {
    expect(MARKETPLACE_CATALOGUE.map((c) => c.slug)).toEqual([
      'web-development',
      'software-projects',
      'academic-documentation-presentation',
      'hardware-engineering-projects',
      'pc-laptop-repair',
      'custom-it-solutions',
    ]);
  });

  it('pins the PRD v2.0 prices exactly', () => {
    const bySlug = Object.fromEntries(allServices.map((s) => [s.slug, s]));

    // SD-1/2/3 as three separate services: ৳1,500 / ৳2,000 / ৳2,500 starting
    const sdExpectations: Array<[string, string]> = [
      ['software-development-1', '1500.00'],
      ['software-development-2', '2000.00'],
      ['software-development-3', '2500.00'],
    ];
    for (const [slug, price] of sdExpectations) {
      const sd = bySlug[slug]!;
      expect(sd.pricingModel).toBe('STARTING_FROM');
      expect(sd.priceFrom).toBe(price);
      expect(sd.basePrice).toBe(price);
      // report add-on on every SD service
      const report = sd.packages.find((p) => p.label === 'Project report')!;
      expect(report.kind).toBe('ADDON');
      expect(report.priceFrom).toBe('200.00');
      expect(report.priceTo).toBe('300.00');
      // course field removed (the service IS the course); report checkbox kept
      expect(sd.formFields.some((f) => f.key === 'course')).toBe(false);
      expect(sd.formFields.some((f) => f.key === 'report_required' && f.type === 'CHECKBOX')).toBe(true);
    }
    // the old combined service is superseded, not offered
    expect(allServices.some((s) => s.slug === 'sd-project-development')).toBe(false);
    expect(REPLACED_SERVICE_SLUGS).toContain('sd-project-development');

    // Presentation FIXED ৳500 (10 slides)
    const presentation = bySlug['presentation-design']!;
    expect(presentation.pricingModel).toBe('FIXED');
    expect(presentation.basePrice).toBe('500.00');

    // Lab reports RANGE ৳200-300 (5 reports)
    const lab = bySlug['lab-report-preparation']!;
    expect(lab.pricingModel).toBe('RANGE');
    expect(lab.priceFrom).toBe('200.00');
    expect(lab.priceTo).toBe('300.00');

    // Assignment formatting RANGE ৳200-300 up to 30 pages
    const assignment = bySlug['assignment-formatting']!;
    expect(assignment.priceFrom).toBe('200.00');
    expect(assignment.priceTo).toBe('300.00');
    const pageField = assignment.formFields.find((f) => f.key === 'page_count')!;
    expect(pageField.validation?.max).toBe(30);

    // Project documentation RANGE ৳400-500
    const docs = bySlug['project-proposal-report']!;
    expect(docs.priceFrom).toBe('400.00');
    expect(docs.priceTo).toBe('500.00');

    // Everything else CUSTOM_QUOTE
    for (const slug of [
      'commercial-web-development',
      'java-oop-project',
      'hardware-project-assistance',
      'pc-laptop-repair-support',
      'it-consultation',
    ]) {
      expect(bySlug[slug]!.pricingModel).toBe('CUSTOM_QUOTE');
    }
  });

  it('never mentions theses anywhere in the catalogue (R5)', () => {
    const forbidden = /thes[ei]s/i;
    for (const text of catalogueStrings(MARKETPLACE_CATALOGUE)) {
      expect(forbidden.test(text), `forbidden term in: "${text.slice(0, 80)}"`).toBe(false);
    }
  });

  it('keeps delivery estimates unset until an admin sets them (R6)', () => {
    for (const service of allServices) {
      expect(service as unknown as Record<string, unknown>).not.toHaveProperty('deliveryEstimateText');
    }
  });

  it('gives every service data-driven form fields with valid keys', () => {
    for (const service of allServices) {
      expect(service.formFields.length).toBeGreaterThan(0);
      for (const field of service.formFields) {
        expect(formFieldKeySchema.safeParse(field.key).success).toBe(true);
        if (field.type === 'SELECT' || field.type === 'MULTISELECT') {
          expect(field.options?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('asks only service-relevant fields (spot checks per PRD §D)', () => {
    const bySlug = Object.fromEntries(allServices.map((s) => [s.slug, s]));
    const keys = (slug: string) => bySlug[slug]!.formFields.map((f) => f.key);

    expect(keys('software-development-1')).toEqual(
      expect.arrayContaining(['project_title', 'requirements', 'report_required', 'deadline']),
    );
    expect(keys('software-development-1')).not.toContain('course'); // the service IS the course
    expect(keys('java-oop-project')).toEqual(
      expect.arrayContaining(['course', 'brief', 'required_features', 'java_interface']),
    );
    expect(keys('presentation-design')).toEqual(
      expect.arrayContaining(['topic', 'slide_count', 'presentation_date']),
    );
    expect(keys('pc-laptop-repair-support')).toEqual(
      expect.arrayContaining(['device_type', 'issue_category', 'brand', 'symptoms']),
    );
    // SD form never asks Java interface questions and vice versa
    expect(keys('software-development-1')).not.toContain('java_interface');
    expect(keys('java-oop-project')).not.toContain('report_required');
  });

  it('marks exactly one PC_REPAIR service aligned with the repair issue categories', () => {
    const repairs = allServices.filter((s) => s.serviceType === 'PC_REPAIR');
    expect(repairs).toHaveLength(1);
    const options = repairs[0]!.formFields.find((f) => f.key === 'issue_category')!.options!;
    expect(options).toHaveLength(REPAIR_ISSUE_CATEGORIES.length);
    // photos + contact preference asked for repair
    expect(repairs[0]!.formFields.some((f) => f.key === 'photos')).toBe(true);
    expect(repairs[0]!.formFields.some((f) => f.key === 'contact_preference')).toBe(true);
  });

  it('requires the diagnosis disclaimer on repair content', () => {
    const repair = allServices.find((s) => s.serviceType === 'PC_REPAIR')!;
    expect(repair.priceNote).toMatch(/diagnosis/i);
    expect(repair.description).toMatch(/without your explicit approval/i);
  });

  it('keeps exactly one request form field required for FILE where content demands uploads', () => {
    // assignment formatting requires the customer's content document
    const assignment = allServices.find((s) => s.slug === 'assignment-formatting')!;
    expect(assignment.formFields.find((f) => f.key === 'source_materials')!.required).toBe(true);
  });

  it('lists all seven legacy service slugs for archiving', () => {
    expect(LEGACY_SERVICE_SLUGS).toHaveLength(7);
    expect(LEGACY_SERVICE_SLUGS).toContain('business-website');
    expect(LEGACY_SERVICE_SLUGS).toContain('it-consulting-sprint');
  });

  it('seeds all five wallet methods with bank transfer disabled', () => {
    expect(PAYMENT_METHOD_SEED.map((m) => m.method)).toEqual([
      'BKASH',
      'NAGAD',
      'ROCKET',
      'BINANCE',
      'BANK_TRANSFER',
    ]);
    expect(PAYMENT_METHOD_SEED.find((m) => m.method === 'BANK_TRANSFER')!.enabled).toBe(false);
    expect(PAYMENT_METHOD_SEED.find((m) => m.method === 'BKASH')!.minDeposit).toBe('100.00');
    expect(PAYMENT_METHOD_SEED.find((m) => m.method === 'BKASH')!.maxDeposit).toBe('50000.00');
  });
});
