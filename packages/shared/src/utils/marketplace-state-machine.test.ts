import { describe, expect, it } from 'vitest';
import { REQUEST_TRANSITIONS, V2_REFUNDABLE_ON_CANCEL } from '../constants/index.js';
import {
  allowedRequestTransitions,
  isOrderTransitionAllowed,
  isRequestTransitionAllowed,
} from './index.js';

describe('request state machine', () => {
  it('moves a standard request through review → quotation → accepted', () => {
    expect(isRequestTransitionAllowed('REQUEST_SUBMITTED', 'UNDER_REVIEW', false)).toBe(true);
    expect(isRequestTransitionAllowed('UNDER_REVIEW', 'QUOTATION_SENT', false)).toBe(true);
    expect(isRequestTransitionAllowed('QUOTATION_SENT', 'ACCEPTED_AWAITING_PAYMENT', false)).toBe(true);
    expect(isRequestTransitionAllowed('ACCEPTED_AWAITING_PAYMENT', 'ORDER_CREATED', false)).toBe(true);
  });

  it('blocks illegal jumps', () => {
    expect(isRequestTransitionAllowed('REQUEST_SUBMITTED', 'QUOTATION_SENT', false)).toBe(false);
    expect(isRequestTransitionAllowed('REQUEST_SUBMITTED', 'ORDER_CREATED', false)).toBe(false);
    expect(isRequestTransitionAllowed('UNDER_REVIEW', 'ACCEPTED_AWAITING_PAYMENT', false)).toBe(false);
    expect(isRequestTransitionAllowed('ORDER_CREATED', 'UNDER_REVIEW', false)).toBe(false);
  });

  it('hides repair-only stages from non-repair services', () => {
    const targets = allowedRequestTransitions('REQUEST_SUBMITTED', false);
    expect(targets).toContain('UNDER_REVIEW');
    expect(targets).not.toContain('DIAGNOSIS_SCHEDULED');

    const repairTargets = allowedRequestTransitions('REQUEST_SUBMITTED', true);
    expect(repairTargets).toContain('DIAGNOSIS_SCHEDULED');
    expect(repairTargets).not.toContain('QUOTATION_SENT'); // diagnosis comes first...
    expect(isRequestTransitionAllowed('UNDER_REVIEW', 'QUOTATION_SENT', true)).toBe(true); // ...but a skip is legal
  });

  it('runs the repair flow diagnosis → estimate → approval', () => {
    expect(isRequestTransitionAllowed('DIAGNOSIS_SCHEDULED', 'DIAGNOSIS_SENT', true)).toBe(true);
    expect(isRequestTransitionAllowed('DIAGNOSIS_SENT', 'ACCEPTED_AWAITING_PAYMENT', true)).toBe(true);
    expect(isRequestTransitionAllowed('DIAGNOSIS_SENT', 'QUOTATION_DECLINED', true)).toBe(true);
    expect(isRequestTransitionAllowed('DIAGNOSIS_SCHEDULED', 'ACCEPTED_AWAITING_PAYMENT', true)).toBe(false);
  });

  it('allows re-quote after decline/expiry and terminal states have no exits', () => {
    expect(isRequestTransitionAllowed('QUOTATION_DECLINED', 'QUOTATION_SENT', false)).toBe(true);
    expect(isRequestTransitionAllowed('QUOTATION_EXPIRED', 'QUOTATION_SENT', false)).toBe(true);
    expect(isRequestTransitionAllowed('QUOTATION_EXPIRED', 'UNDER_REVIEW', false)).toBe(false);
    expect(REQUEST_TRANSITIONS['ORDER_CREATED']).toEqual([]);
    expect(REQUEST_TRANSITIONS['CANCELLED']).toEqual([]);
    expect(REQUEST_TRANSITIONS['REJECTED']).toEqual([]);
  });

  it('keeps money out of the request side: payment-free statuses only', () => {
    // No request status may transition into anything order-side.
    for (const [from, targets] of Object.entries(REQUEST_TRANSITIONS)) {
      for (const to of targets) {
        expect(
          ['PAID_SCHEDULED', 'IN_PROGRESS', 'REVIEW_REVISION', 'DELIVERED_COMPLETED'],
          `request ${from} must never transition into order status ${to}`,
        ).not.toContain(to);
      }
    }
  });
});

describe('order state machine (marketplace v2)', () => {
  it('runs the v2 pipeline', () => {
    expect(isOrderTransitionAllowed('MARKETPLACE', 'PAID_SCHEDULED', 'IN_PROGRESS')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'IN_PROGRESS', 'REVIEW_REVISION')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'REVIEW_REVISION', 'IN_PROGRESS')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'REVIEW_REVISION', 'DELIVERED_COMPLETED')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'IN_PROGRESS', 'DELIVERED_COMPLETED')).toBe(true);
  });

  it('allows cancelling (with refund) at any pre-delivery stage', () => {
    expect(isOrderTransitionAllowed('MARKETPLACE', 'PAID_SCHEDULED', 'CANCELLED')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'IN_PROGRESS', 'CANCELLED')).toBe(true);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'REVIEW_REVISION', 'CANCELLED')).toBe(true);
    expect(V2_REFUNDABLE_ON_CANCEL).toEqual(['PAID_SCHEDULED', 'IN_PROGRESS', 'REVIEW_REVISION']);
  });

  it('blocks legacy statuses and illegal jumps for marketplace orders', () => {
    expect(isOrderTransitionAllowed('MARKETPLACE', 'PAID_SCHEDULED', 'SUBMITTED')).toBe(false);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'PAID_SCHEDULED', 'APPROVED')).toBe(false);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'DELIVERED_COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(isOrderTransitionAllowed('MARKETPLACE', 'CANCELLED', 'IN_PROGRESS')).toBe(false);
  });

  it('legacy orders never enter or leave marketplace-only statuses', () => {
    expect(isOrderTransitionAllowed('LEGACY', 'SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(isOrderTransitionAllowed('LEGACY', 'SUBMITTED', 'PAID_SCHEDULED')).toBe(false);
    expect(isOrderTransitionAllowed('LEGACY', 'IN_PROGRESS', 'REVIEW_REVISION')).toBe(false);
    expect(isOrderTransitionAllowed('LEGACY', 'PAID_SCHEDULED', 'IN_PROGRESS')).toBe(false);
    expect(isOrderTransitionAllowed('LEGACY', 'IN_PROGRESS', 'QUALITY_REVIEW')).toBe(true);
  });
});
