'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';

type CustomerRow = {
  id: string;
  fullName: string;
  email: string;
  accountStatus: string;
  orderCount: number;
  createdAt: string;
};

export default function AdminCustomersPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(v: string) {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setDebounced(v), 350));
  }

  const { data, isLoading } = useSWR<{ items: CustomerRow[]; total: number }>(
    `/admin/customers?pageSize=50${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`,
    () => api.get(`/admin/customers?pageSize=50${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`),
    { keepPreviousData: true },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Users className="h-5 w-5 text-primary" /> Customers
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{data?.total ?? '…'} registered</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Name or email…" className="w-64 pl-9" />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <Card className="overflow-hidden shadow-soft">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Customer</th>
                  <th className="p-3 font-medium">Orders</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-primary/[0.035]">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 ring-2 ring-primary/10 ring-offset-2 ring-offset-background">
                          <AvatarImage src={undefined} alt="" />
                          <AvatarFallback className="text-xs font-semibold">
                            {c.fullName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">{c.orderCount}</td>
                    <td className="p-3">
                      <Badge variant={c.accountStatus === 'ACTIVE' ? 'secondary' : 'destructive'}>
                        {c.accountStatus.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={Users} title="No customers found" description={debounced ? 'Try a different search.' : 'Customer accounts appear here as they register.'} />
      )}
    </div>
  );
}
