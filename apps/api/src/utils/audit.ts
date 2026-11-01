import { prisma } from '../config/prisma.js';
import { logger } from './logger.js';

/**
 * Sensitive admin actions land here (PRD §11: "sensitive actions recorded in
 * an audit log"). Failures are logged but never break the API response — an
 * audit write must not be able to make a completed action look failed.
 */
export async function audit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? undefined) as never,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action, entityId: entry.entityId }, 'Audit log write failed');
  }
}
