'use client';

import useSWR from 'swr';
import { Check, Inbox, Mail, MailOpen } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';

type MessageRow = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export default function AdminMessagesPage() {
  const { data, isLoading, mutate } = useSWR<{ items: MessageRow[] }>(
    '/admin/messages',
    () => api.get('/admin/messages'),
    { refreshInterval: 90_000 },
  );

  async function markRead(id: string) {
    try {
      await api.patch(`/admin/messages/${id}`);
      await mutate();
    } catch (err) {
      toast.error('Could not update', { description: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Inbox className="h-5 w-5 text-primary" /> Contact inbox
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Messages from the public contact form.</p>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((m) => (
            <Card key={m.id} className={!m.isRead ? 'border-primary/30 bg-primary/[0.03]' : undefined}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {m.isRead ? <MailOpen className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-primary" />}
                    <p className="font-medium">{m.name}</p>
                    <a href={`mailto:${m.email}`} className="text-sm text-primary hover:underline">{m.email}</a>
                    {!m.isRead && <Badge className="bg-primary text-[10px]">new</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                    {!m.isRead && (
                      <Button variant="ghost" size="icon-sm" onClick={() => void markRead(m.id)} aria-label="Mark as read">
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                <p className="whitespace-pre-line text-sm text-muted-foreground">{m.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="Inbox zero" description="No contact messages yet." />
      )}
    </div>
  );
}
