import { Badge } from '@/components/ui/badge';
import type { OrderStatus, PaymentStatus, RevisionStatus } from '@tsh/shared';
import { cn } from '@/lib/utils';

/** One consistent color language for statuses across dashboard + admin. */

const ORDER_STYLES: Record<OrderStatus, string> = {
  SUBMITTED: 'bg-muted text-muted-foreground border-border',
  UNDER_REVIEW: 'bg-soft-blue/10 text-soft-blue border-soft-blue/30',
  APPROVED: 'bg-primary/10 text-primary border-primary/30',
  IN_PROGRESS: 'bg-warning/10 text-warning border-warning/30',
  QUALITY_REVIEW: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  COMPLETED: 'bg-success/10 text-success border-success/30',
  DELIVERED: 'bg-success/10 text-success border-success/30',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
  CANCELLED: 'bg-muted text-muted-foreground border-border',
  // Marketplace v2 pipeline (quotation-paid orders)
  PAID_SCHEDULED: 'bg-success/10 text-success border-success/30',
  REVIEW_REVISION: 'bg-warning/10 text-warning border-warning/30',
  DELIVERED_COMPLETED: 'bg-success/10 text-success border-success/30',
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  PENDING: 'bg-muted text-muted-foreground border-border',
  SUBMITTED: 'bg-soft-blue/10 text-soft-blue border-soft-blue/30',
  VERIFIED: 'bg-success/10 text-success border-success/30',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
  REFUNDED: 'bg-warning/10 text-warning border-warning/30',
};

const REVISION_STYLES: Record<RevisionStatus, string> = {
  OPEN: 'bg-soft-blue/10 text-soft-blue border-soft-blue/30',
  IN_PROGRESS: 'bg-warning/10 text-warning border-warning/30',
  RESOLVED: 'bg-success/10 text-success border-success/30',
  DECLINED: 'bg-destructive/10 text-destructive border-destructive/30',
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
  OTHER: 'Other',
};

export function StatusBadge({ status, className }: { status: OrderStatus | PaymentStatus | RevisionStatus | string; className?: string }) {
  const styles =
    ORDER_STYLES[status as OrderStatus] ??
    PAYMENT_STYLES[status as PaymentStatus] ??
    REVISION_STYLES[status as RevisionStatus] ??
    'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={cn(styles, 'font-medium transition-colors duration-300', className)}>
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
