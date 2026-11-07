'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { FileText } from 'lucide-react';
import type { ServiceRequestSummaryDto } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';

/** Human status text for request pipeline values. */
function label(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export default function MyRequestsPage() {
  const { data, isLoading, error } = useSWR<{ items: ServiceRequestSummaryDto[] }>(
    '/marketplace/requests?pageSize=50',
    () => api.get<{ items: ServiceRequestSummaryDto[] }>('/marketplace/requests?pageSize=50'),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileText className="h-5 w-5 text-primary" /> My requests
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Service requests and their quotations. Accept a quotation to turn it into a payable order.
        </p>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <EmptyState icon={FileText} title="Could not load requests" description={errorMessage(error)} />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card key={r.id}>
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
                    {r.quotedPrice ? `Quoted ৳${r.quotedPrice} · ` : ''}
                    Updated {new Date(r.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/requests/${r.id}`}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No requests yet"
          description="Requests you submit from a service page — and their quotations — show up here."
        />
      )}
    </div>
  );
}
