import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { contactSchema } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { emailShell, notifyFounders } from '../services/mail.service.js';

/**
 * POST /api/contact — public contact form. The honeypot (`website`) must stay
 * empty: bots fill it, humans never see it, and a filled honeypot is silently
 * accepted (202) but discarded so bots don't learn anything.
 */
export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<z.infer<typeof contactSchema>>(req, 'body');
    if (body.website) {
      res.status(202).json(ok({ received: true }));
      return;
    }
    const created = await prisma.contactMessage.create({
      data: {
        name: body.name,
        email: body.email,
        subject: body.subject ?? null,
        message: body.message,
      },
    });

    // Alert both founders — best-effort, so a mail outage never fails the form.
    const adminBase = env.ADMIN_PANEL_URL ?? 'https://techservicehub.vercel.app';
    const subjectLine = (created.subject ?? `Message from ${created.name}`)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 160);
    await notifyFounders(
      `📬 New contact message — ${subjectLine}`,
      emailShell(
        'New contact form message',
        [
          ['Name', created.name],
          ['Email', created.email],
          ['Subject', created.subject ?? '—'],
          [
            'Received',
            created.createdAt.toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Dhaka',
            }),
          ],
          ['Message', created.message],
        ],
        'Open contact inbox',
        `${adminBase}/admin/messages`,
      ),
    );

    res.status(201).json(ok({ received: true }));
  } catch (err) {
    next(err);
  }
}
