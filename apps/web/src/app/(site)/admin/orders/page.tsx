'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, Search } from 'lucide-react';
import { formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';

type AdminOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  title: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  totalAmount: string;
  paymentStatus: string | null;
  createdAt: string;
};

const PAGE_SIZE = 15;

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  // debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function onSearch(v: string) {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => { setDebounced(v); setPage(1); }, 350));
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(status !== 'all' ? { status } : {}),
    ...(debounced ? { search: debounced } : {}),
  });
  const { data, isLoading } = useSWR<{ items: AdminOrderRow[]; total: number }>(
    `/admin/orders?${query.toString()}`,
    () => api.get<{ items: AdminOrderRow[]; total: number }>(`/admin/orders?${query.toString()}`),
    { keepPreviousData: true },
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{data?.total ?? '…'} total</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Order #, customer…" className="w-56 pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-44" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'IN_PROGRESS', 'QUALITY_REVIEW', 'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'].map((s) => (
                <SelectItem key={s} value={s}>{s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Order</th>
                    <th className="p-3 font-medium">Customer</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Payment</th>
                    <th className="p-3 font-medium">Total</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3">
                        <p className="font-medium">{o.title}</p>
                        <p className="text-xs text-muted-foreground">{o.orderNumber} · {new Date(o.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="p-3">
                        <p>{o.customerName}</p>
                        <p className="text-xs text-muted-foreground">{o.customerEmail}</p>
                      </td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                      <td className="p-3">{o.paymentStatus ? <StatusBadge status={o.paymentStatus} /> : <span className="text-xs text-muted-foreground">none</span>}</td>
                      <td className="p-3 font-semibold">{formatBDT(o.totalAmount)}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/orders/${o.id}`}>Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={Search} title="No orders match" description="Try changing the filters." />
      )}
    </div>
  );
}
