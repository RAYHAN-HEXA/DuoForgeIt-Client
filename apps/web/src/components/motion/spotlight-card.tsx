'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Adds a soft mouse-follow spotlight to a card without touching the card's
 * own markup or handlers.
 */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={cn('group/spot relative isolate h-full rounded-xl', className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklch, var(--primary) 15%, transparent), transparent 68%)',
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
