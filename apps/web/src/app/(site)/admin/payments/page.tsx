'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, CircleDollarSign, Clock, ExternalLink, Image as ImageIcon, Search, Wallet, XCircle } from 'lucide-react';
import type { AdminPaymentQueueDto, AdminPaymentStatsDto, AdminPaymentDto } from '@tsh/shared';
import { PAYMENT_METHODS, PAYMENT_STATUSES, formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PaymentMethodBadge, StatusBadge, statusLabel } from '@/components/status-badge';
import { PaymentDetailSheet } from '@/components/admin/payment-detail-sheet';
import { cn } from '@/lib/utils';

/**
 * Stage 6 admin payment dashboard: summary cards, search + filters (status /
 * method / date range), server-side paginated queue, and the review sheet.
 * All data comes from the backend — the page never aggregates a global count
 * from the visible page.
 */

const PAGE_SIZE = 15;

type Stats = AdminPaymentStatsDto;
type Queue = AdminPaymentQueueDto;

const STAT_CARDS: Array<{
  key: Stats['counts'] extends Record<infer K, number> ? K : never;
  label: string;
  icon: typeof Wallet;
  hint?: string;
}> = [
  { key: 'PENDING', label: 'Pending', icon: Clock },
  { key: 'SUBMITTED', label: 'Awaiting review', icon: Wallet },
  { key: 'VERIFIED', label: 'Verified', icon: CheckCircle2 },
  { key: 'REJECTED', label: 'Rejected', icon: XCircle },
];

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState<string>('all');
  const [method, setMethod] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<AdminPaymentDto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function onSearch(value: string) {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => { setDebounced(value.trim()); setPage(1); }, 350));
  }

  const filters = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(status !== 'all' ? { status } : {}),
    ...(method !== 'all' ? { method } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(debounced ? { search: debounced } : {}),
  });

  const { data: stats, mutate: mutateStats } = useSWR<Stats>('/admin/payments/stats', () =>
    api.get<Stats>('/admin/payments/stats'),
  );

  const { data: queue, isLoading, mutate: mutateQueue } = useSWR<Queue>(
    `/admin/payments?${filters.toString()}`,
    () => api.get<Queue>(`/admin/payments?${filters.toString()}`),
    { keepPreviousData: true },
  );

  const hasFilters = status !== 'all' || method !== 'all' || Boolean(from) || Boolean(to) || Boolean(debounced);

  function resetFilters() {
    setStatus('all');
    setMethod('all');
    setFrom('');
    setTo('');
    setSearch('');
    setDebounced('');
    setPage(1);
  }

  function openDetail(payment: AdminPaymentDto) {
    setSelected(payment);
    setSheetOpen(true);
  }

  async function afterReview() {
    await Promise.all([mutateQueue(), mutateStats()]);
  }

  const items = queue?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-5 w-5 text-primary" /> Payment management
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Every manual payment is reviewed by a founder. Match the TrxID against your MFS/bank
            records before verifying — submission alone never confirms an order as paid.
          </p>
        </div>
      </div>

      {/* Summary cards — server aggregates, clickable to filter */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => {
              setStatus(card.key);
              setPage(1);
            }}
            className={cn(
              'text-left transition-shadow hover:shadow-md rounded-xl',
              status === card.key && 'ring-2 ring-primary',
            )}
          >
            <StatCard
              icon={card.icon}
              label={card.label}
              value={stats ? stats.counts[card.key] : null}
            />
          </button>
        ))}
        <button
          type="button"
          onClick={resetFilters}
          className={cn('text-left transition-shadow hover:shadow-md rounded-xl', !hasFilters && 'ring-2 ring-primary')}
        >
          <StatCard
            icon={CircleDollarSign}
            label="Total payments"
            value={stats ? stats.total : null}
            hint={stats ? `${formatBDT(stats.awaitingAmount)} awaiting` : undefined}
          />
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="TrxID, order #, customer, payment id…"
            className="w-64 pl-9"
            aria-label="Search payments"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground" htmlFor="pf-status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => { setStatus(v); setPage(1); }}
          >
            <SelectTrigger id="pf-status" className="w-40" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground" htmlFor="pf-method">Method</Label>
          <Select
            value={method}
            onValueChange={(v) => { setMethod(v); setPage(1); }}
          >
            <SelectTrigger id="pf-method" className="w-40" aria-label="Method filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m === 'OTHER' ? 'Other / custom rails' : m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground" htmlFor="pf-from">From</Label>
          <Input
            id="pf-from"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground" htmlFor="pf-to">To</Label>
          <Input
            id="pf-to"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="w-36"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      <p className="-mt-4 text-[11px] text-muted-foreground">
        Dates are whole UTC days (from 00:00 to 23:59).
      </p>

      {/* Queue */}
      {isLoading && !queue ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Search}
          title={hasFilters ? 'No payments match' : 'No payments yet'}
          description={
            hasFilters
              ? 'Try changing or resetting the filters.'
              : 'Customer payment submissions will appear here for review.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Customer</th>
                    <th className="p-3 font-medium">Order</th>
                    <th className="p-3 font-medium">Method / account</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">TrxID</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Submitted</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <PaymentRow key={p.id} payment={p} onOpen={() => openDetail(p)} />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {items.map((p) => (
              <MobilePaymentCard key={p.id} payment={p} onOpen={() => openDetail(p)} />
            ))}
          </div>

          {queue && queue.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {queue.page} of {queue.totalPages} · {queue.total} payment{queue.total === 1 ? '' : 's'}
              </span>
              <Button variant="outline" size="sm" disabled={page >= queue.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <PaymentDetailSheet
        key={selected?.id ?? 'none'}
        payment={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onReviewed={afterReview}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: number | null; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3 py-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-6 w-10" />
          ) : (
            <p className="text-lg font-semibold leading-tight">{value}</p>
          )}
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment, onOpen }: { payment: AdminPaymentDto; onOpen: () => void }) {
  const reviewable = payment.status === 'PENDING' || payment.status === 'SUBMITTED';
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="p-3">
        <p>{payment.order.customerName}</p>
        <p className="text-xs text-muted-foreground">{payment.order.customerEmail}</p>
      </td>
      <td className="p-3">
        <a
          href={`/admin/orders/${payment.order.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {payment.order.orderNumber} <ExternalLink className="h-3 w-3" />
        </a>
        <p className="max-w-48 truncate text-xs text-muted-foreground">{payment.order.title}</p>
      </td>
      <td className="p-3">
        <PaymentMethodBadge method={payment.method} />
        <p className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground">
          {payment.methodLabelSnapshot ?? payment.methodKeySnapshot ?? 'Legacy submission'}
        </p>
      </td>
      <td className="p-3 font-semibold">{formatBDT(payment.amount)}</td>
      <td className="p-3">
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {payment.transactionId ?? '—'}
        </code>
      </td>
      <td className="p-3">
        <StatusBadge status={payment.status} />
        {payment.hasScreenshot && (
          <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <ImageIcon className="h-3 w-3" /> screenshot
          </span>
        )}
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        {new Date(payment.createdAt).toLocaleString()}
      </td>
      <td className="p-3 text-right">
        <Button variant={reviewable ? 'default' : 'outline'} size="sm" onClick={onOpen}>
          {reviewable ? 'Review' : 'Details'}
        </Button>
      </td>
    </tr>
  );
}

function MobilePaymentCard({ payment, onOpen }: { payment: AdminPaymentDto; onOpen: () => void }) {
  const reviewable = payment.status === 'PENDING' || payment.status === 'SUBMITTED';
  return (
    <Card size="sm">
      <CardContent className="space-y-2 py-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <PaymentMethodBadge method={payment.method} />
            <StatusBadge status={payment.status} />
            {payment.hasScreenshot && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> screenshot
              </span>
            )}
          </div>
          <p className="text-lg font-bold">{formatBDT(payment.amount)}</p>
        </div>
        <p className="text-muted-foreground">
          {payment.order.customerName} —{' '}
          <a
            href={`/admin/orders/${payment.order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {payment.order.orderNumber} <ExternalLink className="h-3 w-3" />
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          TrxID <code className="rounded bg-muted px-1 py-0.5 font-mono">{payment.transactionId ?? '—'}</code>
          {' · '}{new Date(payment.createdAt).toLocaleString()}
        </p>
        <Button variant={reviewable ? 'default' : 'outline'} size="sm" className="w-full" onClick={onOpen}>
          {reviewable ? 'Review payment' : 'View details'}
        </Button>
      </CardContent>
    </Card>
  );
}
