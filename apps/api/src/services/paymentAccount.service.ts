import type { z } from 'zod';
import { PAYMENT_ERROR_CODES } from '@tsh/shared';
import type { paymentAccountCreateSchema, paymentAccountUpdateSchema } from '@tsh/shared';
import type { PaymentAccount, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { assertPaymentAccountQrOwnership } from '../utils/cloudinary.js';

/**
 * Admin payment-account management (Stage 4).
 *
 * Receiving accounts are live configuration: customers only ever see active
 * rows, while historical Payment rows keep their own submission-time
 * snapshots. Nothing here writes to Payment/Order, so editing or disabling an
 * account can never rewrite payment history.
 */

export type CreatePaymentAccountInput = z.infer<typeof paymentAccountCreateSchema>;
export type UpdatePaymentAccountInput = z.infer<typeof paymentAccountUpdateSchema>;

const ACCOUNT_INCLUDE = {
  _count: { select: { payments: true } },
  createdBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
} as const;

export type PaymentAccountWithMeta = PaymentAccount & {
  _count: { payments: number };
  createdBy: { fullName: string } | null;
  updatedBy: { fullName: string } | null;
};

/** Stable, admin-friendly ordering shared by the admin and customer lists. */
const ACCOUNT_ORDER: Prisma.PaymentAccountOrderByWithRelationInput[] = [
  { displayOrder: 'asc' },
  { label: 'asc' },
  { id: 'asc' },
];

function isPrismaCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;
}

export async function listPaymentAccounts(): Promise<PaymentAccountWithMeta[]> {
  return prisma.paymentAccount.findMany({
    orderBy: ACCOUNT_ORDER,
    include: ACCOUNT_INCLUDE,
  });
}

export async function getPaymentAccount(id: string): Promise<PaymentAccountWithMeta> {
  const account = await prisma.paymentAccount.findUnique({
    where: { id },
    include: ACCOUNT_INCLUDE,
  });
  if (!account) throw ApiError.notFound('Payment account not found');
  return account;
}

/**
 * Create a receiving account. Identity columns always come from the
 * authenticated administrator; client-supplied ids are stripped by the shared
 * schema and overridden here regardless.
 */
export async function createPaymentAccount(
  input: CreatePaymentAccountInput,
  actorId: string,
): Promise<PaymentAccountWithMeta> {
  if (input.qrPublicId) assertPaymentAccountQrOwnership(input.qrPublicId, actorId);

  return prisma.$transaction(async (tx) => {
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined) {
      // Append after the current highest position so new accounts do not all
      // collide at 0. Display order is cosmetic; the label/id tie-break keeps
      // rendering deterministic even if admins set duplicate positions.
      const aggregate = await tx.paymentAccount.aggregate({ _max: { displayOrder: true } });
      displayOrder = (aggregate._max.displayOrder ?? -1) + 1;
    }

    return tx.paymentAccount.create({
      data: {
        methodKey: input.methodKey,
        label: input.label,
        accountType: input.accountType ?? null,
        accountNumber: input.accountNumber,
        accountHolder: input.accountHolder,
        instructions: input.instructions ?? null,
        qrPublicId: input.qrPublicId ?? null,
        isActive: input.isActive ?? true,
        displayOrder,
        createdById: actorId,
        updatedById: actorId,
      },
      include: ACCOUNT_INCLUDE,
    });
  });
}

/**
 * Update editable fields only. Every supplied field is written explicitly;
 * omitted fields stay untouched. `updatedById` is always the authenticated
 * administrator. Historical Payment snapshots are never referenced or
 * rewritten.
 */
export async function updatePaymentAccount(
  id: string,
  input: UpdatePaymentAccountInput,
  actorId: string,
): Promise<{
  account: PaymentAccountWithMeta;
  previous: PaymentAccountWithMeta;
  changedFields: string[];
}> {
  const previous = await getPaymentAccount(id);
  const data: Prisma.PaymentAccountUncheckedUpdateInput = { updatedById: actorId };
  const changedFields: string[] = [];

  if (input.methodKey !== undefined) {
    data.methodKey = input.methodKey;
    changedFields.push('methodKey');
  }
  if (input.label !== undefined) {
    data.label = input.label;
    changedFields.push('label');
  }
  if (input.accountType !== undefined) {
    data.accountType = input.accountType;
    changedFields.push('accountType');
  }
  if (input.accountNumber !== undefined) {
    data.accountNumber = input.accountNumber;
    changedFields.push('accountNumber');
  }
  if (input.accountHolder !== undefined) {
    data.accountHolder = input.accountHolder;
    changedFields.push('accountHolder');
  }
  if (input.instructions !== undefined) {
    data.instructions = input.instructions;
    changedFields.push('instructions');
  }
  if (input.qrPublicId !== undefined) {
    // null means "remove the current image"; any other value must be an
    // admin-namespace upload minted for THIS administrator.
    if (input.qrPublicId !== null) assertPaymentAccountQrOwnership(input.qrPublicId, actorId);
    data.qrPublicId = input.qrPublicId;
    changedFields.push('qrPublicId');
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
    changedFields.push('isActive');
  }
  if (input.displayOrder !== undefined) {
    data.displayOrder = input.displayOrder;
    changedFields.push('displayOrder');
  }

  if (changedFields.length === 0) {
    return { account: previous, previous, changedFields };
  }

  const account = await prisma.paymentAccount.update({
    where: { id },
    data,
    include: ACCOUNT_INCLUDE,
  });
  return { account, previous, changedFields };
}

/** Activate/deactivate without deleting the row or touching payment history. */
export async function setPaymentAccountStatus(
  id: string,
  isActive: boolean,
  actorId: string,
): Promise<{ account: PaymentAccountWithMeta; previous: PaymentAccountWithMeta; changed: boolean }> {
  const previous = await getPaymentAccount(id);
  if (previous.isActive === isActive) {
    return { account: previous, previous, changed: false };
  }
  const account = await prisma.paymentAccount.update({
    where: { id },
    data: { isActive, updatedById: actorId },
    include: ACCOUNT_INCLUDE,
  });
  return { account, previous, changed: true };
}

/**
 * Atomically apply a complete display order. Unknown ids fail loudly (never
 * silently skipped); the shared schema already rejects duplicate ids and
 * duplicate positions.
 */
export async function reorderPaymentAccounts(
  items: Array<{ id: string; displayOrder: number }>,
  actorId: string,
): Promise<PaymentAccountWithMeta[]> {
  const ids = items.map((item) => item.id);
  const existing = await prisma.paymentAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const known = new Set(existing.map((row) => row.id));
  const unknownIds = ids.filter((id) => !known.has(id));
  if (unknownIds.length > 0) {
    throw new ApiError(400, 'BAD_REQUEST', 'One or more payment accounts do not exist', { unknownIds });
  }

  try {
    await prisma.$transaction(
      items.map((item) =>
        prisma.paymentAccount.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder, updatedById: actorId },
        }),
      ),
    );
  } catch (err) {
    if (isPrismaCode(err, 'P2025')) {
      throw ApiError.badRequest('One or more payment accounts no longer exist');
    }
    throw err;
  }

  return listPaymentAccounts();
}

/**
 * Hard-delete only an unreferenced account. Referenced accounts are protected
 * twice: a friendly pre-check and the DB-level `onDelete: Restrict` foreign key
 * (which also closes the race where a payment is inserted after the check).
 */
export async function deletePaymentAccount(id: string): Promise<PaymentAccountWithMeta> {
  const account = await getPaymentAccount(id);
  if (account._count.payments > 0) {
    throw new ApiError(
      409,
      PAYMENT_ERROR_CODES.ACCOUNT_IN_USE,
      'This account is used by historical payments. Deactivate it instead of deleting it.',
      { usageCount: account._count.payments },
    );
  }

  try {
    await prisma.paymentAccount.delete({ where: { id } });
  } catch (err) {
    if (isPrismaCode(err, 'P2003')) {
      throw new ApiError(
        409,
        PAYMENT_ERROR_CODES.ACCOUNT_IN_USE,
        'This account is used by historical payments. Deactivate it instead of deleting it.',
      );
    }
    if (isPrismaCode(err, 'P2025')) throw ApiError.notFound('Payment account not found');
    throw err;
  }

  return account;
}
