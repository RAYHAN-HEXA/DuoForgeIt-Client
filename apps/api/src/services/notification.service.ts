import type { NotificationType } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';

/** Create a customer notification. Best-effort: never fails the caller. */
export async function notifyUser(entry: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        title: entry.title,
        body: entry.body,
        link: entry.link ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, userId: entry.userId, type: entry.type }, 'Notification write failed');
  }
}
