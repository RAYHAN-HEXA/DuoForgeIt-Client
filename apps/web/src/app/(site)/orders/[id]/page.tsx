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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { OrderTracker } from '@/components/order-tracker';
import { StatusBadge, statusLabel } from '@/components/status-badge';
import { RequireAuth } from '@/components/guards';

function OrderDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, error, mutate } = useSWR<OrderDto>(
    id ? `/orders/${id}` : null,
    () => api.get<OrderDto>(`/orders/${id}`),
    { revalidateOnFocus: false },
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
        <Card>
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
  const unverifiedPayment = order.payments.find((p) => p.status === 'SUBMITTED' || p.status === 'PENDING');
  const rejectedPayment = order.payments.find((p) => p.status === 'REJECTED');

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/orders"><ArrowLeft className="h-4 w-4" /> My orders</Link>
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
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
      </div>

      {cancellable && <CancelSection orderId={order.id} onDone={() => void mutate()} />}

      {/* Progress tracker */}
      <Card>
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
        <Card>
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
        <Card>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.payments.length === 0 && (
              <p className="text-sm text-muted-foreground">No payment submitted yet.</p>
            )}
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.method === 'BANK_TRANSFER' ? 'Bank transfer' : p.method}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.transactionId ? `Txn: ${p.transactionId} · ` : ''}
                    {new Date(p.createdAt).toLocaleString()}
                  </p>
                  {p.adminNote && <p className="mt-1 text-xs text-muted-foreground">Note: {p.adminNote}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatBDT(p.amount)}</p>
                  <StatusBadge status={p.status} className="mt-1" />
                </div>
              </div>
            ))}
            {canPay && !unverifiedPayment && <PaymentSection orderId={order.id} rejected={rejectedPayment} onDone={() => void mutate()} />}
          </CardContent>
        </Card>

        {/* Revisions */}
        <Card>
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
        <Card className="lg:col-span-2">
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
          <Card className="lg:col-span-2">
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
          <Card className="lg:col-span-2">
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

function PaymentSection({ orderId, rejected, onDone }: { orderId: string; rejected?: { transactionId: string | null; adminNote: string | null }; onDone: () => void }) {
  const [method, setMethod] = useState('BKASH');
  const [transactionId, setTransactionId] = useState(rejected?.transactionId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/payments`, { method, transactionId: transactionId.trim() });
      toast.success('Payment submitted for verification');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error('Could not submit payment', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Wallet className="h-4 w-4" /> {rejected ? 'Resubmit payment' : 'Submit payment'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit your payment</DialogTitle>
        </DialogHeader>
        {rejected && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Previous transaction was rejected{rejected.adminNote ? `: ${rejected.adminNote}` : '. Check the ID and resubmit.'}
          </p>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Payment method</Label>
            <RadioGroup value={method} onValueChange={setMethod} className="grid grid-cols-2 gap-2">
              {['BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER'].map((m) => (
                <Label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={m} /> {m === 'BANK_TRANSFER' ? 'Bank transfer' : m.charAt(0) + m.slice(1).toLowerCase()}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="txn">Transaction ID</Label>
            <Input
              id="txn"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. BKASH8H2K9L0P"
              minLength={6}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">Copy the exact transaction/trx ID from your payment receipt.</p>
          </div>
          <Button className="w-full" onClick={submit} disabled={submitting || transactionId.trim().length < 6}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit for verification
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
