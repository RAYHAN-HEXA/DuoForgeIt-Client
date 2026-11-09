'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/mascot';

export default function GlobalErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-24 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-aurora-rich opacity-70" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grain opacity-[0.03]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-dashed border-primary/15 [mask-image:radial-gradient(circle,transparent_58%,#000_60%)]"
      />
      <div className="relative flex flex-col items-center gap-6">
        <Mascot mood="shaking" className="h-44 w-44 drop-shadow-[0_18px_36px_var(--glow)]" />
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Something broke on our side</h1>
          <p className="mt-2 text-muted-foreground">
            An unexpected error occurred. Try again — if it persists, we&apos;ve been notified automatically.
          </p>
        </div>
        <Button onClick={retry}>Try again</Button>
      </div>
    </div>
  );
}
