'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  BadgeCheck,
  CircleAlert,
  ExternalLink,
  ImageOff,
  Loader2,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AdminPaymentDto, PaymentStatus } from '@tsh/shared';
import { PAYMENT_ERROR_CODES, formatBDT, paymentReviewSchema } from '@tsh/shared';
import { api, ApiClientError, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { PaymentMethodBadge, StatusBadge } from '@/components/status-badge';

/**
 * Stage 6 admin payment review: full detail (immutable receiving-account
 * snapshot, order accounting, screenshot via the signed-URL endpoint) plus
 * the verify/reject actions. Both actions call the existing Stage 3 endpoint
 * — the backend stays the only authority for status transitions and
 * accounting; a losing concurrent review surfaces as a conflict, never a
 * retry.
 */

/** Mirror of the backend's REVIEWABLE_PAYMENT_STATUSES — UI hint only. */
const REVIEWABLE: PaymentStatus[] = ['PENDING', 'SUBMITTED'];

type ScreenshotResponse = { screenshotUrl: string | null };

export function PaymentDetailSheet({
  payment,
  open,
  onOpenChange,
  onReviewed,
}: {
  payment: AdminPaymentDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful verify/reject so the queue + stats refresh. */
  onReviewed: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  // The parent remounts this component per payment (key={payment?.id}), which
  // resets the rejection draft — no effect needed.

  const reviewable = payment ? REVIEWABLE.includes(payment.status) : false;

  const {
    data: screenshot,
    error: screenshotError,
    isLoading: screenshotLoading,
  } = useSWR<ScreenshotResponse>(
    open && payment?.hasScreenshot ? `/admin/payments/${payment.id}/screenshot` : null,
    () => api.get<ScreenshotResponse>(`/admin/payments/${payment!.id}/screenshot`),
  );

  async function review(decision: 'VERIFIED' | 'REJECTED') {
    if (!payment || busy) return;
    setBusy(true);
    try {
      await api.patch(`/admin/payments/${payment.id}`, {
        decision,
        ...(decision === 'REJECTED' ? { note: reason.trim() } : {}),
      });
      toast.success(
        decision === 'VERIFIED' ? 'Payment verified — customer notified' : 'Payment rejected — customer notified',
      );
      setVerifyOpen(false);
      setRejectOpen(false);
      await onReviewed();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === PAYMENT_ERROR_CODES.PAYMENT_NOT_REVIEWABLE) {
        toast.error('This payment was already reviewed', {
          description: 'Another administrator got there first — the queue has been refreshed.',
        });
        await onReviewed();
        onOpenChange(false);
      } else {
        toast.error(`Could not ${decision === 'VERIFIED' ? 'verify' : 'reject'} payment`, {
          description: errorMessage(err),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function submitReject() {
    const parsed = paymentReviewSchema.safeParse({ decision: 'REJECTED', note: reason.trim() });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? 'A rejection reason is required');
      return;
    }
    setReasonError(null);
    void review('REJECTED');
  }

  const snapshot = payment
    ? [
        { label: 'Method', value: payment.methodLabelSnapshot ?? (payment.methodKeySnapshot ? payment.methodKeySnapshot : null) },
        { label: 'Account number', value: payment.accountNumberSnapshot },
        { label: 'Account holder', value: payment.accountHolderSnapshot },
        { label: 'Account type', value: payment.accountTypeSnapshot },
      ].filter((row) => row.value)
    : [];
  const hasSnapshot = snapshot.length > 0 || Boolean(payment?.instructionsSnapshot);

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Payment review {payment && <StatusBadge status={payment.status} />}
          </SheetTitle>
          <SheetDescription>
            Match the transaction against your MFS/bank records before verifying. An image is
            supporting evidence, not proof of transfer.
          </SheetDescription>
        </SheetHeader>

        {payment && (
          <div className="space-y-5 px-4 pb-8">
            {/* Payment facts */}
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <Row label="Amount">
                <span className="text-base font-bold">{formatBDT(payment.amount)}</span>
              </Row>
              <Row label="Method">
                <span className="flex items-center gap-2">
                  <PaymentMethodBadge method={payment.method} />
                  {payment.methodKeySnapshot && payment.methodKeySnapshot !== payment.method && (
                    <span className="text-xs text-muted-foreground">rail {payment.methodKeySnapshot}</span>
                  )}
                </span>
              </Row>
              <Row label="TrxID">
                {payment.transactionId ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
                    {payment.transactionId}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <Row label="Sender number">
                {payment.senderNumber ?? <span className="text-muted-foreground">—</span>}
              </Row>
              <Row label="Submitted">{new Date(payment.createdAt).toLocaleString()}</Row>
              {payment.verifiedAt && (
                <Row label="Verified">
                  {new Date(payment.verifiedAt).toLocaleString()}
                  {payment.verifiedByName ? ` · by ${payment.verifiedByName}` : ''}
                </Row>
              )}
              {payment.rejectedAt && (
                <Row label="Rejected">
                  {new Date(payment.rejectedAt).toLocaleString()}
                  {payment.rejectedByName ? ` · by ${payment.rejectedByName}` : ''}
                </Row>
              )}
              {payment.status === 'REJECTED' && (payment.rejectionReason ?? payment.adminNote) && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  Reason: {payment.rejectionReason ?? payment.adminNote}
                </p>
              )}
            </section>

            {/* Receiving account snapshot — immutable submission-time values */}
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <QrCode className="h-4 w-4 text-primary" /> Receiving account (snapshot at submission)
              </p>
              {hasSnapshot ? (
                <>
                  {snapshot.map((row) => (
                    <Row key={row.label} label={row.label}>
                      <span className={row.label === 'Account number' ? 'font-mono' : ''}>{row.value}</span>
                    </Row>
                  ))}
                  {payment.instructionsSnapshot && (
                    <p className="whitespace-pre-line rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {payment.instructionsSnapshot}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Historical account details are unavailable — this payment predates receiving
                  accounts (legacy v1 submission).
                </p>
              )}
            </section>

            {/* Order + customer */}
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <Row label="Order">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{payment.order.orderNumber}</span>
                  <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                    <a href={`/admin/orders/${payment.order.id}`} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </span>
              </Row>
              <Row label="Title">{payment.order.title}</Row>
              <Row label="Customer">
                <span>
                  {payment.order.customerName}
                  <span className="block text-xs text-muted-foreground">{payment.order.customerEmail}</span>
                </span>
              </Row>
              {payment.order.totalAmount !== undefined && (
                <>
                  <Separator />
                  <Row label="Order total">{formatBDT(payment.order.totalAmount)}</Row>
                  {payment.order.outstandingAmount !== undefined && (
                    <Row label="Outstanding after this review">
                      <span className="font-semibold">{formatBDT(payment.order.outstandingAmount)}</span>
                    </Row>
                  )}
                </>
              )}
            </section>

            {/* Screenshot — signed URL minted per request from the stored id */}
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">Payment screenshot</p>
              {!payment.hasScreenshot ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageOff className="h-4 w-4" /> No screenshot was submitted with this payment.
                </p>
              ) : screenshotLoading ? (
                <Skeleton className="h-48 w-full rounded-md" />
              ) : screenshotError ? (
                <p className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <CircleAlert className="h-4 w-4" /> Could not load the screenshot — {errorMessage(screenshotError)}
                </p>
              ) : screenshot?.screenshotUrl ? (
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshot.screenshotUrl}
                    alt={`Payment screenshot for ${payment.order.orderNumber}`}
                    className="max-h-96 w-full rounded-md border bg-white object-contain"
                  />
                  <figcaption className="text-[11px] text-muted-foreground">
                    Short-lived signed URL — the stored reference never leaves the server.
                  </figcaption>
                </figure>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Screenshot reference exists but no preview is available.
                </p>
              )}
            </section>

            {/* Review actions — only while the backend can still transition */}
            {reviewable && (
              <div className="flex gap-2 border-t pt-4">
                <Button variant="destructive" className="flex-1" onClick={() => setRejectOpen(true)} disabled={busy}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button className="flex-1" onClick={() => setVerifyOpen(true)} disabled={busy}>
                  <BadgeCheck className="h-4 w-4" /> Verify
                </Button>
              </div>
            )}
            {!reviewable && (
              <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> This payment has already been reviewed — no further
                action is available.
              </p>
            )}
          </div>
        )}

        {/* Verify confirmation */}
        <AlertDialog open={verifyOpen} onOpenChange={(next) => !busy && setVerifyOpen(next)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Verify this payment?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    Confirm that <strong>{formatBDT(payment?.amount ?? '0')}</strong> reached the
                    receiving account below, then verify. This credits the order instantly and
                    notifies the customer.
                  </p>
                  <ul className="space-y-1 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    <li>Order: {payment?.order.orderNumber}</li>
                    <li>TrxID: {payment?.transactionId ?? '—'}</li>
                    <li>Sender: {payment?.senderNumber ?? '—'}</li>
                    <li>
                      Account: {payment?.accountNumberSnapshot ?? 'historical details unavailable'}
                    </li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => void review('VERIFIED')}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Verify payment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rejection — reason required by the shared schema (5–2000 chars) */}
        <Dialog open={rejectOpen} onOpenChange={(next) => !busy && setRejectOpen(next)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject this payment?</DialogTitle>
              <DialogDescription>
                The customer sees your reason and can submit a corrected payment. The payment is not
                deleted and order accounting is untouched.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {payment?.order.orderNumber} · {formatBDT(payment?.amount ?? '0')} · TrxID{' '}
                {payment?.transactionId ?? '—'}
              </p>
              <Textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
                rows={4}
                maxLength={2000}
                placeholder="Why is this payment rejected? (5–2000 characters, shown to the customer)"
                aria-invalid={Boolean(reasonError)}
              />
              {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={submitReject} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reject payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
