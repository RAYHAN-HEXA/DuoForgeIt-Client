import type { AdminStatsDto, OrderStatus, PaymentStatus } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { assertTransition } from './order.service.js';

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

export async function listPayments(status?: string) {
  return prisma.payment.findMany({
    where: status ? { status: status.toUpperCase() as PaymentStatus } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { id: true, orderNumber: true, title: true, customer: { select: { fullName: true } } } } },
  });
}

/**
 * Verify or reject a submitted payment. The payment record — never the
 * frontend — is the source of truth; verification writes the verifier and
 * timestamp and notifies the customer.
 */
export async function reviewPayment(
  paymentId: string,
  decision: 'VERIFIED' | 'REJECTED',
  note: string | undefined,
  actorId: string,
) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === 'VERIFIED') throw ApiError.conflict('Payment already verified');
  if (payment.status === 'REFUNDED') throw ApiError.conflict('Payment was refunded');

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: decision,
      adminNote: note ?? null,
      verifiedById: decision === 'VERIFIED' ? actorId : null,
      verifiedAt: decision === 'VERIFIED' ? new Date() : null,
    },
  });
  return { payment: updated, order: payment.order };
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
