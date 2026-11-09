'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  PackageOpen,
  Paperclip,
  Star,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { OrderDto } from '@tsh/shared';
import { CUSTOMER_CANCELLABLE, formatBDT } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { OrderTracker } from '@/components/order-tracker';
import { StatusBadge, PaymentMethodBadge, statusLabel } from '@/components/status-badge';
import { OrderPaymentSection, PaymentStatusBanner, orderOutstanding, moneyToCents, ZERO_CENTS } from '@/components/order-payment';
import { RequireAuth } from '@/components/guards';
import { Reveal } from '@/components/motion/reveal';

function OrderDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, error, mutate } = useSWR<OrderDto>(
    id ? `/orders/${id}` : null,
    () => api.get<OrderDto>(`/orders/${id}`),
    // Poll so payment review results reach the customer without a manual
    // reload — the under-review banner promises automatic updates.
    { revalidateOnFocus: false, refreshInterval: 30_000 },
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-12 sm:px-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card className="card-lift">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Order not found</p>
            <p className="text-sm text-muted-foreground">It may belong to another account or no longer exist.</p>
            <Button variant="outline" asChild><Link href="/orders">Back to orders</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cancellable = CUSTOMER_CANCELLABLE.includes(order.status as never);
  const canPay = !['CANCELLED', 'REJECTED'].includes(order.status);
  const canRevise = ['IN_PROGRESS', 'QUALITY_REVIEW', 'DELIVERED'].includes(order.status);
  const canReview = ['COMPLETED', 'DELIVERED'].includes(order.status) && !order.review;
  const outstandingCents = moneyToCents(orderOutstanding(order));
  const unverifiedPayment = order.payments.find((p) => p.status === 'SUBMITTED' || p.status === 'PENDING');
  // Latest rejection — retry cycles can accumulate several rejected payments.
  const rejectedPayment = [...order.payments].filter((p) => p.status === 'REJECTED').at(-1);
  const showPaymentForm = canPay && !unverifiedPayment && outstandingCents > ZERO_CENTS;
  const fullyPaid = outstandingCents <= ZERO_CENTS;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/orders"><ArrowLeft className="h-4 w-4" /> My orders</Link>
      </Button>

      {/* Header */}
      <Reveal className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{order.title}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.orderNumber} · submitted {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Due <span className="font-semibold">{new Date(order.deadline).toLocaleDateString()}</span>
        </div>
      </Reveal>

      {cancellable && <CancelSection orderId={order.id} onDone={() => void mutate()} />}

      {/* Progress tracker */}
      <Card className="card-lift">
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <OrderTracker status={order.status} />
          {order.statusHistory.length > 1 && (
            <div className="space-y-2 border-t pt-4">
              {[...order.statusHistory].reverse().slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{statusLabel(h.toStatus)}</span>
                    {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Items */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="text-base">Items & pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.serviceName} × {item.quantity}</p>
                    <p className="text-xs text-muted-foreground">{formatBDT(item.basePrice)} base</p>
                    {item.optionSnapshots.length > 0 && (
                      <ul className="mt-1 text-sm text-muted-foreground">
                        {item.optionSnapshots.map((o, i) => (
                          <li key={i}>+ {o.label} ({formatBDT(o.priceDelta)})</li>
                        ))}
                      </ul>
                    )}
                    {item.requirements && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.requirements}</p>
                    )}
                  </div>
                  <p className="font-semibold">{formatBDT(item.lineTotal)}</p>
                </div>
                <Separator />
              </div>
            ))}
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{formatBDT(order.totalAmount)}</span>
            </div>
            {order.notes && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{order.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Team */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="text-base">Your team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <UserRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{order.assignedFounder?.displayName ?? 'Awaiting assignment'}</p>
                <p className="text-xs text-muted-foreground">
                  {order.assignedFounder
                    ? 'Project lead'
                    : order.preferredFounder
                      ? `You preferred ${order.preferredFounder.displayName} — auto-assignment pending`
                      : 'Auto-assign — a founder picks this up shortly'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fullyPaid && order.payments.length > 0 && (
              <PaymentStatusBanner payments={order.payments} fullyPaid />
            )}
            {!fullyPaid && unverifiedPayment && (
              <PaymentStatusBanner payments={order.payments} fullyPaid={false} />
            )}
            {order.payments.length === 0 && (
              <p className="text-sm text-muted-foreground">No payment submitted yet.</p>
            )}
            {[...order.payments].reverse().map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <PaymentMethodBadge method={p.method} /> {statusLabel(p.status)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.transactionId ? `TrxID: ${p.transactionId} · ` : ''}
                    {p.senderNumber ? `from ${p.senderNumber} · ` : ''}
                    {new Date(p.createdAt).toLocaleString()}
                  </p>
                  {p.hasScreenshot && (
                    <p className="text-xs text-muted-foreground">Screenshot attached</p>
                  )}
                  {(p.status === 'REJECTED' || p.status === 'VERIFIED') && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.status === 'REJECTED'
                        ? 'Rejected'
                        : 'Verified'}{' '}
                      {new Date((p.status === 'REJECTED' ? p.rejectedAt : p.verifiedAt) ?? p.createdAt).toLocaleString()}
                    </p>
                  )}
                  {p.status === 'REJECTED' && (p.rejectionReason ?? p.adminNote) && (
                    <p className="mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      Reason: {p.rejectionReason ?? p.adminNote}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{formatBDT(p.amount)}</p>
                  <StatusBadge status={p.status} className="mt-1" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Manual payment flow — account selection, instructions and submission */}
        {showPaymentForm && (
          <OrderPaymentSection
            order={order}
            rejectedPayment={rejectedPayment}
            onDone={() => void mutate()}
          />
        )}

        {/* Revisions */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-4 w-4" /> Revisions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.revisions.length === 0 && (
              <p className="text-sm text-muted-foreground">No revision requests.</p>
            )}
            {order.revisions.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{new Date(r.createdAt).toLocaleDateString()}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1.5 text-muted-foreground">{r.description}</p>
                {r.adminResponse && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-muted-foreground">Response: {r.adminResponse}</p>
                )}
              </div>
            ))}
            {canRevise && <RevisionSection orderId={order.id} onDone={() => void mutate()} />}
          </CardContent>
        </Card>

        {/* Files */}
        <Card className="card-lift lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Files</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Your attachments</p>
              {order.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-2">
                  {order.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.fileName}</span>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">{a.kind}</Badge>
                      </span>
                      {a.downloadUrl && (
                        <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:underline">
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Deliverables</p>
              {order.deliverables.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {['COMPLETED', 'DELIVERED'].includes(order.status) ? 'Final files appear here.' : 'Deliverables arrive when the project completes.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {order.deliverables.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate font-medium">{d.title}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">v{d.version}</Badge>
                      </span>
                      {d.downloadUrl ? (
                        <a href={d.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-primary hover:underline">
                          <Download className="h-4 w-4" /> Download
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">unavailable</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Review */}
        {canReview && (
          <Card className="card-lift lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4" /> Rate this project
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewSection orderId={order.id} onDone={() => void mutate()} />
            </CardContent>
          </Card>
        )}
        {order.review && (
          <Card className="card-lift lg:col-span-2">
            <CardContent className="flex items-center gap-3 p-5">
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < order.review!.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{order.review.comment ?? 'Thanks for your review!'}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function RevisionSection({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/revisions`, { description: description.trim() });
      toast.success('Revision requested');
      setOpen(false);
      setDescription('');
      onDone();
    } catch (err) {
      toast.error('Could not request revision', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <MessageSquarePlus className="h-4 w-4" /> Request a revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a revision</DialogTitle>
        </DialogHeader>
        <Textarea
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what should change: sections, styling, functionality…"
          maxLength={4000}
        />
        <Button className="w-full" onClick={submit} disabled={submitting || description.trim().length < 10}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Send request
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ReviewSection({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/review`, { rating, comment: comment.trim() || undefined });
      toast.success('Thanks for your review!');
      onDone();
    } catch (err) {
      toast.error('Could not submit review', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <button key={i} type="button" onClick={() => setRating(i + 1)} aria-label={`${i + 1} stars`} className="p-0.5">
            <Star className={`h-6 w-6 transition-colors ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300'}`} />
          </button>
        ))}
      </div>
      <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the experience? (optional)" maxLength={2000} />
      <Button onClick={submit} disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit review
      </Button>
    </div>
  );
}

function CancelSection({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/cancel`, { reason: reason.trim() });
      toast.success('Order cancelled');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error('Could not cancel', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          <XCircle className="h-4 w-4" /> Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">You can cancel before the project is approved. Verified payments are refunded.</p>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you cancelling? (helps us improve)" maxLength={500} />
        <Button variant="destructive" className="w-full" onClick={submit} disabled={submitting || reason.trim().length < 5}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Cancel order
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}
