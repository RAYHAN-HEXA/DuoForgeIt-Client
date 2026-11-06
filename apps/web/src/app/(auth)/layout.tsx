import Link from 'next/link';
import type { Metadata } from 'next';
import { MascotMark } from '@/components/mascot';
import { CurrentYear } from '@/components/year';

// Gated flows stay out of search indexes (mirrors the X-Robots-Tag header).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Split layout: marketing panel on the left, auth card on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
        <div
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl"
          aria-hidden="true"
        />
        <Link href="/" className="relative flex items-center gap-2.5 font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 p-1.5">
            <MascotMark className="h-full w-full [&_rect:first-of-type]:fill-primary-foreground [&_rect:nth-of-type(2)]:fill-primary/90 [&_line]:stroke-primary-foreground [&_circle]:fill-primary-foreground" />
          </span>
          TechService Hub
        </Link>
        <div className="relative space-y-4">
          <p className="text-3xl font-bold leading-tight">
            Your Ideas. Our Expertise.
            <br />
            One Digital Solution.
          </p>
          <p className="max-w-md text-primary-foreground/80">
            From academic projects to professional software — work directly with the
            founders, track every stage, and get secure deliverables.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/60">
          © <CurrentYear /> TechService Hub
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
