import type { Prisma } from '../generated/prisma/client.js';
import { ORDER_NUMBER_PATTERN } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { assertCustomerCancellable, assertTransition } from './order.rules.js';

/**
 * Order lifecycle rules, enforced server-side:
 *  - Status transitions follow ORDER_TRANSITIONS (shared contract) — the
 *    client can never push an order onto an illegal state.
 *  - Checkout is idempotent: a repeated idempotencyKey replays the stored
 *    order instead of double-charging/double-creating.
 *  - Order numbers (TSH-YYYY-NNNNNN) come from a year count + unique-index
 *    retry, so concurrent checkouts can't collide silently.
 */

export { assertCustomerCancellable, assertTransition };

/** Find the founder profile matching a customer preference (A/B), or null for AUTO_ASSIGN. */
export async function resolveFounderPreference(
  preference: 'FOUNDER_A' | 'FOUNDER_B' | 'AUTO_ASSIGN',
): Promise<{ preferredFounderId: string | null; preferenceSource: 'CUSTOMER_CHOICE' | 'AUTO_ASSIGN' }> {
  if (preference === 'AUTO_ASSIGN') return { preferredFounderId: null, preferenceSource: 'AUTO_ASSIGN' };
  // A = engineering lead, B = design/docs lead; fall back to any selectable
  // founder if the discipline set ever changes.
  const discipline = preference === 'FOUNDER_A' ? 'WEB_SOFTWARE_ECOMMERCE' : 'DESIGN_DOCS_UX';
  const exact = await prisma.founderProfile.findFirst({
    where: { isSelectable: true, discipline },
    orderBy: { displayOrder: 'asc' },
  });
  const fallback =
    exact ?? (await prisma.founderProfile.findFirst({ where: { isSelectable: true }, orderBy: { displayOrder: 'asc' } }));
  return { preferredFounderId: fallback?.id ?? null, preferenceSource: 'CUSTOMER_CHOICE' };
}

/**
 * Next order number for the year. The unique index on orderNumber is the real
 * guard — on a P2002 the checkout transaction simply retries with a fresh count.
 */
async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const count = await prisma.order.count({ where: { createdAt: { gte: start } } });
  return `TSH-${year}-${String(count + 1).padStart(6, '0')}`;
}

export type CheckoutItemInput = {
  serviceId: string;
  quantity: number;
  optionIds: string[];
  requirements?: string;
};

export type CheckoutInput = {
  customerId: string;
  idempotencyKey: string;
  items: CheckoutItemInput[];
  deadline: Date;
  founderPreference: 'FOUNDER_A' | 'FOUNDER_B' | 'AUTO_ASSIGN';
  notes?: string;
  attachmentIds: string[];
};

const MAX_CHECKOUT_ATTEMPTS = 4;

export async function checkout(
  input: CheckoutInput,
): Promise<{ orderId: string; replayed: boolean }> {
  // Idempotent replay — same key AND same customer returns the stored order.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.customerId !== input.customerId) {
      // Key collision with another customer's order — never leak, never reuse.
      throw ApiError.conflict('This submission key is already in use', 'IDEMPOTENCY_KEY_TAKEN');
    }
    return { orderId: existing.id, replayed: true };
  }

  if (input.items.length === 0) throw ApiError.badRequest('Order must contain at least one item', 'EMPTY_ORDER');
  const minDeadline = Date.now() + 24 * 60 * 60 * 1000;
  if (input.deadline.getTime() < minDeadline) {
    throw ApiError.badRequest('Deadline must be at least 24 hours from now', 'DEADLINE_TOO_SOON');
  }

  // Resolve catalog + validate options server-side; money is computed here, never client-side.
  const serviceIds = [...new Set(input.items.map((i) => i.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, isActive: true },
    include: { options: true },
  });
  if (services.length !== serviceIds.length) {
    throw ApiError.badRequest('One or more services are unavailable', 'SERVICE_UNAVAILABLE');
  }

  const lines = input.items.map((item) => {
    const service = services.find((s) => s.id === item.serviceId)!;
    const selected = item.optionIds
      .map((id) => service.options.find((o) => o.id === id))
      .filter((o): o is (typeof service.options)[number] => Boolean(o));
    if (selected.length !== item.optionIds.length) {
      throw ApiError.badRequest(`Invalid options for ${service.name}`, 'INVALID_OPTIONS');
    }
    return {
      serviceId: service.id,
      serviceName: service.name,
      basePrice: service.basePrice,
      quantity: item.quantity,
      requirements: item.requirements ?? null,
      options: selected.map((o) => ({ label: o.label, priceDelta: o.priceDelta, daysDelta: o.daysDelta })),
    };
  });

  const { orderTotal } = computeTotal(lines);

  const { preferredFounderId, preferenceSource } = await resolveFounderPreference(input.founderPreference);
  const first = lines[0]!;
  const title = lines.length === 1 ? first.serviceName : `${first.serviceName} + ${lines.length - 1} more`;

  for (let attempt = 1; attempt <= MAX_CHECKOUT_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber: await nextOrderNumber(),
            customerId: input.customerId,
            preferredFounderId,
            preferenceSource,
            status: 'SUBMITTED',
            title,
            deadline: input.deadline,
            totalAmount: orderTotal,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey,
            items: {
              create: lines.map((l) => ({
                serviceId: l.serviceId,
                serviceName: l.serviceName,
                basePrice: l.basePrice,
                quantity: l.quantity,
                lineTotal: l.options
                  .reduce((a, o) => a.plus(o.priceDelta), l.basePrice)
                  .times(l.quantity),
                requirements: l.requirements,
                optionSnapshots: {
                  create: l.options.map((o) => ({
                    label: o.label,
                    priceDelta: o.priceDelta,
                    daysDelta: o.daysDelta,
                  })),
                },
              })),
            },
            statusHistory: {
              create: { fromStatus: null, toStatus: 'SUBMITTED', note: 'Order submitted' },
            },
          },
          select: { id: true },
        });

        if (input.attachmentIds.length) {
          // Claim staged attachments — only files uploaded BY this customer
          // and not yet bound to another order can be claimed.
          const claimed = await tx.orderAttachment.updateMany({
            where: {
              id: { in: input.attachmentIds },
              uploadedById: input.customerId,
              orderId: null,
            },
            data: { orderId: order.id },
          });
          if (claimed.count !== input.attachmentIds.length) {
            throw ApiError.badRequest(
              'One or more attachments could not be linked to this order',
              'ATTACHMENT_CLAIM_FAILED',
            );
          }
        }
        return order;
      });
      return { orderId: created.id, replayed: false };
    } catch (err) {
      // Unique violation on orderNumber/idempotencyKey → another concurrent
      // checkout won the number race; re-read for idempotent replay or retry.
      const isUniqueViolation =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
      if (isUniqueViolation && attempt < MAX_CHECKOUT_ATTEMPTS) {
        logger.warn({ attempt, customerId: input.customerId }, 'Checkout number collision — retrying');
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(500, 'CHECKOUT_FAILED', 'Could not allocate an order number — try again');
}

/** Compute the order total from lines (integer-cent math, no floats). */
function computeTotal(lines: Array<{ basePrice: unknown; quantity: number; options: Array<{ priceDelta: unknown }> }>): { orderTotal: string } {
  let acc = 0n;
  // money as integer cents
  for (const l of lines) {
    const base = moneyToCents(String(l.basePrice));
    const delta = l.options.reduce((sum, o) => sum + moneyToCents(String(o.priceDelta)), 0n);
    acc += (base + delta) * BigInt(l.quantity);
  }
  return { orderTotal: centsToMoney(acc) };
}

function moneyToCents(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  const frac2 = (frac + '00').slice(0, 2);
  return BigInt(whole!) * 100n + BigInt(frac2);
}

function centsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
}

// ─── Queries ─────────────────────────────────────────────────

const detailInclude = {
  preferredFounder: { select: { displayName: true } },
  assignedFounder: { select: { id: true, fullName: true } },
  items: { include: { optionSnapshots: true }, orderBy: { createdAt: 'asc' } },
  statusHistory: true,
  payments: { orderBy: { createdAt: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
  deliverables: { orderBy: [{ version: 'desc' }, { createdAt: 'asc' }] },
  revisionRequests: { orderBy: { createdAt: 'desc' } },
  reviews: true,
} satisfies Prisma.OrderInclude;

export async function getOwnOrder(customerId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: detailInclude,
  });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

export async function getAnyOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...detailInclude, customer: { select: { id: true, fullName: true, email: true } } },
  });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

/** Customer cancel (SUBMITTED/UNDER_REVIEW only). Returns the order. */
export async function customerCancel(customerId: string, orderId: string, reason: string) {
  const order = await getOwnOrder(customerId, orderId);
  assertCustomerCancellable(order.status);
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason.slice(0, 500),
      statusHistory: {
        create: { fromStatus: order.status, toStatus: 'CANCELLED', note: 'Cancelled by customer' },
      },
    },
  });
  return updated;
}

export function isValidOrderNumberFormat(value: string) {
  return ORDER_NUMBER_PATTERN.test(value);
}
