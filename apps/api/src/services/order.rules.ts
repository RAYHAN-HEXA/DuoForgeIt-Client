import type { OrderStatus } from '@tsh/shared';
import { CUSTOMER_CANCELLABLE, ORDER_TRANSITIONS } from '@tsh/shared';
import { ApiError } from '../utils/ApiError.js';

/**
 * Pure order-state rules (imported by order.service and admin.service and
 * unit-tested directly — no DB).
 */

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw ApiError.conflict(`Illegal status transition ${from} → ${to}`, 'ILLEGAL_TRANSITION');
  }
}

export function computeAccessibleTransitions(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from];
}

export function assertCustomerCancellable(status: OrderStatus) {
  if (!CUSTOMER_CANCELLABLE.includes(status)) {
    throw ApiError.conflict(
      'This order can no longer be cancelled by the customer — contact support',
      'NOT_CANCELLABLE',
    );
  }
}
