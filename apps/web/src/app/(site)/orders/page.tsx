'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import { ArrowRight, PackageSearch } from 'lucide-react';
import type { OrderStatus } from '@tsh/shared';
import type { OrderSummaryDto, Paginated } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { StatusBadge } from '@/components/status-badge';
import { RequireAuth } from '@/components/guards';
import { useAuth } from '@/hooks/use-auth';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const { user, loading } = useAuth();

  return (
    <RequireAuth>
      <OrdersContent enabled={!loading && Boolean(user)} />
    </RequireAuth>
  );
}

function OrdersContent({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(status !== 'all' ? { status } : {}) });
  const { data, isLoading } = useSWR<Paginated<OrderSummaryDto>>(
    enabled ? `/orders?${query.toString()}` : null,
    () => api.get<Paginated<OrderSummaryDto>>(`/orders?${query.toString()}`),
    { keepPreviousData: true },
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Reveal>
        <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
        <p className="mt-1 text-muted-foreground">Track progress, download deliverables, request revisions.</p>
      </Reveal>

      <Reveal delay={0.05} className="mt-6 flex flex-wrap gap-2">
        <Chip active={status === 'all'} onClick={() => { setStatus('all'); setPage(1); }}>All</Chip>
        {(['SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'CANCELLED'] as OrderStatus[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }}>
            {s === 'SUBMITTED' ? 'New' : s === 'IN_PROGRESS' ? 'In progress' : s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ')}
          </Chip>
        ))}
      </Reveal>

      <div className="mt-6 space-y-3">
        {isLoading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : data && data.items.length > 0 ? (
          <>
            <Stagger className="space-y-3">
              {data.items.map((o) => (
                <StaggerItem key={o.id}>
                  <Link href={`/orders/${o.id}`} className="group block">
                    <Card className="card-lift hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{o.title}</p>
                            {o.paymentStatus && <StatusBadge status={o.paymentStatus} />}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {o.orderNumber} · {o.itemCount} item{o.itemCount > 1 ? 's' : ''} · submitted {new Date(o.createdAt).toLocaleDateString()} · due {new Date(o.deadline).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={o.status} />
                          <span className="font-bold">{formatBDT(o.totalAmount)}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={PackageSearch}
            title={status === 'all' ? 'No orders yet' : 'No orders with this status'}
            description="Your submitted projects will appear here."
            action={<Button asChild><Link href="/services">Browse services</Link></Button>}
          />
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
