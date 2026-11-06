import type { Request, Response, NextFunction } from 'express';
import { formatBDT, type OrderStatus } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';
import { hasBlobStorage } from '../config/env.js';
import { assertOwnedPathname, assertStoredBlob, assertUploadAllowed, createUploadTicket, signedDownloadUrl } from '../utils/blob.js';
import { toAdminOrderDto, toAdminPaymentAccountDto, toAdminPaymentDto } from '../utils/mappers.js';
import { getAnyOrder } from '../services/order.service.js';
import { notifyUser } from '../services/notification.service.js';
import { emailShell, sendCustomerEmail } from '../services/mail.service.js';
import { audit } from '../utils/audit.js';
import * as admin from '../services/admin.service.js';
import * as paymentAccounts from '../services/paymentAccount.service.js';

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
    if (hasBlobStorage) {
      const attachmentEntries: [string, string | null][] = [];
      for (const a of order.attachments) {
        // Legacy rows reference Cloudinary assets that were never copied to
        // Blob — null URL until the one-shot migration backfills blobPath.
        attachmentEntries.push([a.id, a.blobPath ? await signedDownloadUrl(a.blobPath) : null]);
      }
      urls.attachments = new Map(attachmentEntries);

      const deliverableEntries: [string, string | null][] = [];
      for (const d of order.deliverables) {
        deliverableEntries.push([d.id, d.blobPath ? await signedDownloadUrl(d.blobPath) : null]);
      }
      urls.deliverables = new Map(deliverableEntries);
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

/** GET /api/admin/payments — paginated verification queue with filters (Stage 6). */
export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const q = validated<{
      page: number;
      pageSize: number;
      status?: string;
      method?: string;
      search?: string;
      from?: string;
      to?: string;
    }>(req, 'query');
    const { total, rows } = await admin.listPayments(q);
    res.json(
      ok({
        items: rows.map(toAdminPaymentDto),
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/payments/stats — per-status counts for the dashboard cards. */
export async function paymentStats(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await admin.getPaymentQueueStats()));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/payments/:id/screenshot — short-lived signed URL minted from
 * the public id stored on the payment row. The client never supplies a
 * signing target; null means no screenshot was submitted.
 */
export async function paymentScreenshot(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await admin.getPaymentScreenshotUrl(paramId(req))));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/payments/:id — verify or reject with an audit trail. */
export async function reviewPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const paymentId = paramId(req);
    const body = validated<{ decision: 'VERIFIED' | 'REJECTED'; note?: string }>(req, 'body');
    const { payment, order, previousStatus } = await admin.reviewPayment(
      paymentId,
      body.decision,
      body.note,
      req.authUser!.id,
    );

    // Everything below runs only after the database transaction committed.
    // A losing concurrent review threw above and never reaches this block.
    const rejected = body.decision === 'REJECTED';
    const reason = payment.rejectionReason ?? body.note?.trim() ?? null;

    await audit({
      actorId: req.authUser!.id,
      action: rejected ? 'PAYMENT.REJECT' : 'PAYMENT.VERIFY',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: {
        from: previousStatus,
        to: payment.status,
        adminId: req.authUser!.id,
        method: payment.method,
        amount: payment.amount.toFixed(2),
        ...(rejected ? { rejectionReason: reason } : {}),
      },
      ip: req.ip,
    });

    await notifyUser({
      userId: order.customerId,
      type: 'PAYMENT',
      title: rejected ? 'Payment could not be verified' : 'Payment verified',
      body: rejected
        ? (reason ?? 'We could not verify your transaction — please check the ID and resubmit.')
        : `Your payment of ${formatBDT(payment.amount.toFixed(2))} for order ${order.orderNumber} is confirmed.`,
      link: `/orders/${order.id}`,
    });

    // Customer email is best-effort and post-commit. A mail failure is
    // logged inside the mail service and never affects this response.
    await sendCustomerEmail(
      order.customer.email,
      rejected ? `Payment not verified — ${order.orderNumber}` : `Payment verified — ${order.orderNumber}`,
      emailShell(
        rejected ? 'We could not verify your payment' : 'Payment verified',
        [
          ['Order', `${order.orderNumber} · ${order.title}`],
          ['Amount', formatBDT(payment.amount.toFixed(2))],
          ['Status', rejected ? 'Rejected' : 'Verified'],
          ...(rejected && reason ? ([['Reason', reason]] as Array<[string, string]>) : []),
        ],
      ),
    );

    res.json(ok({ id: payment.id, status: payment.status }));
  } catch (err) {
    next(err);
  }
}

// ─── Payment accounts (manual-payments v2, Stage 4) ──────────

/** GET /api/admin/payment-accounts — active AND inactive receiving accounts. */
export async function listPaymentAccounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await paymentAccounts.listPaymentAccounts();
    res.json(ok({ items: await Promise.all(rows.map(toAdminPaymentAccountDto)) }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/payment-accounts/:id — single management view. */
export async function getPaymentAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const account = await paymentAccounts.getPaymentAccount(paramId(req));
    res.json(ok(await toAdminPaymentAccountDto(account)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/payment-accounts — create a receiving account. */
export async function createPaymentAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<paymentAccounts.CreatePaymentAccountInput>(req, 'body');
    const account = await paymentAccounts.createPaymentAccount(body, req.authUser!.id);

    await audit({
      actorId: req.authUser!.id,
      action: 'PAYMENT_ACCOUNT.CREATE',
      entityType: 'PaymentAccount',
      entityId: account.id,
      metadata: {
        methodKey: account.methodKey,
        label: account.label,
        isActive: account.isActive,
        displayOrder: account.displayOrder,
      },
      ip: req.ip,
    });

    res.status(201).json(ok(await toAdminPaymentAccountDto(account)));
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/payment-accounts/:id — edit configuration. Editing never
 * touches Payment snapshots or orders.
 */
export async function updatePaymentAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const body = validated<paymentAccounts.UpdatePaymentAccountInput>(req, 'body');
    const { account, previous, changedFields } = await paymentAccounts.updatePaymentAccount(
      id,
      body,
      req.authUser!.id,
    );

    const onlyStatusChanged = changedFields.length === 1 && changedFields[0] === 'isActive';
    const action = onlyStatusChanged
      ? account.isActive
        ? 'PAYMENT_ACCOUNT.ACTIVATE'
        : 'PAYMENT_ACCOUNT.DEACTIVATE'
      : 'PAYMENT_ACCOUNT.UPDATE';

    await audit({
      actorId: req.authUser!.id,
      action,
      entityType: 'PaymentAccount',
      entityId: account.id,
      metadata: {
        changedFields,
        fromActive: previous.isActive,
        toActive: account.isActive,
        ...(changedFields.includes('qrPathname')
          ? { qrChanged: true, hasQr: Boolean(account.blobPath || account.qrPublicId) }
          : {}),
      },
      ip: req.ip,
    });

    res.json(ok(await toAdminPaymentAccountDto(account)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/payment-accounts/:id/status — explicit activate/deactivate. */
export async function setPaymentAccountStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const body = validated<{ isActive: boolean }>(req, 'body');
    const { account, previous, changed } = await paymentAccounts.setPaymentAccountStatus(
      id,
      body.isActive,
      req.authUser!.id,
    );

    if (changed) {
      await audit({
        actorId: req.authUser!.id,
        action: body.isActive ? 'PAYMENT_ACCOUNT.ACTIVATE' : 'PAYMENT_ACCOUNT.DEACTIVATE',
        entityType: 'PaymentAccount',
        entityId: account.id,
        metadata: { fromActive: previous.isActive, toActive: account.isActive, label: account.label },
        ip: req.ip,
      });
    }

    res.json(ok(await toAdminPaymentAccountDto(account)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/payment-accounts/reorder — transactional display order. */
export async function reorderPaymentAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<{ items: Array<{ id: string; displayOrder: number }> }>(req, 'body');
    const rows = await paymentAccounts.reorderPaymentAccounts(body.items, req.authUser!.id);

    await audit({
      actorId: req.authUser!.id,
      action: 'PAYMENT_ACCOUNT.REORDER',
      entityType: 'PaymentAccount',
      entityId: 'batch',
      metadata: { items: body.items },
      ip: req.ip,
    });

    res.json(ok({ items: await Promise.all(rows.map(toAdminPaymentAccountDto)) }));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/payment-accounts/:id — only unreferenced accounts.
 * Referenced accounts return 409 ACCOUNT_IN_USE; deactivate instead.
 */
export async function deletePaymentAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const account = await paymentAccounts.deletePaymentAccount(paramId(req));

    await audit({
      actorId: req.authUser!.id,
      action: 'PAYMENT_ACCOUNT.DELETE',
      entityType: 'PaymentAccount',
      entityId: account.id,
      metadata: {
        methodKey: account.methodKey,
        label: account.label,
        displayOrder: account.displayOrder,
        wasActive: account.isActive,
        usageCount: 0,
      },
      ip: req.ip,
    });

    res.json(ok({ id: account.id, deleted: true }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/payment-accounts/qr/sign — admin-only upload ticket for a
 * receiving-account QR image. The pathname is minted server-side in the
 * dedicated per-admin namespace; the read-write token never leaves the server.
 */
export async function signPaymentAccountQr(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<{ fileName: string; mimeType: string; sizeBytes: number }>(req, 'body');
    const ticket = await createUploadTicket('paymentAccounts', {
      userId: req.authUser!.id,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    res.json(ok(ticket));
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
    pathname: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>(req, 'body');
    assertUploadAllowed(body.mimeType, body.sizeBytes);
    assertOwnedPathname(body.pathname, 'deliveries', req.authUser!.id, 'deliverable');
    await assertStoredBlob(body.pathname, { contentType: body.mimeType, sizeBytes: body.sizeBytes });
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
