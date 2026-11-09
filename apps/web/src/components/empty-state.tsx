import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-primary/20 bg-muted/20 px-6 py-14 text-center',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-brand-fuchsia/15 ring-1 ring-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-gradient-to-r from-primary to-brand-fuchsia"
          />
          {eyebrow}
        </p>
      )}
      <h2 className="text-balance font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <span
        aria-hidden="true"
        className={cn(
          'mt-4 block h-px w-16 rounded-full bg-gradient-to-r from-primary via-brand-violet to-brand-fuchsia',
          align === 'center' && 'mx-auto',
        )}
      />
      {description && <p className="mt-3 text-pretty text-muted-foreground">{description}</p>}
    </div>
  );
}
