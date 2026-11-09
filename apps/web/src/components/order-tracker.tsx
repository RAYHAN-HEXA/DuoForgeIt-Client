'use client';

import { Check, CircleDashed, X } from 'lucide-react';
import { ORDER_PIPELINE, type OrderStatus } from '@tsh/shared';
import { cn } from '@/lib/utils';
import { statusLabel } from '@/components/status-badge';

/**
 * The 7-stage order pipeline tracker (PRD §10): Submitted → Under review →
 * Approved → In progress → Quality review → Completed → Delivered.
 * A DELIVERED order renders every circle green and ticked — nothing is left
 * "in progress". Off-track terminal states (REJECTED/CANCELLED) render a red
 * banner instead.
 */
export function OrderTracker({ status }: { status: OrderStatus }) {
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        <X className="h-4 w-4 shrink-0" />
        This order was {status === 'REJECTED' ? 'rejected' : 'cancelled'}. Check the status history below for details.
      </div>
    );
  }

  const currentIndex = ORDER_PIPELINE.indexOf(status);
  const delivered = status === 'DELIVERED';

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0" aria-label="Order progress">
      {ORDER_PIPELINE.map((stage, i) => {
        const isLast = i === ORDER_PIPELINE.length - 1;
        const done = i < currentIndex || (delivered && isLast);
        const active = i === currentIndex && !done;
        return (
          <li key={stage} className="flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            <div className="flex items-center sm:w-full sm:flex-col">
              <span
                className={cn(
                  'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors duration-500',
                  done && 'animate-badge-pop border-primary bg-gradient-to-br from-primary to-brand-violet text-primary-foreground shadow-glow',
                  active && 'border-primary bg-background text-primary ring-4 ring-primary/15 animate-pulse-soft',
                  !done && !active && 'border-muted-foreground/30 bg-background text-muted-foreground/50',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : active ? i + 1 : <CircleDashed className="h-4 w-4" />}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    'ml-2 h-0.5 w-10 grow rounded transition-colors duration-500 sm:ml-0 sm:mt-2 sm:h-0.5 sm:w-full',
                    done
                      ? 'bg-gradient-to-r from-primary to-brand-violet'
                      : 'bg-muted-foreground/20',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              className={cn(
                'pb-4 text-xs leading-tight sm:pb-0',
                active ? 'font-semibold text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60',
              )}
            >
              {statusLabel(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
