import type { AdminPaymentStatsDto, AdminStatsDto, OrderStatus, PaymentStatus } from '@tsh/shared';
import { PAYMENT_ERROR_CODES, PAYMENT_METHODS } from '@tsh/shared';
import type { Prisma, PaymentMethod } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { signedDownloadUrl, PAYMENTS_UPLOAD_ROOT } from '../utils/cloudinary.js';
import { assertTransition } from './order.service.js';
import {
  REVIEWABLE_PAYMENT_STATUSES,
  isReviewablePaymentStatus,
  recalculateOrderPaymentAccounting,
} from './payment.service.js';

/**
 * Admin platform statistics (PRD §11): customer/order totals, verified vs
 * pending revenue, a 12-month series, popular services, founder workload.
 * Scale here is two founders — grouping in JS over indexed queries is the
 * right amount of engineering.
 */

const ACTIVE_STATUSES: OrderStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'IN_PROGRESS', 'QUALITY_REVIEW'];
const COMPLETED_STATUSES: OrderStatus[] = ['COMPLETED', 'DELIVERED'];
const PENDING_STATUSES: OrderStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export async function getStats(): Promise<AdminStatsDto> {
  const month12Start = new Date();
  month12Start.setUTCMonth(month12Start.getUTCMonth() - 11);
  month12Start.setUTCDate(1);
  month12Start.setUTCHours(0, 0, 0, 0);

  const [
    customers,
    ordersByStatus,
    verifiedPayments,
    pendingPayments,
    monthlyOrders,
    orderItems,
    founderProfiles,
    founderOrders,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.findMany({
      where: { status: 'VERIFIED' },
      select: { amount: true, verifiedAt: true, createdAt: true },
    }),
    prisma.payment.aggregate({ where: { status: { in: ['PENDING', 'SUBMITTED'] } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: month12Start } },
      select: { id: true, createdAt: true, totalAmount: true },
    }),
    prisma.orderItem.groupBy({ by: ['serviceName'], _count: { _all: true }, orderBy: { _count: { serviceName: 'desc' } }, take: 6 }),
    prisma.founderProfile.findMany({ orderBy: { displayOrder: 'asc' }, select: { id: true, userId: true, displayName: true } }),
    prisma.order.findMany({
      where: { assignedFounderId: { not: null } },
      select: { assignedFounderId: true, status: true },
    }),
  ]);

  const statusCount = (statuses: OrderStatus[]) =>
    ordersByStatus
      .filter((g) => statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0);
  const totalOrders = ordersByStatus.reduce((sum, g) => sum + g._count._all, 0);

  // Monthly series: verified revenue by payment month + orders created that month
  const months: Array<{ month: string; revenue: string; orders: number }> = [];
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  for (let i = 0; i < 12; i++) {
    const d = new Date(month12Start);
    d.setUTCMonth(month12Start.getUTCMonth() + i);
    months.push({ month: monthKey(d), revenue: '0', orders: 0 });
  }
  const revenueByMonth = new Map<string, number>(months.map((m) => [m.month, 0]));
  let verifiedTotal = 0;
  for (const p of verifiedPayments) {
    const cents = Math.round(Number(p.amount.toString()) * 100);
    verifiedTotal += cents;
    const at = p.verifiedAt ?? p.createdAt;
    const key = monthKey(at);
    if (revenueByMonth.has(key)) revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + cents);
  }
  for (const o of monthlyOrders) {
    const key = monthKey(o.createdAt);
    const bucket = months.find((m) => m.month === key);
    if (bucket) bucket.orders += 1;
  }
  for (const m of months) m.revenue = ((revenueByMonth.get(m.month) ?? 0) / 100).toFixed(2);

  const workload = founderProfiles.map((f) => {
    const orders = founderOrders.filter((o) => o.assignedFounderId === f.userId);
    return {
      id: f.id,
      displayName: f.displayName,
      active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
      completed: orders.filter((o) => COMPLETED_STATUSES.includes(o.status)).length,
    };
  });

  return {
    customers,
    orders: {
      total: totalOrders,
      pending: statusCount(PENDING_STATUSES),
      active: statusCount(ACTIVE_STATUSES),
      completed: statusCount(COMPLETED_STATUSES),
    },
    revenue: {
      verified: (verifiedTotal / 100).toFixed(2),
      pending: (pendingPayments._sum.amount?.toString() ?? '0.00'),
    },
    pendingPayments: pendingPayments._count._all,
    monthly: months,
    popularServices: orderItems.map((s) => ({ name: s.serviceName, orders: s._count._all })),
    founderWorkload: workload,
  };
}

// ─── Orders ──────────────────────────────────────────────────

export type AdminOrderFilters = {
  status?: string;
  founderUserId?: string;
  search?: string;
  page: number;
  pageSize: number;
};

export async function listOrders(filters: AdminOrderFilters) {
  const where = {
    ...(filters.status ? { status: filters.status.toUpperCase() as never } : {}),
    ...(filters.founderUserId
      ? { OR: [{ assignedFounderId: filters.founderUserId }, { preferredFounderId: filters.founderUserId }] }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { orderNumber: { contains: filters.search, mode: 'insensitive' as const } },
            { title: { contains: filters.search, mode: 'insensitive' as const } },
            { customer: { OR: [{ fullName: { contains: filters.search, mode: 'insensitive' as const } }, { email: { contains: filters.search, mode: 'insensitive' as const } }] } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { customer: { select: { id: true, fullName: true, email: true } }, items: { select: { id: true } }, payments: { select: { status: true } } },
    }),
  ]);
  return { total, rows };
}

/** Validate + apply an admin status change with timestamp side-effects. */
export async function changeOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  note: string | undefined,
  actorId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('Order not found');
  assertTransition(order.status, toStatus);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: toStatus,
      ...(toStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(toStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(toStatus === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: note ?? null } : {}),
      statusHistory: {
        create: { fromStatus: order.status, toStatus, changedById: actorId, note: note ?? null },
      },
    },
  });
  return updated;
}

/** Reassign (or clear) the founder leading an order. */
export async function assignOrder(orderId: string, assignedFounderUserId: string | null) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('Order not found');

  if (assignedFounderUserId) {
    const founder = await prisma.user.findFirst({
      where: { id: assignedFounderUserId, role: 'ADMIN', founderProfile: { isNot: null } },
      select: { id: true },
    });
    if (!founder) throw ApiError.badRequest('Target founder is not an admin with a founder profile', 'INVALID_FOUNDER');
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      assignedFounderId: assignedFounderUserId,
      // an admin reassignment overrides whatever the customer preferred
      ...(assignedFounderUserId ? { preferenceSource: 'ADMIN_OVERRIDE' as const } : {}),
    },
  });
}

// ─── Payments ────────────────────────────────────────────────

export type PaymentQueueQuery = {
  page: number;
  pageSize: number;
  status?: string;
  method?: string;
  search?: string;
  from?: string;
  to?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Queue bounds arrive as `YYYY-MM-DD` (interpreted as whole UTC days — the
 * UI sends date-only inputs) or full ISO datetimes (used as-is). Validated
 * by the route schema; this only normalizes.
 */
function resolveDateBound(value: string, bound: 'from' | 'to'): Date {
  if (DATE_ONLY_RE.test(value)) {
    return new Date(`${value}T${bound === 'from' ? '00:00:00.000' : '23:59:59.999'}Z`);
  }
  return new Date(value);
}

/**
 * Admin payment queue (Stage 6): server-side pagination + validated
 * filters. Ordering is `status asc` (Postgres enum order = PENDING,
 * SUBMITTED, VERIFIED, REJECTED, REFUNDED) then `createdAt asc` — reviewable
 * work first, oldest unreviewed submissions at the top, stable under
 * pagination. Terminal records stay reachable through filters.
 *
 * Method filter: known `PaymentMethod` enum values match the column;
 * anything else (custom rails like UPAY) matches the immutable
 * `methodKeySnapshot` that v2 submissions store.
 */
export async function listPayments(q: PaymentQueueQuery): Promise<{ total: number; rows: Array<Prisma.PaymentGetPayload<{ include: typeof PAYMENT_QUEUE_INCLUDE }>> }> {
  const where: Prisma.PaymentWhereInput = {};

  if (q.status) where.status = q.status as PaymentStatus;
  if (q.method) {
    if ((PAYMENT_METHODS as readonly string[]).includes(q.method)) {
      where.method = q.method as PaymentMethod;
    } else {
      where.methodKeySnapshot = q.method.toUpperCase();
    }
  }
  if (q.search) {
    const s = q.search;
    const or: Prisma.PaymentWhereInput[] = [
      { transactionId: { contains: s, mode: 'insensitive' } },
      // Normalized TrxIDs are stored uppercased — compare in the same form.
      { transactionIdNormalized: { contains: s.toUpperCase() } },
      { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
      { order: { customer: { fullName: { contains: s, mode: 'insensitive' } } } },
      { order: { customer: { email: { contains: s, mode: 'insensitive' } } } },
    ];
    if (UUID_RE.test(s)) or.push({ id: s });
    where.OR = or;
  }
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: resolveDateBound(q.from, 'from') } : {}),
      ...(q.to ? { lte: resolveDateBound(q.to, 'to') } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: PAYMENT_QUEUE_INCLUDE,
    }),
    prisma.payment.count({ where }),
  ]);
  return { total, rows };
}

/** Relations the queue DTO needs — selected, never a raw Prisma dump. */
const PAYMENT_QUEUE_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      title: true,
      totalAmount: true,
      amountPaid: true,
      customer: { select: { fullName: true, email: true } },
    },
  },
  verifiedBy: { select: { fullName: true } },
  rejectedBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;

/** Per-status counts for the dashboard summary cards (Stage 6). */
export async function getPaymentQueueStats(): Promise<AdminPaymentStatsDto> {
  const [groupBy, awaiting] = await Promise.all([
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({
      where: { status: { in: ['PENDING', 'SUBMITTED'] } },
      _sum: { amount: true },
    }),
  ]);

  const counts: AdminPaymentStatsDto['counts'] = {
    PENDING: 0,
    SUBMITTED: 0,
    VERIFIED: 0,
    REJECTED: 0,
    REFUNDED: 0,
  };
  let total = 0;
  for (const row of groupBy) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  return {
    counts,
    total,
    awaitingAmount: awaiting._sum.amount?.toFixed(2) ?? '0.00',
  };
}

/**
 * Short-lived signed URL for one payment's screenshot (Stage 6). The public
 * id is loaded from the authorized payment row — the client never supplies
 * a signing target. The namespace check is defense-in-depth: v2 submission
 * already rejects foreign namespaces at upload time.
 */
export async function getPaymentScreenshotUrl(paymentId: string): Promise<{ screenshotUrl: string | null }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { screenshotPublicId: true },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (!payment.screenshotPublicId) return { screenshotUrl: null };
  if (!payment.screenshotPublicId.startsWith(PAYMENTS_UPLOAD_ROOT)) {
    throw ApiError.badRequest('The stored screenshot reference is outside the payments namespace');
  }
  return { screenshotUrl: signedDownloadUrl(payment.screenshotPublicId, 'image') };
}

function paymentNotReviewable(status: PaymentStatus): ApiError {
  return new ApiError(
    409,
    PAYMENT_ERROR_CODES.PAYMENT_NOT_REVIEWABLE,
    'This payment has already been reviewed. Refresh the queue and try again.',
    { status },
  );
}

/**
 * Verify or reject a submitted payment.
 *
 * The database decides the winner, never application timing. The conditional
 * `updateMany` matches the payment id *and* a currently reviewable status, so
 * two concurrent admins can never both transition the same row. The initial
 * read only supplies the order id / previous status for accounting and audit;
 * it is not the gate. A losing transaction gets zero rows updated and throws
 * PAYMENT_NOT_REVIEWABLE before any side effect can run.
 *
 * Verification recalculates the order's amountPaid/paymentStatus inside the
 * same transaction as the status change. Rejection never touches accounting.
 */
export async function reviewPayment(
  paymentId: string,
  decision: 'VERIFIED' | 'REJECTED',
  note: string | undefined,
  actorId: string,
) {
  const rejectionReason = note?.trim();
  if (decision === 'REJECTED' && (!rejectionReason || rejectionReason.length < 5)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'A rejection reason is required (at least 5 characters)');
  }

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, orderId: true, status: true, method: true, amount: true },
      });
      if (!existing) throw ApiError.notFound('Payment not found');
      if (!isReviewablePaymentStatus(existing.status)) {
        throw paymentNotReviewable(existing.status);
      }

      const now = new Date();
      const data: Prisma.PaymentUncheckedUpdateManyInput =
        decision === 'VERIFIED'
          ? {
              status: 'VERIFIED',
              verifiedById: actorId,
              verifiedAt: now,
              adminNote: note?.trim() || null,
              rejectedById: null,
              rejectedAt: null,
              rejectionReason: null,
            }
          : {
              status: 'REJECTED',
              rejectedById: actorId,
              rejectedAt: now,
              rejectionReason: rejectionReason!,
              // Legacy customer-facing field; rejectionReason is the durable
              // audit column. Both carry the customer-facing reason.
              adminNote: rejectionReason!,
              verifiedById: null,
              verifiedAt: null,
            };

      const transition = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: { in: [...REVIEWABLE_PAYMENT_STATUSES] },
        },
        data,
      });
      if (transition.count !== 1) throw paymentNotReviewable(existing.status);

      const accounting =
        decision === 'VERIFIED'
          ? await recalculateOrderPaymentAccounting(tx, existing.orderId)
          : null;

      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: existing.orderId },
        select: {
          id: true,
          orderNumber: true,
          title: true,
          customerId: true,
          totalAmount: true,
          amountPaid: true,
          paymentStatus: true,
          customer: { select: { id: true, email: true, fullName: true } },
        },
      });

      return { payment, order, previousStatus: existing.status, accounting };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

// ─── Deliverables ────────────────────────────────────────────

export async function addDeliverable(
  orderId: string,
  input: {
    title: string;
    description?: string;
    cloudinaryPublicId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
  uploaderId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('Order not found');
  const last = await prisma.deliverable.findFirst({
    where: { orderId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return prisma.deliverable.create({
    data: {
      orderId,
      uploadedById: uploaderId,
      title: input.title,
      description: input.description ?? null,
      cloudinaryPublicId: input.cloudinaryPublicId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      version: (last?.version ?? 0) + 1,
    },
  });
}

// ─── Directories ─────────────────────────────────────────────

export async function listCustomers(page: number, pageSize: number, search?: string) {
  const where = {
    role: 'CUSTOMER' as const,
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, fullName: true, email: true, accountStatus: true, createdAt: true, _count: { select: { orders: true } } },
    }),
  ]);
  return { total, rows };
}

export async function listFoundersWithWorkload() {
  const profiles = await prisma.founderProfile.findMany({
    orderBy: { displayOrder: 'asc' },
    include: { user: { select: { id: true, fullName: true, email: true, accountStatus: true } } },
  });
  const orders = await prisma.order.findMany({
    where: { assignedFounderId: { not: null } },
    select: { assignedFounderId: true, status: true },
  });
  return profiles.map((p) => {
    const mine = orders.filter((o) => o.assignedFounderId === p.userId);
    return {
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      title: p.title,
      email: p.user.email,
      isSelectable: p.isSelectable,
      discipline: p.discipline,
      active: mine.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
      completed: mine.filter((o) => COMPLETED_STATUSES.includes(o.status)).length,
    };
  });
}
