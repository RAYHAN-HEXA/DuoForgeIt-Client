import { describe, expect, it, vi } from 'vitest';

/**
 * Pure-logic tests for the order domain: transition rules, money math, and
 * customer permissions. DB-touching paths are exercised through integration
 * flows; these pin the contracts that protect money and state.
 */

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { assertCustomerCancellable, assertTransition, computeAccessibleTransitions } from '../services/order.rules.js';
import { ApiError } from '../utils/ApiError.js';

describe('order transitions', () => {
  it('allows the happy path', () => {
    expect(() => assertTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertTransition('UNDER_REVIEW', 'APPROVED')).not.toThrow();
    expect(() => assertTransition('APPROVED', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertTransition('IN_PROGRESS', 'QUALITY_REVIEW')).not.toThrow();
    expect(() => assertTransition('QUALITY_REVIEW', 'COMPLETED')).not.toThrow();
    expect(() => assertTransition('COMPLETED', 'DELIVERED')).not.toThrow();
  });

  it('allows quality-review rework', () => {
    expect(() => assertTransition('QUALITY_REVIEW', 'IN_PROGRESS')).not.toThrow();
  });

  it('rejects skipping stages', () => {
    expect(() => assertTransition('SUBMITTED', 'IN_PROGRESS')).toThrow(ApiError);
    expect(() => assertTransition('APPROVED', 'COMPLETED')).toThrow(ApiError);
    expect(() => assertTransition('IN_PROGRESS', 'DELIVERED')).toThrow(ApiError);
  });

  it('terminal states are frozen', () => {
    for (const terminal of ['DELIVERED', 'REJECTED', 'CANCELLED'] as const) {
      expect(() => assertTransition(terminal, 'IN_PROGRESS')).toThrow(ApiError);
      expect(() => assertTransition(terminal, 'CANCELLED')).toThrow(ApiError);
    }
  });

  it('exposes the legal transitions map', () => {
    expect(computeAccessibleTransitions('SUBMITTED')).toEqual(['UNDER_REVIEW', 'REJECTED', 'CANCELLED']);
  });
});

describe('customer cancellation window', () => {
  it('allows cancel only before real work starts', () => {
    expect(() => assertCustomerCancellable('SUBMITTED')).not.toThrow();
    expect(() => assertCustomerCancellable('UNDER_REVIEW')).not.toThrow();
  });

  it('blocks cancel once approved or beyond', () => {
    for (const status of ['APPROVED', 'IN_PROGRESS', 'QUALITY_REVIEW', 'COMPLETED', 'DELIVERED'] as const) {
      expect(() => assertCustomerCancellable(status)).toThrow(ApiError);
    }
  });
});
