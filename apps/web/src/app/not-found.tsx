import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/mascot';

export default function NotFound() {
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
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-gradient-to-r from-primary to-brand-fuchsia" />
            404
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">This page went missing</h1>
          <p className="mt-2 text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or was moved.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/services">Browse services</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
