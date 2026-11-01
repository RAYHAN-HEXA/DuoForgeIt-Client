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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <Mascot mood="shaking" className="h-44 w-44" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Something broke on our side</h1>
        <p className="mt-2 text-muted-foreground">
          An unexpected error occurred. Try again — if it persists, we&apos;ve been notified automatically.
        </p>
      </div>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
