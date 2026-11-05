import { Badge } from '@/components/ui/badge';
import type { OrderStatus, PaymentStatus, RevisionStatus } from '@tsh/shared';
import { cn } from '@/lib/utils';

/** One consistent color language for statuses across dashboard + admin. */

const ORDER_STYLES: Record<OrderStatus, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300',
  UNDER_REVIEW: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  QUALITY_REVIEW: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  DELIVERED: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400',
  // Marketplace v2 pipeline (quotation-paid orders)
  PAID_SCHEDULED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  REVIEW_REVISION: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
  DELIVERED_COMPLETED: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  VERIFIED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  REFUNDED: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
};

const REVISION_STYLES: Record<RevisionStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  DECLINED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
};

const LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In progress',
  QUALITY_REVIEW: 'Quality review',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  PAID_SCHEDULED: 'Paid — scheduled',
  REVIEW_REVISION: 'Review & revision',
  DELIVERED_COMPLETED: 'Delivered',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REFUNDED: 'Refunded',
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  DECLINED: 'Declined',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  BANK_TRANSFER: 'Bank transfer',
};

export function StatusBadge({ status, className }: { status: OrderStatus | PaymentStatus | RevisionStatus | string; className?: string }) {
  const styles =
    ORDER_STYLES[status as OrderStatus] ??
    PAYMENT_STYLES[status as PaymentStatus] ??
    REVISION_STYLES[status as RevisionStatus] ??
    'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={cn(styles, 'font-medium', className)}>
      {LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase()}
    </Badge>
  );
}

export function PaymentMethodBadge({ method }: { method: string }) {
  return <Badge variant="outline">{LABELS[method] ?? method}</Badge>;
}

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
