import { describe, expect, it } from 'vitest';
import { buildRequestAnswersSchema, formFieldKeySchema, type ServiceFormFieldDef } from './index.js';

const sdWebFields: ServiceFormFieldDef[] = [
  { key: 'course', label: 'Course / SD package', type: 'SELECT', options: ['SD-1', 'SD-2', 'SD-3'], required: true, validation: null },
  { key: 'project_title', label: 'Project title', type: 'TEXT', required: true, validation: { minLength: 3, maxLength: 160 } },
  { key: 'requirements', label: 'Requirements', type: 'TEXTAREA', required: true, validation: { minLength: 10, maxLength: 5000 } },
  { key: 'report_required', label: 'Project report required?', type: 'CHECKBOX', required: false, validation: null },
  { key: 'deadline', label: 'Deadline', type: 'DATE', required: false, validation: null },
  { key: 'reference_files', label: 'Reference files', type: 'FILE', required: false, validation: { maxFiles: 5 } },
  { key: 'notes', label: 'Notes', type: 'TEXTAREA', required: false, validation: { maxLength: 2000 } },
];

describe('buildRequestAnswersSchema (submit mode)', () => {
  it('accepts a valid SD web submission', () => {
    const schema = buildRequestAnswersSchema(sdWebFields, 'submit');
    const result = schema.safeParse({
      course: 'SD-2',
      project_title: 'Library Management System',
      requirements: 'Java Swing app with CRUD, search and file storage.',
      report_required: true,
      deadline: '2026-12-01T00:00:00.000Z',
      reference_files: ['3f9d1c2e-1111-4111-8111-111111111111'],
      notes: 'Follow the class diagram from class.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing required field with a helpful message', () => {
    const schema = buildRequestAnswersSchema(sdWebFields, 'submit');
    const result = schema.safeParse({ course: 'SD-1', requirements: 'x'.repeat(20) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toContain('required');
    }
  });

  it('rejects unknown keys (no client-invented fields)', () => {
    const schema = buildRequestAnswersSchema(sdWebFields, 'submit');
    const result = schema.safeParse({
      course: 'SD-1',
      project_title: 'T',
      requirements: 'x'.repeat(20),
      price: '0',
    });
    expect(result.success).toBe(false);
  });

  it('enforces SELECT options and MULTISELECT subsets', () => {
    const fields: ServiceFormFieldDef[] = [
      { key: 'issue_category', label: 'Issue category', type: 'SELECT', options: ['WINDOWS_BOOT', 'PERFORMANCE'], required: true, validation: null },
      { key: 'platforms', label: 'Platforms', type: 'MULTISELECT', options: ['web', 'mobile'], required: false, validation: null },
    ];
    const schema = buildRequestAnswersSchema(fields, 'submit');
    expect(schema.safeParse({ issue_category: 'HARDWARE_DIAGNOSIS' }).success).toBe(false);
    expect(schema.safeParse({ issue_category: 'PERFORMANCE', platforms: ['web'] }).success).toBe(true);
    expect(schema.safeParse({ issue_category: 'PERFORMANCE', platforms: ['fridge'] }).success).toBe(false);
  });

  it('applies NUMBER bounds and PHONE/URL formats', () => {
    const fields: ServiceFormFieldDef[] = [
      { key: 'slide_count', label: 'Slide count', type: 'NUMBER', required: true, validation: { min: 1, max: 200 } },
      { key: 'phone', label: 'Phone', type: 'PHONE', required: false, validation: null },
      { key: 'repo_url', label: 'Repository', type: 'URL', required: false, validation: null },
    ];
    const schema = buildRequestAnswersSchema(fields, 'submit');
    expect(schema.safeParse({ slide_count: 0 }).success).toBe(false);
    expect(schema.safeParse({ slide_count: 201 }).success).toBe(false);
    expect(schema.safeParse({ slide_count: 10 }).success).toBe(true);
    expect(schema.safeParse({ slide_count: 10, phone: '01712345678' }).success).toBe(true);
    expect(schema.safeParse({ slide_count: 10, phone: '12345' }).success).toBe(false);
    expect(schema.safeParse({ slide_count: 10, repo_url: 'not-a-url' }).success).toBe(false);
    expect(schema.safeParse({ slide_count: 10, repo_url: 'https://github.com/x/y' }).success).toBe(true);
  });

  it('caps FILE answers at the configured count', () => {
    const fields: ServiceFormFieldDef[] = [
      { key: 'photos', label: 'Photos', type: 'FILE', required: false, validation: { maxFiles: 2 } },
    ];
    const schema = buildRequestAnswersSchema(fields, 'submit');
    const uuid = (n: number) => `3f9d1c2e-1111-4111-8111-${String(n).padStart(12, '0')}`;
    expect(schema.safeParse({ photos: [uuid(1)] }).success).toBe(true);
    expect(schema.safeParse({ photos: [uuid(1), uuid(2), uuid(3)] }).success).toBe(false);
  });

  it('requires required text fields to be non-empty, not just present', () => {
    const schema = buildRequestAnswersSchema(sdWebFields, 'submit');
    expect(
      schema.safeParse({ course: 'SD-1', project_title: '   ', requirements: 'x'.repeat(20) }).success,
    ).toBe(false);
  });
});

describe('buildRequestAnswersSchema (draft mode)', () => {
  it('allows partial answers and strips unknown keys', () => {
    const schema = buildRequestAnswersSchema(sdWebFields, 'draft');
    const result = schema.safeParse({ course: 'SD-3', future_field: 'junk' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).toEqual(['course']);
    }
  });
});

describe('formFieldKeySchema', () => {
  it('accepts kebab/snake keys and rejects unsafe ones', () => {
    expect(formFieldKeySchema.safeParse('project_title').success).toBe(true);
    expect(formFieldKeySchema.safeParse('deadline2').success).toBe(true);
    expect(formFieldKeySchema.safeParse('constructor').success).toBe(true); // safe as an object key literal
    expect(formFieldKeySchema.safeParse('Project Title').success).toBe(false);
    expect(formFieldKeySchema.safeParse('__proto__').success).toBe(false);
    expect(formFieldKeySchema.safeParse('price; DROP TABLE').success).toBe(false);
  });
});
