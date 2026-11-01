'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRight,
  CircleCheckBig,
  Clock3,
  Package,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdminStatsDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminOverviewPage() {
  const { data: stats, isLoading } = useSWR<AdminStatsDto>(
    '/admin/stats',
    () => api.get<AdminStatsDto>('/admin/stats'),
    { refreshInterval: 120_000 },
  );

  const maxRevenue = stats ? Math.max(...stats.monthly.map((m) => Number(m.revenue)), 1) : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform health at a glance.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Users} label="Customers" value={stats?.customers ?? 0} loading={isLoading} />
        <Stat icon={Package} label="Total orders" value={stats?.orders.total ?? 0} loading={isLoading} />
        <Stat icon={Clock3} label="Pending orders" value={stats?.orders.pending ?? 0} loading={isLoading} />
        <Stat icon={Clock3} label="Active projects" value={stats?.orders.active ?? 0} loading={isLoading} />
        <Stat icon={CircleCheckBig} label="Completed" value={stats?.orders.completed ?? 0} loading={isLoading} />
        <Stat icon={Wallet} label="Pending payments" value={stats?.pendingPayments ?? 0} loading={isLoading} />
      </div>

      {/* Revenue */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly revenue & orders (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <div className="flex h-44 items-end gap-1.5">
                {stats.monthly.map((m) => (
                  <div key={m.month} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="pointer-events-none absolute -top-9 z-10 hidden rounded-md border bg-background px-2 py-1 text-xs shadow group-hover:block">
                      {m.month}: {formatBDT(m.revenue)} · {m.orders} orders
                    </div>
                    <div
                      className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max(2, (Number(m.revenue) / maxRevenue) * 130)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Verified</p>
              {isLoading ? <Skeleton className="mt-1 h-7 w-28" /> : <p className="text-2xl font-bold text-primary">{formatBDT(stats?.revenue.verified ?? '0')}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Awaiting verification</p>
              {isLoading ? <Skeleton className="mt-1 h-7 w-28" /> : <p className="text-2xl font-bold">{formatBDT(stats?.revenue.pending ?? '0')}</p>}
            </div>
            <Link href="/admin/payments" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Verify payments <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Popular services + founder workload */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Popular services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!stats ? (
              <Skeleton className="h-24 w-full" />
            ) : stats.popularServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              stats.popularServices.map((s) => {
                const max = Math.max(...stats.popularServices.map((x) => x.orders), 1);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{s.name}</span>
                      <span className="text-muted-foreground">{s.orders}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(s.orders / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Founder workload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!stats ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              stats.founderWorkload.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{f.displayName}</p>
                    <p className="text-xs text-muted-foreground">{f.active} active · {f.completed} completed</p>
                  </div>
                  <div className="flex gap-1">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {f.active}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {f.completed}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, loading }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <p className="text-2xl font-bold leading-none">{value}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
