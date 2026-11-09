import { cn } from '@/lib/utils';

/**
 * Decorative floating gradient orbs. Purely visual, hidden from assistive tech
 * and pointer events.
 */
export function GradientOrbs({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-float-slow" />
      <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-brand-fuchsia/15 blur-3xl animate-float-slow [animation-delay:-2.5s]" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand-violet/15 blur-3xl animate-float-slow [animation-delay:-5s]" />
    </div>
  );
}
