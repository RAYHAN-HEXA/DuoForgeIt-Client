import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/mascot';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <Mascot mood="shaking" className="h-44 w-44" />
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">404</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">This page went missing</h1>
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
  );
}
