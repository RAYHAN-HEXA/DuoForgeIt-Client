'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { BellOff, CheckCheck, Dot } from 'lucide-react';
import type { NotificationsResponseDto } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Reveal } from '@/components/motion/reveal';
import { RequireAuth } from '@/components/guards';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  );
}

function NotificationsContent() {
  const { data, isLoading, mutate } = useSWR<NotificationsResponseDto>(
    '/notifications',
    () => api.get<NotificationsResponseDto>('/notifications'),
    { refreshInterval: 60_000 },
  );

  async function markAllRead() {
    await api.post('/notifications/read', {});
    await mutate();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Reveal className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-muted-foreground">{data ? `${data.unread} unread` : ''}</p>
        </div>
        {data && data.unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </Reveal>

      <div className="mt-8 space-y-2">
        {isLoading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : data && data.items.length > 0 ? (
          data.items.map((n) => {
            const card = (
              <Card
                className={cn(
                  'card-lift hover:shadow-sm',
                  !n.readAt && 'border-primary/30 bg-primary/[0.04]',
                )}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  {!n.readAt && <Dot className="-ml-1.5 mt-1 h-5 w-5 shrink-0 text-primary" strokeWidth={4} />}
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            );
            return n.link ? (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => void api.post('/notifications/read', { ids: [n.id] }).then(() => mutate())}
                className="block"
              >
                {card}
              </Link>
            ) : (
              <div key={n.id}>{card}</div>
            );
          })
        ) : (
          <EmptyState icon={BellOff} title="No notifications" description="Order updates and payment verifications land here." />
        )}
      </div>
    </div>
  );
}
