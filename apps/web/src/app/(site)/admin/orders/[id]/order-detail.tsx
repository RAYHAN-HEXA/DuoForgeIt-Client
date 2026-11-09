'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  Paperclip,
  PackageOpen,
  Repeat,
  Send,
  Trash2,
  Upload,
  UserRoundCog,
} from 'lucide-react';
import type { AdminOrderDto, OrderStatus } from '@tsh/shared';
import { ORDER_TRANSITIONS, formatBDT } from '@tsh/shared';
import { api, errorMessage, uploadToBlob, BlobUploadTicket, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { OrderTracker } from '@/components/order-tracker';
import { StatusBadge, statusLabel } from '@/components/status-badge';

export function AdminOrderDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, error, mutate } = useSWR<AdminOrderDto>(
    id ? `/admin/orders/${id}` : null,
    () => api.get<AdminOrderDto>(`/admin/orders/${id}`),
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Order not found</p>
          <Button variant="outline" asChild><Link href="/admin/orders">Back to orders</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const legalNext = ORDER_TRANSITIONS[order.status] ?? [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/orders"><ArrowLeft className="h-4 w-4" /> All orders</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{order.title}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.orderNumber} · {order.customer.fullName} ({order.customer.email}) · submitted {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <p className="font-heading text-2xl font-bold text-primary">{formatBDT(order.totalAmount)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Pipeline */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
            <CardContent>
              <OrderTracker status={order.status} />
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex justify-between">
                    <p className="font-medium">{item.serviceName} × {item.quantity}</p>
                    <p className="font-semibold">{formatBDT(item.lineTotal)}</p>
                  </div>
                  {item.optionSnapshots.length > 0 && (
                    <ul className="mt-1 text-sm text-muted-foreground">
                      {item.optionSnapshots.map((o, i) => <li key={i}>+ {o.label}</li>)}
                    </ul>
                  )}
                  {item.requirements && (
                    <p className="mt-2 whitespace-pre-line rounded-md bg-muted p-2 text-sm">{item.requirements}</p>
                  )}
                </div>
              ))}
              {order.notes && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Order notes: {order.notes}</p>}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader><CardTitle className="text-base">Customer files</CardTitle></CardHeader>
            <CardContent>
              {order.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attachments.</p>
              ) : (
                <ul className="space-y-2">
                  {order.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.fileName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{Math.round(a.sizeBytes / 1024)} KB</span>
                      </span>
                      {a.downloadUrl ? (
                        <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-primary hover:underline">
                          Download <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px]">storage offline</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Deliverables */}
          <DeliverablesCard orderId={order.id} deliverables={order.deliverables} onChanged={() => void mutate()} />

          {/* Revisions */}
          <RevisionsCard revisions={order.revisions} onChanged={() => void mutate()} />
        </div>

        {/* Actions sidebar */}
        <div className="space-y-6">
          <StatusCard order={order} legalNext={legalNext} onChanged={() => void mutate()} />
          <AssignmentCard order={order} onChanged={() => void mutate()} />
          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[...order.statusHistory].reverse().map((h, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{statusLabel(h.toStatus)}</span>
                  {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
                  <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ order, legalNext, onChanged }: { order: AdminOrderDto; legalNext: readonly OrderStatus[]; onChanged: () => void }) {
  const [toStatus, setToStatus] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, { status: toStatus, note: note.trim() || undefined });
      toast.success(`Order moved to ${statusLabel(toStatus)}`);
      setToStatus('');
      setNote('');
      onChanged();
    } catch (err) {
      toast.error('Transition failed', { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Update status</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {order.status === 'REJECTED' || order.status === 'CANCELLED' || legalNext.length === 0 ? (
          <p className="text-sm text-muted-foreground">This order is in a terminal state.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {legalNext.map((s) => (
                <button
                  key={s}
                  onClick={() => setToStatus(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                    toStatus === s
                      ? 'border-primary bg-gradient-to-r from-primary to-brand-violet text-primary-foreground shadow-glow'
                      : 'border-border/70 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the customer (optional) — becomes the reject/cancel reason." maxLength={2000} />
            <Button className="w-full" onClick={apply} disabled={!toStatus || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply transition
            </Button>
            <p className="text-xs text-muted-foreground">
              Legal transitions are enforced server-side (ORDER_TRANSITIONS).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type FounderOption = { id: string; displayName: string };

function AssignmentCard({ order, onChanged }: { order: AdminOrderDto; onChanged: () => void }) {
  const { data } = useSWR<{ items: Array<FounderOption & { userId: string; active: number; completed: number }> }>(
    '/admin/founders',
    () => api.get<{ items: Array<FounderOption & { userId: string; active: number; completed: number }> }>('/admin/founders'),
  );
  const [saving, setSaving] = useState(false);

  async function assign(userId: string | null) {
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${order.id}/assignment`, { assignedFounderId: userId });
      toast.success(userId ? 'Founder assigned' : 'Assignment cleared');
      onChanged();
    } catch (err) {
      toast.error('Reassignment failed', { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundCog className="h-4 w-4" /> Founder assignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Currently:{' '}
          <span className="font-medium">
            {order.assignedFounder?.displayName ?? 'Unassigned'}
          </span>
          {order.preferredFounder && !order.assignedFounder && (
            <span className="block text-xs text-muted-foreground">Customer preferred {order.preferredFounder.displayName}</span>
          )}
        </p>
        {data?.items.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
            <div>
              <p className="font-medium">{f.displayName}</p>
              <p className="text-xs text-muted-foreground">{f.active} active · {f.completed} completed</p>
            </div>
            <Button
              size="sm"
              variant={order.assignedFounder?.id === f.userId ? 'secondary' : 'outline'}
              disabled={saving || order.assignedFounder?.id === f.userId}
              onClick={() => void assign(f.userId)}
            >
              {order.assignedFounder?.id === f.userId ? 'Assigned' : <><Repeat className="h-3.5 w-3.5" /> Assign</>}
            </Button>
          </div>
        ))}
        {order.assignedFounder && (
          <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={() => void assign(null)} disabled={saving}>
            <Trash2 className="h-3.5 w-3.5" /> Clear assignment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DeliverablesCard({ orderId, deliverables, onChanged }: { orderId: string; deliverables: AdminOrderDto['deliverables']; onChanged: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || title.trim().length < 2) return;
    setUploading(true);
    try {
      const ticket = await api.post<BlobUploadTicket>('/uploads/blob/token', {
        folder: 'deliveries',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      const pathname = await uploadToBlob(file, ticket);
      await api.post(`/admin/orders/${orderId}/deliverables`, {
        title: title.trim(),
        description: description.trim() || undefined,
        pathname,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      toast.success('Deliverable added — customer notified');
      setTitle('');
      setDescription('');
      setFile(null);
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'FILE_STORAGE_UNCONFIGURED') {
        toast.warning('File storage not configured', { description: 'Set the Blob storage token on the API to upload deliverables.' });
      } else {
        toast.error('Upload failed', { description: errorMessage(err) });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Deliverables</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {deliverables.length > 0 && (
          <ul className="space-y-2">
            {deliverables.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate font-medium">{d.title}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">v{d.version}</Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.downloadCount} downloads</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="del-title">Title</Label>
              <Input id="del-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Final source + docs (ZIP)" maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="del-file">File</Label>
              <Input id="del-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.zip,.doc,.docx,.ppt,.pptx" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="del-desc">Description (optional)</Label>
            <Textarea id="del-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's included, how to open it…" maxLength={2000} />
          </div>
          <Button type="submit" disabled={uploading || !file || title.trim().length < 2}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload deliverable
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RevisionsCard({ revisions, onChanged }: { revisions: AdminOrderDto['revisions']; onChanged: () => void }) {
  const [responses, setResponses] = useState<Record<string, { status: string; adminResponse: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (revisions.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Revisions</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No revision requests.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Revisions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {revisions.map((r) => {
          const state = responses[r.id] ?? { status: r.status === 'OPEN' ? 'IN_PROGRESS' : r.status, adminResponse: '' };
          const closed = r.status === 'RESOLVED' || r.status === 'DECLINED';
          return (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{new Date(r.createdAt).toLocaleDateString()}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{r.description}</p>
              {!closed && (
                <div className="mt-3 space-y-2">
                  <Separator />
                  <div className="flex gap-2">
                    <Select
                      value={state.status}
                      onValueChange={(v) => setResponses((prev) => ({ ...prev, [r.id]: { ...state, status: v } }))}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN_PROGRESS">Working on it</SelectItem>
                        <SelectItem value="RESOLVED">Resolved</SelectItem>
                        <SelectItem value="DECLINED">Decline</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={state.adminResponse}
                      onChange={(e) => setResponses((prev) => ({ ...prev, [r.id]: { ...state, adminResponse: e.target.value } }))}
                      placeholder="Response to the customer…"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        setSavingId(r.id);
                        try {
                          await api.patch(`/admin/revisions/${r.id}`, {
                            status: state.status,
                            adminResponse: state.adminResponse.trim() || undefined,
                          });
                          toast.success('Revision updated');
                          onChanged();
                        } catch (err) {
                          toast.error('Update failed', { description: errorMessage(err) });
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      disabled={savingId === r.id}
                    >
                      {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
              {r.adminResponse && closed && (
                <p className="mt-2 rounded-md bg-muted p-2 text-sm text-muted-foreground">Response: {r.adminResponse}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
