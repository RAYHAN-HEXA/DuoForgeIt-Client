import type { Order, Payment, PaymentStatus, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { parseMoneyToCents, subtractMoney, sumMoney } from '../utils/money.js';
import { assertOwnedPathname, assertStoredBlob } from '../utils/blob.js';
import { toPaymentAccountOptionDto } from '../utils/mappers.js';
import { PAYMENT_ERROR_CODES, type PaymentAccountOptionDto, type PaymentSubmissionDto } from '@tsh/shared';

/**
 * Manual-payments v2 customer submission (Stage 2 — activation stage).
 *
 * Trust boundaries enforced here, never in the controller:
 *  - Identity/ownership come from the authenticated Firebase user; a customer
 *    can only ever see and pay their OWN orders (404, never 403 — no
 *    existence leak).
 *  - The receiving account, its label/number/holder and the exact amount due
 *    are resolved server-side from PostgreSQL. The client only picks an
 *    account id and declares what it sent.
 *  - Duplicate protection does NOT rely on check-then-create: the Stage 1
 *    partial unique indexes are authoritative. A read-only P2002 from either
 *    index is mapped to the stable PAYMENT_ERROR_CODES so the UI can branch
 *    without parsing messages.
 *
 * Out of scope here (Stage 3): verification/rejection and Order.amountPaid /
 * paymentStatus recalculation. A submitted payment carries status SUBMITTED
 * and touches no order accounting.
 */

// ─── Transaction-ID normalization (Stage 1 contract) ─────────

/**
 * Stage 1 normalization, mirrored from the migration backfill
 * (`upper(regexp_replace("transactionId", '\\s+', '', 'g'))`): trim edges,
 * strip ALL internal whitespace, uppercase. One algorithm system-wide — the
 * raw customer input is preserved verbatim in `transactionId`.
 */
export function normalizeTransactionId(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

// ─── Active receiving accounts ───────────────────────────────

/**
 * Customer-facing list of ACTIVE receiving accounts. Sorted deterministically
 * (displayOrder, then label, then id) so the picker renders identically on
 * every request. Only safe DTO fields leave the service — audit columns,
 * isActive flags and internal ordering metadata stay behind. QR images are
 * minted as short-lived signed URLs (null when absent or Cloudinary is not
 * configured).
 */
export async function listActivePaymentAccounts(): Promise<PaymentAccountOptionDto[]> {
  const rows = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
  });
  return Promise.all(rows.map(toPaymentAccountOptionDto));
}

// ─── Order eligibility & exact outstanding ───────────────────

type PayableOrder = {
  id: string;
  customerId: string;
  status: string;
  totalAmount: string;
  amountPaid: string | null;
  /** Order-level accounting status (PAID/REFUNDED/…) — NOT Payment.status. */
  paymentStatus: Order['paymentStatus'];
  acceptedQuotationId: string | null;
};

/**
 * Own-order lookup with exactly the columns payment logic needs. The
 * customerId is part of the WHERE — a foreign or nonexistent order is the
 * same 404 (matches getOwnOrder semantics; never leaks existence).
 */
async function getOwnPayableOrder(customerId: string, orderId: string): Promise<PayableOrder | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: {
      id: true,
      customerId: true,
      status: true,
      totalAmount: true,
      amountPaid: true,
      paymentStatus: true,
      acceptedQuotationId: true,
    },
  });
  if (!order) return null;
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    totalAmount: order.totalAmount.toString(),
    amountPaid: order.amountPaid?.toString() ?? null,
    paymentStatus: order.paymentStatus,
    acceptedQuotationId: order.acceptedQuotationId,
  };
}

/**
 * outstanding = totalAmount − amountPaid (Stage 1 accounting invariant:
 * amountPaid = Σ VERIFIED payments, maintained by the migration backfill and
 * later by Stage 3 verification). Exact BigInt-cents math — never floats.
 */
export function computeOutstanding(order: Pick<PayableOrder, 'totalAmount' | 'amountPaid'>): string {
  return subtractMoney(order.totalAmount, order.amountPaid ?? '0.00');
}

// ─── Verification accounting (Stage 3) ──────────────────────

/**
 * Reviewable payment states. `SUBMITTED` is what both V1 and V2 submission
 * paths write; `PENDING` is the schema default and may exist on legacy rows.
 * Every other state is terminal for review purposes.
 */
export const REVIEWABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = ['PENDING', 'SUBMITTED'];

export function isReviewablePaymentStatus(status: PaymentStatus): boolean {
  return REVIEWABLE_PAYMENT_STATUSES.includes(status);
}

export type PaymentAccountingRow = {
  status: PaymentStatus;
  /** Decimal(12,2) serialized as a 2-decimal string. */
  amount: string;
};

export type OrderPaymentAccounting = {
  /**
   * Σ VERIFIED payment amounts, exact 2-decimal money string.
   * `null` when the order has no VERIFIED payments — matching the Stage 1
   * backfill/schema contract where null means "no verified money received".
   */
  amountPaid: string | null;
  /**
   * PAID only when verified money covers the order total. The enum has no
   * PARTIAL value, so a partially paid order keeps `null` (unpaid/partial)
   * while `amountPaid` still carries the exact received amount.
   */
  paymentStatus: Order['paymentStatus'];
  verifiedCents: bigint;
  totalCents: bigint;
};

/**
 * Pure accounting calculation over the Payment table (the source of truth).
 * Only VERIFIED rows contribute. Exact BigInt-cents math from `money.ts` —
 * no floating point anywhere.
 */
export function computeOrderPaymentAccounting(
  totalAmount: string,
  payments: ReadonlyArray<PaymentAccountingRow>,
): OrderPaymentAccounting {
  const verifiedAmounts = payments.filter((p) => p.status === 'VERIFIED').map((p) => p.amount);
  const paid = sumMoney(verifiedAmounts);
  const verifiedCents = parseMoneyToCents(paid) ?? 0n;
  const totalCents = parseMoneyToCents(totalAmount) ?? 0n;

  return {
    amountPaid: verifiedAmounts.length === 0 ? null : paid,
    paymentStatus: verifiedAmounts.length > 0 && verifiedCents >= totalCents ? 'PAID' : null,
    verifiedCents,
    totalCents,
  };
}

/**
 * Recalculate and persist an order's verified-payment accounting.
 *
 * MUST run inside the same transaction that transitions a Payment to
 * VERIFIED. The Order row is locked with `SELECT … FOR UPDATE` before the
 * aggregate is read. That serialises concurrent verifications of *different*
 * payments on the same order: the second transaction waits, then re-reads a
 * snapshot that includes the first transaction's committed payment, so no
 * update is lost and no payment is double-counted.
 *
 * Read-committed isolation plus this explicit row lock is intentional; no
 * serializable retries are needed for this access pattern. Database errors
 * propagate to the caller so the whole transaction rolls back.
 */
export async function recalculateOrderPaymentAccounting(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderPaymentAccounting> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `;
  if (locked.length !== 1) throw ApiError.notFound('Order not found');

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true },
  });
  if (!order) throw ApiError.notFound('Order not found');

  // The source of truth: every VERIFIED row for this order, nothing else.
  const payments = await tx.payment.findMany({
    where: { orderId },
    select: { status: true, amount: true },
  });

  const accounting = computeOrderPaymentAccounting(
    order.totalAmount.toFixed(2),
    payments.map((p) => ({ status: p.status, amount: p.amount.toFixed(2) })),
  );

  await tx.order.update({
    where: { id: orderId },
    data: {
      amountPaid: accounting.amountPaid,
      paymentStatus: accounting.paymentStatus,
    },
  });

  return accounting;
}

// ─── Account eligibility ─────────────────────────────────────

/**
 * An account is valid when it exists and is active — and, for quotation-
 * negotiated orders (identity: Order.acceptedQuotationId set by the accept
 * transaction, never a client flag), only an active bKash account is
 * accepted. Fixed-price orders keep every active account across all rails.
 */
export function assertAccountValidForOrder(
  account: { methodKey: string; isActive: boolean } | null,
  order: Pick<PayableOrder, 'acceptedQuotationId'>,
): void {
  if (!account || !account.isActive) {
    throw new ApiError(
      400,
      PAYMENT_ERROR_CODES.INVALID_PAYMENT_ACCOUNT,
      'That payment account is not available. Pick another one and try again.',
    );
  }
  if (order.acceptedQuotationId !== null && account.methodKey !== 'BKASH') {
    throw new ApiError(
      400,
      PAYMENT_ERROR_CODES.INVALID_PAYMENT_ACCOUNT,
      'Quotation-negotiated orders currently accept bKash payments only.',
    );
  }
}

/** Rails known to the PaymentMethod enum; custom keys (UPAY, …) land in OTHER. */
const ACCOUNT_METHODS: Record<string, 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANK_TRANSFER'> = {
  BKASH: 'BKASH',
  NAGAD: 'NAGAD',
  ROCKET: 'ROCKET',
  BANK_TRANSFER: 'BANK_TRANSFER',
};

function paymentMethodForAccountKey(methodKey: string): 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANK_TRANSFER' | 'OTHER' {
  return ACCOUNT_METHODS[methodKey] ?? 'OTHER';
}

// ─── Screenshot ownership ────────────────────────────────────

/**
 * A payment may only reference a screenshot minted by THIS user's upload
 * ticket (`techservice-hub/payments/<userId>/<uuid>.<ext>` — the API mints
 * the pathname server-side). The existence/metadata of the referenced blob
 * is additionally verified at submission time via assertStoredBlob; this
 * namespace-ownership check stays exported for defense-in-depth reuse.
 */
export function assertPaymentScreenshotOwnership(pathname: string, userId: string): void {
  assertOwnedPathname(pathname, 'payments', userId, 'screenshot');
}

// ─── Submission ──────────────────────────────────────────────

export type PaymentSubmissionInput = {
  customerId: string;
  orderId: string;
  accountId: string;
  transactionId: string;
  senderNumber?: string;
  amount: string;
  screenshotPathname?: string;
  screenshotMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  screenshotSizeBytes?: number;
};

/**
 * Map a Prisma P2002 raised by the two Stage 1 partial unique indexes onto
 * the stable error codes. The database constraint is authoritative — this is
 * only translation. `meta` shapes vary by Prisma version (field arrays vs
 * index names), so the match runs over the serialized meta.
 */
function mapPaymentConstraintError(err: unknown): void {
  if (!(typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002')) return;
  const meta = JSON.stringify((err as { meta?: unknown }).meta ?? '').toLowerCase();
  if (meta.includes('trxid') || meta.includes('transactionidnormalized')) {
    throw new ApiError(
      409,
      PAYMENT_ERROR_CODES.DUPLICATE_TRANSACTION,
      'This transaction ID is already recorded on another payment awaiting review. Check the ID or contact support.',
    );
  }
  if (meta.includes('one_active') || meta.includes('orderid')) {
    throw new ApiError(
      409,
      PAYMENT_ERROR_CODES.PAYMENT_ALREADY_PENDING,
      'This order already has a payment awaiting verification. Wait for it to be reviewed.',
    );
  }
  // Unrecognized unique target — surface as a generic conflict, never 500.
  throw ApiError.conflict('This payment conflicts with an existing record. Try again or contact support.');
}

/**
 * Create one v2 payment submission. Order accounting is NOT touched here —
 * verification (Stage 3) owns amountPaid/paymentStatus.
 */
export async function createPaymentSubmission(
  input: PaymentSubmissionInput,
): Promise<{ payment: Payment; orderNumber: string; orderTitle: string }> {
  const order = await getOwnPayableOrder(input.customerId, input.orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
    throw ApiError.conflict('Payments cannot be submitted for a cancelled/rejected order');
  }

  // Exact outstanding from the server — the client's number is only evidence,
  // never the amount. Zero/negative outstanding means there is nothing to pay.
  const outstanding = computeOutstanding(order);
  const outstandingCents = parseMoneyToCents(outstanding) ?? 0n;
  if (order.paymentStatus === 'PAID' || outstandingCents <= 0n) {
    throw new ApiError(409, PAYMENT_ERROR_CODES.ORDER_ALREADY_PAID, 'This order is already fully paid.');
  }
  const submittedCents = parseMoneyToCents(input.amount);
  if (submittedCents === null || submittedCents <= 0n) {
    throw new ApiError(
      409,
      PAYMENT_ERROR_CODES.AMOUNT_MISMATCH,
      'Enter the exact outstanding amount — partial payments are not supported.',
      { expected: outstanding },
    );
  }
  if (submittedCents !== outstandingCents) {
    throw new ApiError(
      409,
      PAYMENT_ERROR_CODES.AMOUNT_MISMATCH,
      `The exact outstanding amount is ৳${outstanding}. Partial payments are not supported.`,
      { expected: outstanding },
    );
  }

  const account = await prisma.paymentAccount.findUnique({ where: { id: input.accountId } });
  assertAccountValidForOrder(account, order);

  const normalized = normalizeTransactionId(input.transactionId);
  if (!normalized) throw ApiError.badRequest('Transaction ID is required');
  if (input.screenshotPathname) {
    assertPaymentScreenshotOwnership(input.screenshotPathname, input.customerId);
    // Prove the referenced screenshot exists and matches the declared
    // metadata before the payment row is persisted.
    await assertStoredBlob(input.screenshotPathname, {
      contentType: input.screenshotMimeType,
      sizeBytes: input.screenshotSizeBytes,
    });
  }

  let payment: Payment;
  try {
    // Single atomic insert — the Stage 1 partial unique indexes (one active
    // submission per order, one active TrxID globally) are the real guards;
    // every earlier read is friendly-error fast path only.
    payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: paymentMethodForAccountKey(account!.methodKey),
        status: 'SUBMITTED',
        amount: outstanding,
        transactionId: input.transactionId,
        transactionIdNormalized: normalized,
        paymentAccountId: account!.id,
        // Immutable snapshots — the account details the customer actually
        // paid to. Later admin edits/disabling never rewrite these.
        methodKeySnapshot: account!.methodKey,
        methodLabelSnapshot: account!.label,
        accountTypeSnapshot: account!.accountType,
        accountNumberSnapshot: account!.accountNumber,
        accountHolderSnapshot: account!.accountHolder,
        instructionsSnapshot: account!.instructions,
        senderNumber: input.senderNumber ?? null,
        blobPath: input.screenshotPathname ?? null,
      },
    });
  } catch (err) {
    mapPaymentConstraintError(err);
    throw err;
  }

  const summary = await prisma.order.findUnique({
    where: { id: order.id },
    select: { orderNumber: true, title: true },
  });
  return { payment, orderNumber: summary?.orderNumber ?? '', orderTitle: summary?.title ?? '' };
}

// ─── Serialization ───────────────────────────────────────────

/**
 * Customer-safe payment DTO. Snapshots (not the live account) are rendered,
 * the raw Cloudinary public id never leaves the service, and admin-only
 * fields (adminNote, verifiedAt, rejection audit) stay server-side until a
 * later stage introduces customer-safe rejection surfacing.
 */
export function toPaymentSubmissionDto(payment: Payment): PaymentSubmissionDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    methodKey: payment.methodKeySnapshot ?? payment.method,
    methodLabel: payment.methodLabelSnapshot,
    accountNumber: payment.accountNumberSnapshot,
    senderNumber: payment.senderNumber,
    // toFixed(2), not toString(): Prisma's Decimal strips trailing zeros
    // ("1000.00" → "1000") — the money-string contract is always 2 decimals.
    amount: payment.amount.toFixed(2),
    // v2 submissions always carry a TrxID (schema-enforced); '' only for a
    // row that somehow predates it — this DTO never maps legacy rows.
    transactionId: payment.transactionId ?? '',
    status: payment.status,
    hasScreenshot: Boolean(payment.blobPath || payment.screenshotPublicId),
    createdAt: payment.createdAt.toISOString(),
  };
}
