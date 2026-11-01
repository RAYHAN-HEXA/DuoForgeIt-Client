import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { checkoutSchema, paymentSubmitSchema } from '@tsh/shared';
import { REVISION_ALLOWED } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import { validated } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';
import { hasCloudinary } from '../config/env.js';
import { assertUploadAllowed, signedDownloadUrl } from '../utils/cloudinary.js';
import { toOrderDto, toOrderSummaryDto } from '../utils/mappers.js';
import { checkout, customerCancel, getOwnOrder } from '../services/order.service.js';
import { clearServices } from '../services/cart.service.js';
import { notifyUser } from '../services/notification.service.js';
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

/** Mint download URLs when Cloudinary is configured; null URLs otherwise. */
function mintUrls(order: { attachments: Array<{ id: string; cloudinaryPublicId: string; mimeType: string }>; deliverables: Array<{ id: string; cloudinaryPublicId: string }> }) {
  if (!hasCloudinary) return {};
  const attachments = new Map<string, string | null>();
  for (const a of order.attachments) attachments.set(a.id, signedDownloadUrl(a.cloudinaryPublicId, 'auto'));
  const deliverables = new Map<string, string | null>();
  for (const d of order.deliverables) deliverables.set(d.id, signedDownloadUrl(d.cloudinaryPublicId, 'auto'));
  return { attachments, deliverables };
}

/** GET /api/orders/:id — full detail for the owning customer. */
export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const order = await getOwnOrder(req.authUser!.id, orderId);
    res.json(ok(toOrderDto(order, mintUrls(order))));
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
 */
export async function submitPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = validated<z.infer<typeof paymentSubmitSchema>>(req, 'body');
    const order = await getOwnOrder(req.authUser!.id, orderId);
    if (['CANCELLED', 'REJECTED'].includes(order.status)) {
      throw ApiError.conflict('Payments cannot be submitted for a cancelled/rejected order');
    }
    const total = order.totalAmount.toString();
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: body.method,
        transactionId: body.transactionId,
        amount: total,
        status: 'SUBMITTED',
      },
    });
    await notifyUser({
      userId: req.authUser!.id,
      type: 'PAYMENT',
      title: 'Payment submitted',
      body: `We received your ${body.method} transaction ID for verification.`,
      link: `/orders/${orderId}`,
    });
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
 * POST /api/orders/:id/attachments — register a client-side Cloudinary upload
 * against the order. Ownership of the order is checked; file metadata limits
 * are enforced server-side.
 */
export async function addAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = validated<{ cloudinaryPublicId: string; fileName: string; mimeType: string; sizeBytes: number; kind: 'REQUIREMENT' | 'DELIVERABLE_FEEDBACK' | 'OTHER' }>(req, 'body');
    const order = await getOwnOrder(req.authUser!.id, orderId);
    assertUploadAllowed(body.mimeType, body.sizeBytes);
    const attachment = await prisma.orderAttachment.create({
      data: {
        orderId: order.id,
        uploadedById: req.authUser!.id,
        kind: body.kind,
        cloudinaryPublicId: body.cloudinaryPublicId,
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
