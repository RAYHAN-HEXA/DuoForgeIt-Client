import { describe, expect, it } from 'vitest';
import {
  paymentAccountCreateSchema,
  paymentAccountReorderSchema,
  paymentAccountUpdateSchema,
} from './index.js';

const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const validCreate = {
  methodKey: 'BKASH',
  label: 'Main bKash',
  accountNumber: '01712345678',
  accountHolder: 'TechService Hub',
};

describe('paymentAccountCreateSchema', () => {
  it('accepts a valid predefined-rail account and defaults isActive', () => {
    const parsed = paymentAccountCreateSchema.parse(validCreate);
    expect(parsed).toMatchObject(validCreate);
    expect(parsed.isActive).toBe(true);
    expect(parsed.displayOrder).toBeUndefined();
  });

  it('accepts custom method keys allowed by the rail contract', () => {
    const parsed = paymentAccountCreateSchema.parse({ ...validCreate, methodKey: 'UPAY', label: 'Upay merchant' });
    expect(parsed.methodKey).toBe('UPAY');
    expect(paymentAccountCreateSchema.safeParse({ ...validCreate, methodKey: 'CUSTOM_RAIL_2' }).success).toBe(true);
  });

  it('rejects invalid method keys', () => {
    for (const methodKey of ['bkash', 'B', 'BKASH-NET', '1BKASH']) {
      expect(paymentAccountCreateSchema.safeParse({ ...validCreate, methodKey }).success).toBe(false);
    }
  });

  it('requires the core account fields', () => {
    for (const key of ['methodKey', 'label', 'accountNumber', 'accountHolder'] as const) {
      const payload: Record<string, unknown> = { ...validCreate };
      delete payload[key];
      expect(paymentAccountCreateSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('validates optional fields and bounds', () => {
    expect(
      paymentAccountCreateSchema.safeParse({
        ...validCreate,
        accountType: 'Merchant',
        instructions: 'Send money, then submit the TrxID.',
        qrPathname: 'techservice-hub/payment-accounts/user/asset',
        displayOrder: 100_000,
      }).success,
    ).toBe(true);
    expect(paymentAccountCreateSchema.safeParse({ ...validCreate, displayOrder: -1 }).success).toBe(false);
    expect(paymentAccountCreateSchema.safeParse({ ...validCreate, displayOrder: 100_001 }).success).toBe(false);
    expect(paymentAccountCreateSchema.safeParse({ ...validCreate, displayOrder: 1.5 }).success).toBe(false);
  });

  it('strips client-supplied identity/audit fields', () => {
    const parsed = paymentAccountCreateSchema.parse({
      ...validCreate,
      createdById: 'attacker',
      updatedById: 'attacker',
      role: 'ADMIN',
    });
    expect(parsed).not.toHaveProperty('createdById');
    expect(parsed).not.toHaveProperty('updatedById');
    expect(parsed).not.toHaveProperty('role');
  });
});

describe('paymentAccountUpdateSchema', () => {
  it('accepts a partial update and explicit nulls to clear optional fields', () => {
    const parsed = paymentAccountUpdateSchema.parse({
      label: 'Renamed account',
      accountType: null,
      instructions: null,
      qrPathname: null,
    });
    expect(parsed.label).toBe('Renamed account');
    expect(parsed.accountType).toBeNull();
    expect(parsed.instructions).toBeNull();
    expect(parsed.qrPathname).toBeNull();
  });

  it('accepts an empty update object (no-op) but rejects invalid values', () => {
    expect(paymentAccountUpdateSchema.safeParse({}).success).toBe(true);
    expect(paymentAccountUpdateSchema.safeParse({ label: '' }).success).toBe(false);
    expect(paymentAccountUpdateSchema.safeParse({ methodKey: 'nope' }).success).toBe(false);
    expect(paymentAccountUpdateSchema.safeParse({ qrPathname: 'tiny' }).success).toBe(false);
  });
});

describe('paymentAccountReorderSchema', () => {
  it('accepts distinct ids and distinct positions', () => {
    const parsed = paymentAccountReorderSchema.parse({
      items: [
        { id: ID, displayOrder: 0 },
        { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302', displayOrder: 1 },
      ],
    });
    expect(parsed.items).toHaveLength(2);
  });

  it('rejects an empty list', () => {
    expect(paymentAccountReorderSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rejects duplicate account ids', () => {
    const result = paymentAccountReorderSchema.safeParse({
      items: [
        { id: ID, displayOrder: 0 },
        { id: ID, displayOrder: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Duplicate account id')).toBe(true);
    }
  });

  it('rejects duplicate display positions', () => {
    const result = paymentAccountReorderSchema.safeParse({
      items: [
        { id: ID, displayOrder: 4 },
        { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302', displayOrder: 4 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Duplicate display order')).toBe(true);
    }
  });

  it('rejects malformed ids and negative positions', () => {
    expect(paymentAccountReorderSchema.safeParse({ items: [{ id: 'not-a-uuid', displayOrder: 0 }] }).success).toBe(false);
    expect(paymentAccountReorderSchema.safeParse({ items: [{ id: ID, displayOrder: -1 }] }).success).toBe(false);
  });
});
