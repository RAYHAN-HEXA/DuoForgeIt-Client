'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, ExternalLink, Wallet, X } from 'lucide-react';
import type { AdminPaymentDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PaymentMethodBadge, StatusBadge } from '@/components/status-badge';

const FILTERS = ['SUBMITTED', 'VERIFIED', 'REJECTED', 'PENDING', 'all'] as const;

export default function AdminPaymentsPage() {
  const [filter, setFilter] = useState<string>('SUBMITTED');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<{ items: AdminPaymentDto[] }>(
    `/admin/payments${filter === 'all' ? '' : `?status=${filter}`}`,
    () => api.get<{ items: AdminPaymentDto[] }>(`/admin/payments${filter === 'all' ? '' : `?status=${filter}`}`),
    { keepPreviousData: true },
  );

  async function review(id: string, decision: 'VERIFIED' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.patch(`/admin/payments/${id}`, { decision, note: notes[id]?.trim() || undefined });
      toast.success(decision === 'VERIFIED' ? 'Payment verified — customer notified' : 'Payment rejected — customer notified');
      await mutate();
    } catch (err) {
      toast.error('Review failed', { description: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-5 w-5 text-primary" /> Payment verification
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Match transaction IDs against bKash/Nagad/Rocket/bank records before verifying.
          </p>
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {f === 'all' ? 'All' : f.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <PaymentMethodBadge method={p.method} />
                      <StatusBadge status={p.status} />
                      <Link href={`/admin/orders/${p.order.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        {p.order.orderNumber} <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.order.customerName} — “{p.order.title}”
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Txn: <code className="rounded bg-muted px-1 py-0.5 font-mono">{p.transactionId ?? '—'}</code>
                      {p.verifiedAt ? ` · verified ${new Date(p.verifiedAt).toLocaleString()}` : ` · submitted ${new Date(p.createdAt).toLocaleString()}`}
                    </p>
                  </div>
                  <p className="text-xl font-bold">{formatBDT(p.amount)}</p>
                </div>
                {p.status === 'SUBMITTED' && (
                  <div className="flex gap-2 border-t pt-3">
                    <Input
                      value={notes[p.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Internal note (sent to customer on rejection)…"
                      className="flex-1"
                      maxLength={2000}
                    />
                    <Button variant="destructive" onClick={() => void review(p.id, 'REJECTED')} disabled={busyId === p.id}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                    <Button onClick={() => void review(p.id, 'VERIFIED')} disabled={busyId === p.id}>
                      <Check className="h-4 w-4" /> Verify
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Wallet} title="Queue is clear" description={`No ${filter === 'all' ? '' : filter.toLowerCase() + ' '}payments.`} />
      )}
    </div>
  );
}
