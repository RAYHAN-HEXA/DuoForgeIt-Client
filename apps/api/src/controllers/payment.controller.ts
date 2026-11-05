import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { paymentSubmitV2Schema } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { formatBDT } from '@tsh/shared';
import * as payment from '../services/payment.service.js';
import { notifyUser } from '../services/notification.service.js';
import { emailShell, notifyFounders } from '../services/mail.service.js';

/**
 * Manual-payments v2 — customer-facing payment endpoints (Stage 2).
 * Verification/rejection lives in the admin flow (Stage 3); this controller
 * only lists active receiving accounts and registers submissions. All
 * business rules live in payment.service.
 */

/** GET /api/payment-accounts — active receiving accounts for the payment picker. */
export async function listAccounts(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok({ items: await payment.listActivePaymentAccounts() }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/payments/v2 — account-driven manual payment submission.
 * The client picks an account id and declares what it sent; the server
 * derives every receiving-account snapshot, computes the exact outstanding
 * amount, and lets the Stage 1 unique indexes arbitrate duplicates. Never
 * marks the order paid — a founder verifies in Stage 3.
 */
export async function submitPaymentV2(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = validated<{ id: string }>(req, 'params').id;
    const body = validated<z.infer<typeof paymentSubmitV2Schema>>(req, 'body');
    const user = req.authUser!;
    const { payment: created, orderNumber, orderTitle } = await payment.createPaymentSubmission({
      customerId: user.id,
      orderId,
      accountId: body.accountId,
      transactionId: body.transactionId,
      senderNumber: body.senderNumber,
      amount: body.amount,
      screenshotPublicId: body.screenshotPublicId,
      screenshotMimeType: body.screenshotMimeType,
      screenshotSizeBytes: body.screenshotSizeBytes,
    });

    // Customer notification — mirrors the v1 submission flow. Best-effort.
    await notifyUser({
      userId: user.id,
      type: 'PAYMENT',
      title: 'Payment submitted',
      body: `We received your ${created.methodLabelSnapshot ?? created.method} transaction ID for verification.`,
      link: `/orders/${orderId}`,
    });

    // Founder alert — a transaction is waiting for verification. Best-effort.
    const adminBase = env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app';
    await notifyFounders(
      `💳 Payment submitted for ${orderNumber} — ${formatBDT(created.amount.toString())}`,
      emailShell(
        'Transaction ID awaiting verification',
        [
          ['Order', `${orderNumber} · ${orderTitle}`],
          ['Amount', formatBDT(created.amount.toString())],
          ['Account', created.methodLabelSnapshot ?? created.methodKeySnapshot ?? created.method],
          ['Transaction ID', created.transactionId ?? '—'],
          ['Screenshot', created.screenshotPublicId ? 'Attached' : 'None'],
          ['Customer', `${user.fullName} (${user.email})`],
        ],
        'Verify payment',
        `${adminBase}/admin/payments`,
      ),
    );

    res.status(201).json(ok(payment.toPaymentSubmissionDto(created)));
  } catch (err) {
    next(err);
  }
}
