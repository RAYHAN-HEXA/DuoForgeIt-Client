import type { Request, Response, NextFunction } from 'express';
import type { OrderStatus } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';
import { hasCloudinary } from '../config/env.js';
import { assertUploadAllowed, signedDownloadUrl } from '../utils/cloudinary.js';
import { toAdminOrderDto, toAdminPaymentDto } from '../utils/mappers.js';
import { getAnyOrder } from '../services/order.service.js';
import { notifyUser } from '../services/notification.service.js';
import { audit } from '../utils/audit.js';
import * as admin from '../services/admin.service.js';

/** All request validation happens in routes/index.ts — these are the shapes. */
type IdParams = { id: string };
const paramId = (req: Request) => validated<IdParams>(req, 'params').id;

/** GET /api/admin/stats — overview + analytics series. */
export async function stats(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await admin.getStats()));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/orders — moderation queue with filters. */
export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const q = validated<{ status?: string; founderId?: string; search?: string; page: number; pageSize: number }>(req, 'query');
    const { total, rows } = await admin.listOrders(q);
    res.json(
      ok({
        items: rows.map((r) => ({
          id: r.id,
          orderNumber: r.orderNumber,
          status: r.status,
          title: r.title,
          customerName: r.customer.fullName,
          customerEmail: r.customer.email,
          itemCount: r.items.length,
          totalAmount: r.totalAmount.toString(),
          paymentStatus: r.payments.some((p) => p.status === 'REJECTED')
            ? 'REJECTED'
            : r.payments.some((p) => p.status === 'VERIFIED')
              ? 'VERIFIED'
              : r.payments.some((p) => p.status === 'SUBMITTED' || p.status === 'PENDING')
                ? 'SUBMITTED'
                : null,
          createdAt: r.createdAt.toISOString(),
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/orders/:id — full admin detail (customer + signed URLs). */
export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await getAnyOrder(paramId(req));
    const urls: { attachments?: Map<string, string | null>; deliverables?: Map<string, string | null> } = {};
    if (hasCloudinary) {
      urls.attachments = new Map(order.attachments.map((a) => [a.id, signedDownloadUrl(a.cloudinaryPublicId, 'auto')]));
      urls.deliverables = new Map(order.deliverables.map((d) => [d.id, signedDownloadUrl(d.cloudinaryPublicId, 'auto')]));
    }
    res.json(ok(toAdminOrderDto(order, urls)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/orders/:id/status — transition + history + audit + notification. */
export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = paramId(req);
    const body = validated<{ status: OrderStatus; note?: string }>(req, 'body');
    const updated = await admin.changeOrderStatus(orderId, body.status, body.note, req.authUser!.id);

    await audit({
      actorId: req.authUser!.id,
      action: 'ORDER.STATUS_UPDATE',
      entityType: 'Order',
      entityId: orderId,
      metadata: { from: updated.status, to: body.status, note: body.note ?? null },
      ip: req.ip,
    });
    await notifyUser({
      userId: updated.customerId,
      type: 'ORDER_STATUS',
      title: `Order ${updated.orderNumber}: ${body.status.replaceAll('_', ' ').toLowerCase()}`,
      body: body.note ?? 'Your order status has been updated.',
      link: `/orders/${orderId}`,
    });
    res.json(ok({ id: updated.id, status: updated.status }));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/orders/:id/assignment — reassign the founder on an order. */
export async function assignOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = paramId(req);
    const body = validated<{ assignedFounderId: string | null }>(req, 'body');
    const updated = await admin.assignOrder(orderId, body.assignedFounderId);
    await audit({
      actorId: req.authUser!.id,
      action: 'ORDER.ASSIGN_FOUNDER',
      entityType: 'Order',
      entityId: orderId,
      metadata: { assignedFounderId: body.assignedFounderId },
      ip: req.ip,
    });
    if (updated.assignedFounderId) {
      await notifyUser({
        userId: updated.customerId,
        type: 'ORDER_STATUS',
        title: 'Project lead assigned',
        body: 'A founder has been assigned to your project.',
        link: `/orders/${orderId}`,
      });
    }
    res.json(ok({ id: updated.id, assignedFounderId: updated.assignedFounderId }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/payments — verification queue. */
export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = validated<{ status?: string }>(req, 'query');
    const rows = await admin.listPayments(status);
    res.json(ok({ items: rows.map(toAdminPaymentDto) }));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/payments/:id — verify or reject with an audit trail. */
export async function reviewPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const paymentId = paramId(req);
    const body = validated<{ decision: 'VERIFIED' | 'REJECTED'; note?: string }>(req, 'body');
    const { payment, order } = await admin.reviewPayment(paymentId, body.decision, body.note, req.authUser!.id);

    await audit({
      actorId: req.authUser!.id,
      action: 'PAYMENT.VERIFY',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: { decision: body.decision, method: payment.method, amount: payment.amount.toString() },
      ip: req.ip,
    });
    await notifyUser({
      userId: order.customerId,
      type: 'PAYMENT',
      title: body.decision === 'VERIFIED' ? 'Payment verified' : 'Payment could not be verified',
      body:
        body.decision === 'VERIFIED'
          ? `Your payment for order ${order.orderNumber} is confirmed.`
          : (body.note ?? 'We could not verify your transaction — please check the ID and resubmit.'),
      link: `/orders/${order.id}`,
    });
    res.json(ok({ id: payment.id, status: payment.status }));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/orders/:id/deliverables — register an uploaded deliverable + notify. */
export async function addDeliverable(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = paramId(req);
    const body = validated<{
    title: string;
    description?: string;
    cloudinaryPublicId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>(req, 'body');
    assertUploadAllowed(body.mimeType, body.sizeBytes);
    const deliverable = await admin.addDeliverable(orderId, body, req.authUser!.id);

    const order = await getAnyOrder(orderId);
    await audit({
      actorId: req.authUser!.id,
      action: 'ORDER.DELIVERABLE_UPLOAD',
      entityType: 'Deliverable',
      entityId: deliverable.id,
      metadata: { orderId, version: deliverable.version },
      ip: req.ip,
    });
    await notifyUser({
      userId: order.customerId,
      type: 'DELIVERABLE',
      title: 'New deliverable available',
      body: `“${deliverable.title}” was added to order ${order.orderNumber}.`,
      link: `/orders/${orderId}`,
    });
    res.status(201).json(ok({ id: deliverable.id, version: deliverable.version }));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/revisions/:id — respond to a customer revision request. */
export async function respondRevision(req: Request, res: Response, next: NextFunction) {
  try {
    const revisionId = paramId(req);
    const body = validated<{ status: 'IN_PROGRESS' | 'RESOLVED' | 'DECLINED'; adminResponse?: string }>(req, 'body');
    const revision = await prisma.revisionRequest.update({
      where: { id: revisionId },
      data: {
        status: body.status,
        adminResponse: body.adminResponse ?? null,
        ...(body.status === 'RESOLVED' || body.status === 'DECLINED' ? { resolvedAt: new Date() } : {}),
      },
    });
    await audit({
      actorId: req.authUser!.id,
      action: 'REVISION.RESPOND',
      entityType: 'RevisionRequest',
      entityId: revisionId,
      metadata: { status: body.status },
      ip: req.ip,
    });
    await notifyUser({
      userId: revision.customerId,
      type: 'REVISION',
      title: `Revision ${body.status.toLowerCase()}`,
      body: body.adminResponse ?? 'Your revision request has an update.',
      link: `/orders/${revision.orderId}`,
    });
    res.json(ok({ id: revision.id, status: revision.status }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/customers */
export async function listCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = validated<{ page: number; pageSize: number; search?: string }>(req, 'query');
    const { total, rows } = await admin.listCustomers(q.page, q.pageSize, q.search);
    res.json(
      ok({
        items: rows.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          accountStatus: u.accountStatus,
          orderCount: u._count.orders,
          createdAt: u.createdAt.toISOString(),
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/founders — profiles + live workload. */
export async function listFounders(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok({ items: await admin.listFoundersWithWorkload() }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/messages — contact form inbox. */
export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = validated<{ page: number }>(req, 'query');
    const pageSize = 20;
    const [total, rows] = await Promise.all([
      prisma.contactMessage.count(),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json(
      ok({
        items: rows.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          subject: m.subject,
          message: m.message,
          isRead: m.isRead,
          createdAt: m.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/messages/:id — mark read. */
export async function markMessageRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { isRead: true },
    });
    res.json(ok({ id: updated.id, isRead: updated.isRead }));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/reviews/:id — curate which reviews become public testimonials. */
export async function curateReview(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const body = validated<{ isPublic: boolean }>(req, 'body');
    const updated = await prisma.review.update({
      where: { id },
      data: { isPublic: body.isPublic },
    });
    res.json(ok({ id: updated.id, isPublic: updated.isPublic }));
  } catch (err) {
    next(err);
  }
}



/** GET /api/admin/site-content — editable homepage blocks. */
export async function getSiteContent(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.siteContent.findMany();
    res.json(ok(Object.fromEntries(rows.map((r) => [r.key, r.value]))));
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/site-content — upsert one editable content block. */
export async function putSiteContent(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<{ key: string; value: unknown }>(req, 'body');
    const row = await prisma.siteContent.upsert({
      where: { key: body.key },
      update: { value: body.value as never },
      create: { key: body.key, value: body.value as never },
    });
    await audit({
      actorId: req.authUser!.id,
      action: 'SITE_CONTENT.UPDATE',
      entityType: 'SiteContent',
      entityId: row.id,
      metadata: { key: body.key },
      ip: req.ip,
    });
    res.json(ok({ key: row.key }));
  } catch (err) {
    next(err);
  }
}
