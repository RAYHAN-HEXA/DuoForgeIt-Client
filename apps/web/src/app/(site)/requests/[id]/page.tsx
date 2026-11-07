'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Clock, FileText, Loader2, PartyPopper } from 'lucide-react';
import type { QuotationAcceptResultDto, ServiceRequestDetailDto } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { RequireAuth } from '@/components/guards';

function label(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export default function RequestDetailPage() {
  return (
    <RequireAuth>
      <RequestDetailContent />
    </RequireAuth>
  );
}

function RequestDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { data, isLoading, error, mutate } = useSWR<ServiceRequestDetailDto>(
    id ? `/marketplace/requests/${id}` : null,
    () => api.get<ServiceRequestDetailDto>(`/marketplace/requests/${id}`),
  );
  // One key per accept attempt — retries reuse it so a retried accept can
  // never create a second order (Order.idempotencyKey is unique).
  const acceptKeyRef = useRef<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [accepted, setAccepted] = useState<QuotationAcceptResultDto['order'] | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // Refresh the expiry hint after mount; accept is re-validated server-side.
  useEffect(() => {
    const t = setTimeout(() => setNowMs(Date.now()), 1000);
    return () => clearTimeout(t);
  }, []);

  if (isLoading && !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardContent className="p-6">
            <p className="font-medium">Request not available</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/requests">Back to my requests</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const liveQuotation = data.quotations.find((q) => q.status === 'SENT');
  // Impurity note: server re-validates the window on accept, so a slightly
  // stale client clock only affects the visual hint, never correctness.
  const expired = liveQuotation ? new Date(liveQuotation.validUntil).getTime() < nowMs : false;
  const createdOrder = data.status === 'ACCEPTED_AWAITING_PAYMENT' || data.status === 'ORDER_CREATED';

  async function accept() {
    if (!liveQuotation) return;
    acceptKeyRef.current ??= crypto.randomUUID();
    setAccepting(true);
    try {
      const res = await api.post<QuotationAcceptResultDto>(
        `/marketplace/requests/${id}/quotations/accept`,
        { idempotencyKey: acceptKeyRef.current },
      );
      setAccepted(res.order);
      toast.success(`Order ${res.order.orderNumber} created`);
      await mutate();
      // Payment happens on the order page — the existing bKash flow.
      router.push(`/orders/${res.order.id}`);
    } catch (err) {
      toast.error('Could not accept the quotation', { description: errorMessage(err) });
    } finally {
      setAccepting(false);
    }
  }

  async function decline() {
    if (!liveQuotation || declineReason.trim().length < 5) return;
    try {
      await api.post(`/marketplace/requests/${id}/quotations/decline`, { reason: declineReason.trim() });
      setDeclineOpen(false);
      setDeclineReason('');
      toast.success('Quotation declined — we can send a revised one');
      await mutate();
    } catch (err) {
      toast.error('Could not decline', { description: errorMessage(err) });
    }
  }

  async function cancelRequest() {
    try {
      await api.post(`/marketplace/requests/${id}/cancel`, { note: 'Cancelled by customer' });
      toast.success('Request cancelled');
      router.push('/requests');
    } catch (err) {
      toast.error('Could not cancel', { description: errorMessage(err) });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{data.referenceNo}</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileText className="h-5 w-5 text-primary" /> {data.serviceName}
        </h1>
        <Badge variant="outline" className="mt-2">{label(data.status)}</Badge>
      </div>

      {accepted && (
        <Card className="border-primary/40 bg-primary/[0.04]">
          <CardContent className="flex items-start gap-3 p-4">
            <PartyPopper className="h-5 w-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Order {accepted.orderNumber} created — ৳{accepted.totalAmount}</p>
              <p className="text-muted-foreground">Pay via bKash from the order page, then submit your Transaction ID.</p>
              <Button asChild size="sm" className="mt-2">
                <Link href={`/orders/${accepted.id}`}>Go to payment</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quotation */}
      {data.quotations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.quotations.map((q) => (
              <div key={q.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Version {q.version}</p>
                  <Badge variant={q.status === 'SENT' && !expired ? 'secondary' : 'outline'}>{label(q.status)}</Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{item.label}</span>
                      <span className="font-medium">৳{item.amount}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 border-t pt-1 font-semibold">
                    <span>Total</span>
                    <span>৳{q.price}</span>
                  </li>
                </ul>
                {q.scopeText && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{q.scopeText}</p>}
                {q.estimatedTimeline && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> {q.estimatedTimeline}
                  </p>
                )}
                {q.status === 'SENT' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valid until {new Date(q.validUntil).toLocaleString()}
                  </p>
                )}
                {q.declineReason && <p className="mt-2 text-xs text-destructive">Declined: {q.declineReason}</p>}
                {q.status === 'SENT' && !expired && !createdOrder && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => void accept()} disabled={accepting}>
                      {accepting && <Loader2 className="h-4 w-4 animate-spin" />} Accept & create order
                    </Button>
                    <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={accepting}>
                      Decline
                    </Button>
                  </div>
                )}
                {q.status === 'SENT' && expired && (
                  <p className="mt-2 text-xs text-destructive">Expired — contact us for a fresh quotation.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Requirements / answers */}
      {Object.keys(data.answers ?? {}).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your requirements</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(data.answers).map(([key, value]) => (
              <p key={key}>
                <span className="font-medium">{key.replaceAll('_', ' ')}:</span>{' '}
                <span className="text-muted-foreground">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
              </p>
            ))}
            {data.notes && <p className="pt-2 text-muted-foreground">{data.notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.statusHistory.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p>
                  {h.fromStatus ? `${label(h.fromStatus)} → ` : ''}
                  <span className="font-medium">{label(h.toStatus)}</span>
                  {h.actorName ? ` · ${h.actorName}` : ''}
                </p>
                {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {data.statusHistory.length === 0 && <p className="text-sm text-muted-foreground">No updates yet.</p>}
        </CardContent>
      </Card>

      {['REQUEST_SUBMITTED', 'UNDER_REVIEW', 'DIAGNOSIS_SCHEDULED', 'DIAGNOSIS_SENT', 'QUOTATION_DECLINED', 'QUOTATION_EXPIRED'].includes(data.status) && (
        <Button variant="ghost" size="sm" onClick={() => void cancelRequest()}>
          Cancel this request
        </Button>
      )}

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              Tell us why (at least 5 characters) so we can send a revised quotation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. The budget is higher than expected — can we scope down?"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeclineOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={declineReason.trim().length < 5}
              onClick={() => void decline()}
            >
              Decline quotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
