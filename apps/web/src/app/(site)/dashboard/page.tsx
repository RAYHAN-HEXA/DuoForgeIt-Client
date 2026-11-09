'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRight,
  BadgeCheck,
  CircleCheckBig,
  Clock3,
  Package,
  PackageSearch,
  Wallet,
} from 'lucide-react';
import type { OrderSummaryDto, Paginated } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { AnimatedCounter } from '@/components/motion/animated-counter';
import { Reveal } from '@/components/motion/reveal';
import { StatusBadge } from '@/components/status-badge';
import { RequireAuth } from '@/components/guards';
import { useAuth } from '@/hooks/use-auth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <RequireAuth>
      <DashboardContent name={user?.fullName ?? ''} emailVerified={user?.emailVerified ?? false} />
    </RequireAuth>
  );
}

function DashboardContent({ name, emailVerified }: { name: string; emailVerified: boolean }) {
  const { data, isLoading } = useSWR<Paginated<OrderSummaryDto>>(
    '/orders?pageSize=5',
    () => api.get<Paginated<OrderSummaryDto>>('/orders?pageSize=5'),
  );

  const orders = data?.items ?? [];
  const active = orders.filter((o) => !['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status));
  const completed = orders.filter((o) => ['DELIVERED', 'COMPLETED'].includes(o.status));
  const pendingPayments = orders.filter((o) => o.paymentStatus === 'SUBMITTED' || o.paymentStatus === 'PENDING');

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Reveal>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-muted-foreground">Your projects at a glance.</p>
        </Reveal>
        <Button asChild>
          <Link href="/services">New project <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>

      {!emailVerified && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          Please verify your email — check your inbox for the confirmation link.
        </div>
      )}

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Total orders" value={data?.total ?? 0} loading={isLoading} />
        <StatCard icon={Clock3} label="Active" value={active.length} loading={isLoading} />
        <StatCard icon={CircleCheckBig} label="Completed" value={completed.length} loading={isLoading} />
        <StatCard icon={Wallet} label="Payments to verify" value={pendingPayments.length} loading={isLoading} />
      </div>

      {/* Recent orders */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent orders</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="mt-4 space-y-3">
            {orders.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="group block">
                <Card className="card-lift hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{o.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.orderNumber} · {o.itemCount} item{o.itemCount > 1 ? 's' : ''} · due {new Date(o.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {o.paymentStatus && <StatusBadge status={o.paymentStatus} />}
                      <StatusBadge status={o.status} />
                      <span className="font-semibold">{formatBDT(o.totalAmount)}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={PackageSearch}
              title="No orders yet"
              description="Pick a service and your project lead to get started."
              action={<Button asChild><Link href="/services">Browse services</Link></Button>}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, loading }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; loading: boolean }) {
  return (
    <Card className="card-lift hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <AnimatedCounter value={value} className="text-2xl font-bold leading-none" />
          )}
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
