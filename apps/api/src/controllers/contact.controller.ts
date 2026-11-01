import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { contactSchema } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';

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
    await prisma.contactMessage.create({
      data: {
        name: body.name,
        email: body.email,
        subject: body.subject ?? null,
        message: body.message,
      },
    });
    res.status(201).json(ok({ received: true }));
  } catch (err) {
    next(err);
  }
}
