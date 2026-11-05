'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  ImageOff,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { AdminPaymentAccountDto } from '@tsh/shared';
import { api, ApiClientError, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { PaymentMethodBadge } from '@/components/status-badge';
import { PaymentAccountForm } from '@/components/admin/payment-account-form';
import { cn } from '@/lib/utils';

type AccountList = { items: AdminPaymentAccountDto[] };

type StatusPrompt = { account: AdminPaymentAccountDto; nextActive: boolean };
type DeletePrompt = { account: AdminPaymentAccountDto };

export default function AdminPaymentAccountsPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<AccountList>(
    '/admin/payment-accounts',
    () => api.get<AccountList>('/admin/payment-accounts'),
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPaymentAccountDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusPrompt, setStatusPrompt] = useState<StatusPrompt | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);

  // Explicit reorder mode: edit the local sequence, then persist the complete
  // order in one request so the server stays the source of truth.
  const [reorderMode, setReorderMode] = useState(false);
  const [orderDraft, setOrderDraft] = useState<AdminPaymentAccountDto[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const items = data?.items ?? [];
  const activeCount = items.filter((a) => a.isActive).length;
  const inactiveCount = items.length - activeCount;
  const referencedCount = items.filter((a) => a.usageCount > 0).length;
  const totalUsage = items.reduce((sum, a) => sum + a.usageCount, 0);

  function startReorder() {
    setOrderDraft(items);
    setReorderMode(true);
  }

  function cancelReorder() {
    setOrderDraft([]);
    setReorderMode(false);
  }

  function moveDraft(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderDraft.length) return;
    setOrderDraft((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      if (!row) return prev;
      next.splice(target, 0, row);
      return next;
    });
  }

  async function saveOrder() {
    if (savingOrder) return;
    setSavingOrder(true);
    try {
      await api.patch('/admin/payment-accounts/reorder', {
        items: orderDraft.map((account, index) => ({ id: account.id, displayOrder: index })),
      });
      toast.success('Display order saved');
      setReorderMode(false);
      setOrderDraft([]);
      await mutate();
    } catch (err) {
      toast.error('Could not save display order', { description: errorMessage(err) });
    } finally {
      setSavingOrder(false);
    }
  }

  async function setStatus(account: AdminPaymentAccountDto, nextActive: boolean) {
    setBusyId(account.id);
    try {
      await api.patch(`/admin/payment-accounts/${account.id}/status`, { isActive: nextActive });
      toast.success(nextActive ? 'Account activated — customers can now see it' : 'Account deactivated — hidden from customers');
      await mutate();
    } catch (err) {
      toast.error('Could not change account status', { description: errorMessage(err) });
    } finally {
      setBusyId(null);
      setStatusPrompt(null);
    }
  }

  async function removeAccount(account: AdminPaymentAccountDto) {
    setBusyId(account.id);
    try {
      await api.delete(`/admin/payment-accounts/${account.id}`);
      toast.success('Payment account deleted');
      await mutate();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'ACCOUNT_IN_USE') {
        toast.error('This account has payment history', {
          description: 'Deactivate it instead so historical payments keep their receiving-account reference.',
        });
      } else {
        toast.error('Could not delete account', { description: errorMessage(err) });
      }
    } finally {
      setBusyId(null);
      setDeletePrompt(null);
    }
  }

  const refresh = () => void mutate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-5 w-5 text-primary" /> Payment accounts
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Configure the receiving accounts customers send manual payments to. Only active accounts appear at
            checkout. Editing or deactivating an account never changes historical payment snapshots.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh} disabled={isValidating}>
            <RefreshCw className={cn('h-4 w-4', isValidating && 'animate-spin')} /> Refresh
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add account
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CircleDollarSign}
          label="Total accounts"
          value={isLoading ? null : items.length}
          hint="Active and inactive"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Active"
          value={isLoading ? null : activeCount}
          hint="Visible to customers"
        />
        <SummaryCard
          icon={Ban}
          label="Inactive"
          value={isLoading ? null : inactiveCount}
          hint="Hidden from customers"
        />
        <SummaryCard
          icon={Wallet}
          label="Referenced"
          value={isLoading ? null : referencedCount}
          hint={isLoading ? 'Payment history' : `${totalUsage} payment${totalUsage === 1 ? '' : 's'} linked`}
        />
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">Could not load payment accounts</p>
            <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payment accounts yet"
          description="Add a receiving account so customers can submit manual payments."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add account
            </Button>
          }
        />
      ) : reorderMode ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">Display order</p>
                <p className="text-xs text-muted-foreground">
                  Move accounts into the order customers should see them, then save.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={cancelReorder} disabled={savingOrder}>
                  Cancel
                </Button>
                <Button onClick={() => void saveOrder()} disabled={savingOrder || orderDraft.length === 0}>
                  {savingOrder ? 'Saving…' : 'Save order'}
                </Button>
              </div>
            </div>
            <ol className="space-y-2">
              {orderDraft.map((account, index) => (
                <li
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
                >
                  <span className="w-6 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.methodKey} · {account.accountNumber}
                      {account.isActive ? '' : ' · inactive'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${account.label} up`}
                    onClick={() => moveDraft(index, -1)}
                    disabled={index === 0 || savingOrder}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move ${account.label} down`}
                    onClick={() => moveDraft(index, 1)}
                    disabled={index === orderDraft.length - 1 || savingOrder}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={startReorder}>
              <ArrowUpDown className="h-4 w-4" /> Reorder
            </Button>
          </div>
          {items.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              busy={busyId === account.id}
              onEdit={() => {
                setEditing(account);
                setFormOpen(true);
              }}
              onToggleStatus={() => setStatusPrompt({ account, nextActive: !account.isActive })}
              onDelete={() => setDeletePrompt({ account })}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <PaymentAccountForm
          key={editing?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) {
              setFormOpen(false);
              setEditing(null);
            }
          }}
          account={editing}
          onSaved={async () => {
            await mutate();
          }}
        />
      )}

      {/* Activate / deactivate confirmation */}
      <AlertDialog
        open={Boolean(statusPrompt)}
        onOpenChange={(open) => {
          if (!open && busyId === null) setStatusPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusPrompt?.nextActive ? 'Activate this account?' : 'Deactivate this account?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusPrompt?.nextActive
                ? 'Customers will see this receiving account at checkout again. Historical payments are not affected.'
                : 'Customers will stop seeing this receiving account at checkout. The account and every historical payment snapshot stay intact, and you can reactivate it later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={() => {
                if (statusPrompt) void setStatus(statusPrompt.account, statusPrompt.nextActive);
              }}
            >
              {statusPrompt?.nextActive ? 'Activate' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation (unreferenced only) */}
      <AlertDialog
        open={Boolean(deletePrompt)}
        onOpenChange={(open) => {
          if (!open && busyId === null) setDeletePrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePrompt && deletePrompt.account.usageCount > 0
                ? 'This account is referenced by historical payments and cannot be deleted. Deactivate it instead.'
                : 'This permanently removes the receiving account. This action cannot be undone. Accounts with payment history must be deactivated instead of deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId !== null || Boolean(deletePrompt && deletePrompt.account.usageCount > 0)}
              onClick={() => {
                if (deletePrompt) void removeAccount(deletePrompt.account);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: number | null;
  hint: string;
}) {
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
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountRow({
  account,
  busy,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  account: AdminPaymentAccountDto;
  busy: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const referenced = account.usageCount > 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-3 py-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PaymentMethodBadge method={account.methodKey} />
              <Badge variant={account.isActive ? 'default' : 'outline'}>
                {account.isActive ? 'Active' : 'Inactive'}
              </Badge>
              {account.hasQr ? (
                <Badge variant="outline" className="gap-1">
                  <QrCode className="h-3 w-3" /> QR
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <ImageOff className="h-3 w-3" /> No QR
                </Badge>
              )}
              <Badge variant="outline" className="font-mono">
                #{account.displayOrder}
              </Badge>
            </div>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{account.label}</span>
              <span className="font-mono text-sm text-muted-foreground">{account.accountNumber}</span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {account.accountHolder}
              {account.accountType ? ` · ${account.accountType}` : ''}
            </p>
            {account.instructions && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{account.instructions}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {referenced
                ? `Used by ${account.usageCount} payment${account.usageCount === 1 ? '' : 's'}`
                : 'Not used by any payment'}
              {' · '}Updated {new Date(account.updatedAt).toLocaleDateString()}
              {account.updatedByName ? ` by ${account.updatedByName}` : ''}
            </p>
          </div>

          {account.qrUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.qrUrl}
              alt={`QR code for ${account.label}`}
              className="h-20 w-20 shrink-0 rounded-md border object-contain p-1"
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onToggleStatus} disabled={busy}>
            {account.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {account.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={busy || referenced}
            title={referenced ? 'Referenced by payments — deactivate this account instead' : 'Delete account'}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          {referenced && (
            <span className="self-center text-xs text-muted-foreground">
              Deactivate instead — payment history is linked to this account.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
