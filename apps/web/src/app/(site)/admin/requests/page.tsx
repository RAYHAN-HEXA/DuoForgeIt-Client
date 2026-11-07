'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { FileText, Loader2, Send } from 'lucide-react';
import type { AdminServiceRequestDetailDto, QuotationDto, ServiceRequestSummaryDto } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState } from '@/components/empty-state';

type ListRow = ServiceRequestSummaryDto & { customerName: string; customerEmail: string };

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'REQUEST_SUBMITTED', label: 'New' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'QUOTATION_SENT', label: 'Quoted' },
  { value: 'QUOTATION_DECLINED', label: 'Declined' },
  { value: 'ORDER_CREATED', label: 'Ordered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

function label(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

/** Next status actions the admin can take from each state (REQUEST_TRANSITIONS). */
const ACTIONS: Record<string, Array<{ to: string; label: string }>> = {
  REQUEST_SUBMITTED: [
    { to: 'UNDER_REVIEW', label: 'Start review' },
    { to: 'REJECTED', label: 'Reject' },
    { to: 'CANCELLED', label: 'Cancel' },
  ],
  UNDER_REVIEW: [{ to: 'QUOTATION_SENT', label: 'Mark quoted' }],
  DIAGNOSIS_SCHEDULED: [{ to: 'DIAGNOSIS_SENT', label: 'Diagnosis sent' }],
  DIAGNOSIS_SENT: [{ to: 'ACCEPTED_AWAITING_PAYMENT', label: 'Mark accepted' }, { to: 'REJECTED', label: 'Reject' }],
  QUOTATION_SENT: [{ to: 'ACCEPTED_AWAITING_PAYMENT', label: 'Mark accepted' }],
  QUOTATION_DECLINED: [{ to: 'QUOTATION_SENT', label: 'Re-open for quote' }],
  QUOTATION_EXPIRED: [{ to: 'QUOTATION_SENT', label: 'Re-quote' }],
  ACCEPTED_AWAITING_PAYMENT: [{ to: 'ORDER_CREATED', label: 'Mark ordered' }],
};

export default function AdminRequestsPage() {
  const [status, setStatus] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, mutate } = useSWR<{ items: ListRow[] }>(
    `/admin/requests?pageSize=50${status !== 'ALL' ? `&status=${status}` : ''}`,
    () => api.get<{ items: ListRow[] }>(`/admin/requests?pageSize=50${status !== 'ALL' ? `&status=${status}` : ''}`),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-5 w-5 text-primary" /> Service requests
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Review requests, send quotations, and track acceptance through to orders.
          </p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => setOpenId(r.id)}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-muted-foreground">{r.referenceNo}</p>
                    <Badge variant={r.status === 'ORDER_CREATED' ? 'default' : r.status === 'QUOTATION_SENT' ? 'secondary' : 'outline'}>
                      {label(r.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium">{r.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.customerName} ({r.customerEmail})
                    {r.quotedPrice ? ` · quoted ৳${r.quotedPrice}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileText} title="No requests" description="Marketplace service requests will appear here." />
      )}

      <RequestDetailSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => void mutate()} />
    </div>
  );
}

function RequestDetailSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, mutate: mutateDetail, isLoading } = useSWR<AdminServiceRequestDetailDto>(
    id ? `/admin/requests/${id}` : null,
    () => api.get<AdminServiceRequestDetailDto>(`/admin/requests/${id}`),
  );
  const [busy, setBusy] = useState(false);

  async function moveStatus(to: string) {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/admin/requests/${id}/status`, { status: to, note: `Moved to ${to} by admin` });
      toast.success(`Request moved to ${to.replaceAll('_', ' ').toLowerCase()}`);
      await mutateDetail();
      onChanged();
    } catch (err) {
      toast.error('Could not update status', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{data?.referenceNo ?? 'Request'}</SheetTitle>
        </SheetHeader>
        {isLoading && !data ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : data ? (
          <div className="space-y-5 px-4 pb-8">
            <div className="text-sm">
              <p className="font-medium">{data.serviceName}</p>
              <p className="text-muted-foreground">{data.customerName} · {data.customerEmail}</p>
              <Badge variant="outline" className="mt-1">{label(data.status)}</Badge>
            </div>

            {Object.entries(data.answers ?? {}).length > 0 && (
              <div className="rounded-lg border p-3 text-sm">
                {Object.entries(data.answers).map(([key, value]) => (
                  <p key={key}>
                    <span className="font-medium">{key.replaceAll('_', ' ')}:</span>{' '}
                    <span className="text-muted-foreground">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
                  </p>
                ))}
                {data.notes && <p className="pt-2 text-muted-foreground">{data.notes}</p>}
              </div>
            )}

            {(ACTIONS[data.status] ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(ACTIONS[data.status] ?? []).map((a) => (
                  <Button key={a.to} variant="outline" size="sm" disabled={busy} onClick={() => void moveStatus(a.to)}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} {a.label}
                  </Button>
                ))}
              </div>
            )}

            <QuotationComposer requestId={id ?? ''} quotations={data.quotations} onChanged={() => { void mutateDetail(); onChanged(); }} />

            <div>
              <p className="mb-2 text-sm font-medium">History</p>
              <div className="space-y-2 text-sm">
                {data.statusHistory.map((h, i) => (
                  <p key={i} className="text-muted-foreground">
                    {h.fromStatus ? `${label(h.fromStatus)} → ` : ''}
                    <span className="font-medium text-foreground">{label(h.toStatus)}</span>
                    {' · '}{new Date(h.createdAt).toLocaleString()}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function QuotationComposer({ requestId, quotations, onChanged }: { requestId: string; quotations: QuotationDto[]; onChanged: () => void }) {
  const [items, setItems] = useState<Array<{ label: string; amount: string }>>([{ label: '', amount: '' }]);
  const [scope, setScope] = useState('');
  const [timeline, setTimeline] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const draft = quotations.find((q) => q.status === 'DRAFT');
  const total = items.reduce((sum, i) => sum + (Number.parseFloat(i.amount) || 0), 0).toFixed(2);
  const valid = items.length > 0 && items.every((i) => i.label.trim() && Number.parseFloat(i.amount) > 0);

  async function createDraft() {
    setBusy('create');
    try {
      await api.post(`/admin/requests/${requestId}/quotations`, {
        items: items.map((i) => ({ label: i.label.trim(), amount: Number.parseFloat(i.amount).toFixed(2) })),
        scopeText: scope.trim() || undefined,
        estimatedTimeline: timeline.trim() || undefined,
        deliverables: [],
      });
      toast.success('Draft quotation created');
      setItems([{ label: '', amount: '' }]);
      onChanged();
    } catch (err) {
      toast.error('Could not create quotation', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft() {
    if (!draft) return;
    setBusy('send');
    try {
      await api.patch(`/admin/quotations/${draft.id}/send`);
      toast.success('Quotation sent — the customer has been notified');
      onChanged();
    } catch (err) {
      toast.error('Could not send', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 text-sm font-medium">Quotations</p>

      <div className="space-y-2">
        {quotations.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>v{q.version} · ৳{q.price} · <Badge variant="outline" className="text-[10px]">{label(q.status)}</Badge></span>
            {q.status === 'DRAFT' && (
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void sendDraft()}>
                {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </Button>
            )}
          </div>
        ))}
      </div>

      {!draft && (
        <div className="mt-3 space-y-2">
          <Label className="text-xs">Quote lines (label + amount in BDT)</Label>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={item.label}
                onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))}
                placeholder={`Line ${idx + 1} description`}
              />
              <Input
                className="w-32"
                type="number"
                min="1"
                value={item.amount}
                onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, amount: e.target.value } : it)))}
                placeholder="৳"
              />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setItems([...items, { label: '', amount: '' }])}>
            + Add line
          </Button>
          <div className="grid gap-2">
            <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope summary (optional)" maxLength={4000} />
            <Input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="Estimated timeline (optional, e.g. 2–3 weeks)" maxLength={160} />
          </div>
          <p className="text-xs text-muted-foreground">Total: ৳{total}</p>
          <Button size="sm" disabled={!valid || busy !== null} onClick={() => void createDraft()}>
            {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />} Create draft quotation
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Valid for 7 days after sending. Sending notifies the customer; they accept → order → pay via bKash.
          </p>
        </div>
      )}
    </div>
  );
}
