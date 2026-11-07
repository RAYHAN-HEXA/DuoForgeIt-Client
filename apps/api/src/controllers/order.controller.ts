import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { checkoutSchema, paymentSubmitSchema } from '@tsh/shared';
import { REVISION_ALLOWED, formatBDT } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import { validated } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';
import { env, hasBlobStorage } from '../config/env.js';
import { assertOwnedPathname, assertStoredBlob, assertUploadAllowed, signedDownloadUrl } from '../utils/blob.js';
import { toOrderDto, toOrderSummaryDto } from '../utils/mappers.js';
import { checkout, customerCancel, getOwnOrder } from '../services/order.service.js';
import { createLegacyPaymentSubmission } from '../services/payment.service.js';
import { clearServices } from '../services/cart.service.js';
import { notifyUser } from '../services/notification.service.js';
import { emailShell, notifyFounders, sendCustomerEmail } from '../services/mail.service.js';
import { audit } from '../utils/audit.js';

/**
 * POST /api/orders — checkout.
 * Creates the order inside a transaction (items + option snapshots + initial
 * history + staged-attachment claim), guarded by the idempotency key.
 */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<z.infer<typeof checkoutSchema>>(req, 'body');
    const { orderId, replayed } = await checkout({
      customerId: req.authUser!.id,
      idempotencyKey: body.idempotencyKey,
      items: body.items,
      deadline: body.deadline,
      founderPreference: body.founderPreference,
      notes: body.notes,
      attachmentIds: body.attachmentIds,
    });

    if (!replayed) {
      await clearServices(req.authUser!.id, [...new Set(body.items.map((i) => i.serviceId))]);
      await notifyUser({
        userId: req.authUser!.id,
        type: 'ORDER_STATUS',
        title: 'Order submitted',
        body: 'We received your order and will review it shortly.',
        link: `/orders/${orderId}`,
      });
    }

    const order = await getOwnOrder(req.authUser!.id, orderId);

    // Founder alert — a fresh order needs eyes in the admin console. Best-effort.
    if (!replayed) {
      const adminBase = env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app';
      await notifyFounders(
        `🛒 New order ${order.orderNumber} — ${formatBDT(order.totalAmount.toString())}`,
        emailShell(
          'New order received',
          [
            ['Order', order.orderNumber],
            ['Service', order.items.map((i) => `${i.serviceName} × ${i.quantity}`).join(', ')],
            ['Total', formatBDT(order.totalAmount.toString())],
            ['Deadline', new Date(order.deadline).toLocaleDateString('en-GB')],
            ['Customer', `${req.authUser!.fullName} (${req.authUser!.email})`],
            ['Founder preference', body.founderPreference ?? 'AUTO_ASSIGN'],
          ],
          'Open in admin console',
          `${adminBase}/admin/orders/${orderId}`,
        ),
      );

      // Customer confirmation — best-effort, post-commit, never rolls back.
      await sendCustomerEmail(
        req.authUser!.email,
        `Order received — ${order.orderNumber}`,
        emailShell(
          'We received your order',
          [
            ['Order', order.orderNumber],
            ['Service', order.items.map((i) => `${i.serviceName} × ${i.quantity}`).join(', ')],
            ['Total', formatBDT(order.totalAmount.toString())],
            ['Deadline', new Date(order.deadline).toLocaleDateString('en-GB')],
          ],
          'Track your order',
          `${adminBase}/orders/${orderId}`,
        ),
      );
    }

    res.status(201).json(ok({ order: toOrderDto(order), replayed }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/orders — the customer's own orders (summary view). */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = validated<{ status?: string; page: number; pageSize: number }>(req, 'query');
    const where = {
      customerId: req.authUser!.id,
      ...(q.status ? { status: q.status.toUpperCase() as never } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { items: { select: { id: true } }, payments: { select: { status: true } } },
      }),
    ]);
    res.json(ok({ items: rows.map(toOrderSummaryDto), page: q.page, pageSize: q.pageSize, total }));
  } catch (err) {
    next(err);
  }
}

/** Mint download URLs when Blob storage is configured; empty otherwise. */
async function mintUrls(order: {
  attachments: Array<{ id: string; blobPath: string | null; mimeType: string }>;
  deliverables: Array<{ id: string; blobPath: string | null }>;
}) {
  if (!hasBlobStorage) return {};
  const attachments = new Map<string, string | null>();
  for (const a of order.attachments) {
    // Legacy rows reference Cloudinary assets that were never copied to
    // Blob — they get a null URL (admin UI shows "not yet migrated") rather
    // than a dead link.
    attachments.set(a.id, a.blobPath ? await signedDownloadUrl(a.blobPath) : null);
  }
  const deliverables = new Map<string, string | null>();
  for (const d of order.deliverables) {
    deliverables.set(d.id, d.blobPath ? await signedDownloadUrl(d.blobPath) : null);
  }
  return { attachments, deliverables };
}


/** GET /api/orders/:id — full detail for the owning customer. */
export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const order = await getOwnOrder(req.authUser!.id, orderId);
    res.json(ok(toOrderDto(order, await mintUrls(order))));
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/cancel — customer-initiated cancel (pre-work only). */
export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const reason = z.string().trim().min(5).max(500).parse(req.body?.reason ?? '');
    const updated = await customerCancel(req.authUser!.id, orderId, reason);
    await audit({
      actorId: req.authUser!.id,
      action: 'ORDER.CUSTOMER_CANCEL',
      entityType: 'Order',
      entityId: updated.id,
      metadata: { reason },
      ip: req.ip,
    });
    res.json(ok({ id: updated.id, status: updated.status }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/payments — manual payment submission (BDT v1):
 * the customer pays via bKash/Nagad/Rocket/bank and records the transaction.
 * NEVER marks the order paid — a founder verifies server-side.
 *
 * All trust boundaries live in createLegacyPaymentSubmission (payment
 * service): own-order 404, cancelled/rejected refusal, already-paid and
 * partially-paid refusal, TrxID normalization feeding the duplicate-TrxID
 * partial index, and P2002 → stable 409 codes.
 */
export async function submitPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = validated<z.infer<typeof paymentSubmitSchema>>(req, 'body');
    const { payment, orderNumber, orderTitle, totalAmount } = await createLegacyPaymentSubmission({
      customerId: req.authUser!.id,
      orderId,
      method: body.method,
      transactionId: body.transactionId,
    });
    await notifyUser({
      userId: req.authUser!.id,
      type: 'PAYMENT',
      title: 'Payment submitted',
      body: `We received your ${body.method} transaction ID for verification.`,
      link: `/orders/${orderId}`,
    });

    // Founder alert — a TrxID is waiting for verification. Best-effort.
    {
      const adminBase = env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app';
      await notifyFounders(
        `💳 Payment submitted for ${orderNumber} — ${formatBDT(totalAmount)}`,
        emailShell(
          'Transaction ID awaiting verification',
          [
            ['Order', `${orderNumber} · ${orderTitle}`],
            ['Amount', formatBDT(totalAmount)],
            ['Method', body.method === 'BANK_TRANSFER' ? 'Bank transfer' : body.method],
            ['Transaction ID', body.transactionId],
            ['Customer', `${req.authUser!.fullName} (${req.authUser!.email})`],
          ],
          'Verify payment',
          `${adminBase}/admin/payments`,
        ),
      );
    }

    res.status(201).json(
      ok({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: payment.amount.toString(),
        transactionId: payment.transactionId,
        hasScreenshot: false,
        adminNote: null,
        verifiedAt: null,
        createdAt: payment.createdAt.toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/revisions — revision request during allowed stages. */
export async function requestRevision(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = z.object({ description: z.string().trim().min(10).max(4000) }).parse(req.body);
    const order = await getOwnOrder(req.authUser!.id, orderId);
    if (!REVISION_ALLOWED.includes(order.status)) {
      throw ApiError.conflict('Revisions can only be requested while the project is in progress/delivered');
    }
    const open = order.revisionRequests.find((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS');
    if (open) {
      throw ApiError.conflict('You already have a revision being handled for this order');
    }
    const revision = await prisma.revisionRequest.create({
      data: { orderId: order.id, customerId: req.authUser!.id, description: body.description },
    });
    await notifyUser({
      userId: req.authUser!.id,
      type: 'REVISION',
      title: 'Revision requested',
      body: 'Your revision request is logged — a founder will respond with a plan.',
      link: `/orders/${orderId}`,
    });
    res.status(201).json(
      ok({
        id: revision.id,
        description: revision.description,
        status: revision.status,
        adminResponse: revision.adminResponse,
        createdAt: revision.createdAt.toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/review — one review per order, after completion. */
export async function submitReview(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    const order = await getOwnOrder(req.authUser!.id, orderId);
    if (!['COMPLETED', 'DELIVERED'].includes(order.status)) {
      throw ApiError.conflict('Reviews open once the project is completed');
    }
    if (order.reviews.length > 0) throw ApiError.conflict('You already reviewed this order');
    const review = await prisma.review.create({
      data: {
        orderId: order.id,
        customerId: req.authUser!.id,
        rating: body.rating,
        comment: body.comment ?? null,
      },
    });
    res.status(201).json(
      ok({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        isPublic: review.isPublic,
        createdAt: review.createdAt.toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/attachments — register a completed Blob upload against
 * the order. The pathname must be a server-minted path under THIS customer's
 * namespace, the referenced object must exist with matching metadata, and
 * file metadata limits are enforced server-side.
 */
export async function addAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = validated<{ pathname: string; fileName: string; mimeType: string; sizeBytes: number; kind: 'REQUIREMENT' | 'DELIVERABLE_FEEDBACK' | 'OTHER' }>(req, 'body');
    const order = await getOwnOrder(req.authUser!.id, orderId);
    assertUploadAllowed(body.mimeType, body.sizeBytes);
    assertOwnedPathname(body.pathname, 'requirements', req.authUser!.id, 'attachment');
    await assertStoredBlob(body.pathname, { contentType: body.mimeType, sizeBytes: body.sizeBytes });
    const attachment = await prisma.orderAttachment.create({
      data: {
        orderId: order.id,
        uploadedById: req.authUser!.id,
        kind: body.kind,
        blobPath: body.pathname,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      },
    });
    res.status(201).json(
      ok({
        id: attachment.id,
        kind: attachment.kind,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt.toISOString(),
        downloadUrl: null,
      }),
    );
  } catch (err) {
    next(err);
  }
}
