import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../utils/envelope.js';
import { prisma } from '../config/prisma.js';
import type { NotificationDto } from '@tsh/shared';

/** GET /api/notifications — newest first + unread count. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.authUser!.id;
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items: NotificationDto[] = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    res.json(ok({ items, unread }));
  } catch (err) {
    next(err);
  }
}

/** POST /api/notifications/read — mark specific ids (or all) as read. */
export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({ ids: z.array(z.uuid()).max(100).optional() }).parse(req.body);
    const userId = req.authUser!.id;
    await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.json(ok({ done: true }));
  } catch (err) {
    next(err);
  }
}
