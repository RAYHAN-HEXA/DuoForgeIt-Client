import { describe, expect, it, vi } from 'vitest';
import type { Payment } from '../generated/prisma/client.js';

/**
 * Pure-logic tests for the payment service: Stage 1 TrxID normalization,
 * outstanding-amount math, account eligibility (incl. the negotiated-order
 * bKash-only rule), screenshot namespace ownership, and DTO safety. DB paths
 * are exercised in payments-v2.integration.test.ts against real PostgreSQL.
 */

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { parseMoneyToCents, subtractMoney } from '../utils/money.js';
import {
  REVIEWABLE_PAYMENT_STATUSES,
  assertAccountValidForOrder,
  assertPaymentScreenshotOwnership,
  computeOrderPaymentAccounting,
  computeOutstanding,
  isReviewablePaymentStatus,
  normalizeTransactionId,
  toPaymentSubmissionDto,
} from '../services/payment.service.js';
import { ApiError } from '../utils/ApiError.js';
import { PAYMENT_ERROR_CODES, paymentReviewSchema } from '@tsh/shared';

describe('normalizeTransactionId (Stage 1 contract)', () => {
  it('trims, strips internal whitespace, and uppercases', () => {
    expect(normalizeTransactionId(' ab 12 cd ')).toBe('AB12CD');
    expect(normalizeTransactionId('ab-12-cd')).toBe('AB-12-CD');
    expect(normalizeTransactionId('trx\t9\nwith  tabs')).toBe('TRX9WITHTABS');
  });

  it('mirrors the migration backfill SQL exactly', () => {
    // SQL: upper(regexp_replace("transactionId", '\s+', '', 'g'))
    const samples = ['  aB1 2cD  ', 'nagad-998877', 'UPI/1234', ' double space'];
    for (const raw of samples) {
      const sqlEquivalent = raw.replace(/\s+/g, '').toUpperCase();
      expect(normalizeTransactionId(raw)).toBe(sqlEquivalent);
    }
  });
});

describe('money helpers', () => {
  it('subtractMoney computes outstanding exactly (no float drift)', () => {
    expect(subtractMoney('1000.00', '0.00')).toBe('1000.00');
    expect(subtractMoney('1000.00', '300.25')).toBe('699.75');
    expect(subtractMoney('0.10', '0.20')).toBe('-0.10'); // negative → already paid
    expect(subtractMoney('1000.00', '1000.00')).toBe('0.00');
  });

  it('parseMoneyToCents is strict — malformed input is rejected, never 0', () => {
    expect(parseMoneyToCents('1000.00')).toBe(100000n);
    expect(parseMoneyToCents('12.3')).toBe(1230n);
    expect(parseMoneyToCents('0')).toBe(0n);
    expect(parseMoneyToCents('1 000')).toBeNull();
    expect(parseMoneyToCents('12.345')).toBeNull();
    expect(parseMoneyToCents('-5.00')).toBeNull();
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
  });
});

describe('computeOutstanding', () => {
  it('uses amountPaid when present', () => {
    expect(computeOutstanding({ totalAmount: '2500.00', amountPaid: '500.00' })).toBe('2000.00');
  });

  it('treats null amountPaid as nothing paid', () => {
    expect(computeOutstanding({ totalAmount: '2500.00', amountPaid: null })).toBe('2500.00');
  });
});

describe('computeOrderPaymentAccounting (Stage 3)', () => {
  const row = (status: Payment['status'], amount: string) => ({ status, amount });

  it('aggregates only VERIFIED payments', () => {
    const result = computeOrderPaymentAccounting('1000.00', [
      row('VERIFIED', '300.10'),
      row('VERIFIED', '199.90'),
      row('PENDING', '100.00'),
      row('SUBMITTED', '100.00'),
      row('REJECTED', '400.00'),
      row('REFUNDED', '500.00'),
    ]);
    expect(result.amountPaid).toBe('500.00');
    expect(result.paymentStatus).toBeNull(); // partial — enum has no PARTIAL value
    expect(result.verifiedCents).toBe(50000n);
  });

  it('excludes PENDING alone', () => {
    expect(computeOrderPaymentAccounting('100.00', [row('PENDING', '100.00')]).amountPaid).toBeNull();
  });

  it('excludes SUBMITTED alone', () => {
    expect(computeOrderPaymentAccounting('100.00', [row('SUBMITTED', '100.00')]).amountPaid).toBeNull();
  });

  it('excludes REJECTED alone', () => {
    expect(computeOrderPaymentAccounting('100.00', [row('REJECTED', '100.00')]).amountPaid).toBeNull();
  });

  it('excludes REFUNDED alone', () => {
    expect(computeOrderPaymentAccounting('100.00', [row('REFUNDED', '100.00')]).amountPaid).toBeNull();
  });

  it('uses exact decimal arithmetic, never floating point', () => {
    const result = computeOrderPaymentAccounting('1.00', [
      row('VERIFIED', '0.10'),
      row('VERIFIED', '0.20'),
      row('VERIFIED', '0.70'),
    ]);
    expect(result.amountPaid).toBe('1.00');
    expect(result.paymentStatus).toBe('PAID');
    expect(result.verifiedCents).toBe(100n);
  });

  it('marks an order PAID when verified money equals the total', () => {
    const result = computeOrderPaymentAccounting('1200.00', [row('VERIFIED', '1200.00')]);
    expect(result.amountPaid).toBe('1200.00');
    expect(result.paymentStatus).toBe('PAID');
  });

  it('marks an order PAID when verified money exceeds the total', () => {
    const result = computeOrderPaymentAccounting('1000.00', [
      row('VERIFIED', '600.00'),
      row('VERIFIED', '500.00'),
    ]);
    expect(result.amountPaid).toBe('1100.00');
    expect(result.paymentStatus).toBe('PAID');
  });

  it('leaves an unpaid order with no verified money', () => {
    const result = computeOrderPaymentAccounting('1000.00', []);
    expect(result.amountPaid).toBeNull();
    expect(result.paymentStatus).toBeNull();
    expect(result.verifiedCents).toBe(0n);
  });

  it('supports partial payment accounting without inventing an enum value', () => {
    const result = computeOrderPaymentAccounting('1000.00', [row('VERIFIED', '300.25')]);
    expect(result.amountPaid).toBe('300.25');
    expect(result.paymentStatus).toBeNull();
  });
});

describe('payment review transition guards', () => {
  it('treats SUBMITTED and legacy PENDING as reviewable', () => {
    expect(REVIEWABLE_PAYMENT_STATUSES).toEqual(['PENDING', 'SUBMITTED']);
    expect(isReviewablePaymentStatus('PENDING')).toBe(true);
    expect(isReviewablePaymentStatus('SUBMITTED')).toBe(true);
  });

  it('treats terminal states as not reviewable', () => {
    for (const status of ['VERIFIED', 'REJECTED', 'REFUNDED'] as const) {
      expect(isReviewablePaymentStatus(status)).toBe(false);
    }
  });

  it('requires a meaningful rejection reason (shared contract)', () => {
    const short = paymentReviewSchema.safeParse({ decision: 'REJECTED', note: 'bad' });
    expect(short.success).toBe(false);
    const missing = paymentReviewSchema.safeParse({ decision: 'REJECTED' });
    expect(missing.success).toBe(false);
    const whitespace = paymentReviewSchema.safeParse({ decision: 'REJECTED', note: '     ' });
    expect(whitespace.success).toBe(false);
    const valid = paymentReviewSchema.safeParse({ decision: 'REJECTED', note: 'TrxID not found' });
    expect(valid.success).toBe(true);
  });

  it('allows verification without a note and strips unknown client fields', () => {
    const parsed = paymentReviewSchema.parse({
      decision: 'VERIFIED',
      amountPaid: '1.00',
      paymentStatus: 'PAID',
      verifiedById: 'attacker',
    });
    expect(parsed).toEqual({ decision: 'VERIFIED' });
  });
});

describe('assertAccountValidForOrder', () => {
  const order = (acceptedQuotationId: string | null) => ({ acceptedQuotationId });

  it('rejects unknown and inactive accounts', () => {
    expect(() => assertAccountValidForOrder(null, order(null))).toThrow(ApiError);
    expect(() => assertAccountValidForOrder({ methodKey: 'BKASH', isActive: false }, order(null))).toThrow(ApiError);
  });

  it('rejects non-bKash rails for quotation-negotiated orders with INVALID_PAYMENT_ACCOUNT', () => {
    for (const methodKey of ['NAGAD', 'ROCKET', 'BANK_TRANSFER', 'UPAY']) {
      try {
        assertAccountValidForOrder({ methodKey, isActive: true }, order('quotation-1'));
        expect.unreachable(`${methodKey} must be rejected`);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(400);
        expect((err as ApiError).code).toBe(PAYMENT_ERROR_CODES.INVALID_PAYMENT_ACCOUNT);
      }
    }
  });

  it('accepts an active bKash account for negotiated orders', () => {
    expect(() =>
      assertAccountValidForOrder({ methodKey: 'BKASH', isActive: true }, order('quotation-1')),
    ).not.toThrow();
  });

  it('keeps every rail available to fixed-price orders', () => {
    for (const methodKey of ['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER', 'UPAY']) {
      expect(() => assertAccountValidForOrder({ methodKey, isActive: true }, order(null))).not.toThrow();
    }
  });
});

describe('assertPaymentScreenshotOwnership', () => {
  const userId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  const uuid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  it('accepts the exact user namespace with a server-minted uuid', () => {
    expect(() => assertPaymentScreenshotOwnership(`techservice-hub/payments/${userId}/${uuid}`, userId)).not.toThrow();
  });

  it('rejects another user’s namespace', () => {
    const foreign = '99999999-9999-9999-9999-999999999999';
    expect(() => assertPaymentScreenshotOwnership(`techservice-hub/payments/${foreign}/${uuid}`, userId)).toThrow(ApiError);
  });

  it('rejects arbitrary folders and malformed ids', () => {
    expect(() => assertPaymentScreenshotOwnership(`techservice-hub/requirements/${userId}/${uuid}`, userId)).toThrow(ApiError);
    expect(() => assertPaymentScreenshotOwnership(`techservice-hub/payments/${userId}/not-a-uuid`, userId)).toThrow(ApiError);
    expect(() => assertPaymentScreenshotOwnership(`techservice-hub/payments/${userId}/${uuid}/../secret`, userId)).toThrow(ApiError);
    expect(() => assertPaymentScreenshotOwnership('', userId)).toThrow(ApiError);
  });
});

describe('toPaymentSubmissionDto safety', () => {
  it('exposes only safe fields — never the raw screenshot id or admin fields', () => {
    const payment = {
      id: 'p1',
      orderId: 'o1',
      method: 'OTHER',
      status: 'SUBMITTED',
      amount: { toString: () => '1000.00', toFixed: () => '1000.00' },
      transactionId: 'AB12CD',
      screenshotPublicId: 'techservice-hub/payments/u1/abc.png-secret',
      adminNote: 'internal note',
      verifiedAt: null,
      methodKeySnapshot: 'UPAY',
      methodLabelSnapshot: 'Upay personal',
      accountNumberSnapshot: '01700000000',
      senderNumber: '01800000000',
      createdAt: new Date('2026-11-05T00:00:00Z'),
    } as unknown as Payment;

    const dto = toPaymentSubmissionDto(payment);
    expect(Object.keys(dto).sort()).toEqual(
      [
        'accountNumber',
        'amount',
        'createdAt',
        'hasScreenshot',
        'id',
        'methodKey',
        'methodLabel',
        'orderId',
        'senderNumber',
        'status',
        'transactionId',
      ].sort(),
    );
    expect(dto.hasScreenshot).toBe(true);
    expect(JSON.stringify(dto)).not.toContain('abc.png-secret');
    expect(JSON.stringify(dto)).not.toContain('internal note');
    expect(dto.methodKey).toBe('UPAY'); // snapshot identity, not the collapsed OTHER
  });
});
