import Link from 'next/link';
import type { Metadata } from 'next';
import { MascotMark } from '@/components/mascot';
import { CurrentYear } from '@/components/year';

// Gated flows stay out of search indexes (mirrors the X-Robots-Tag header).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Space scene behind a clearly separated, opaque form panel. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-svh overflow-hidden bg-space-deep lg:grid-cols-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/space/auth-nebula.svg')] bg-cover bg-center opacity-90"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-space-deep/70 via-space-deep/60 to-space-deep/90"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-starfield opacity-25" />

      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between p-10 lg:flex">
        <Link href="/" className="relative flex items-center gap-2.5 font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-soft-blue/25 bg-panel/70 p-1.5 backdrop-blur">
            <MascotMark className="h-full w-full [&_rect:first-of-type]:fill-foreground [&_rect:nth-of-type(2)]:fill-primary/90 [&_line]:stroke-foreground [&_circle]:fill-foreground" />
          </span>
          <span className="font-heading tracking-tight">
            TechService <span className="text-gradient">Hub</span>
          </span>
        </Link>

        <div className="relative max-w-md space-y-5 rounded-2xl border border-soft-blue/15 bg-panel/55 p-7 shadow-soft backdrop-blur-md">
          <p className="font-heading text-3xl font-bold leading-tight text-balance">
            Your Ideas. Our Expertise. One Digital Solution.
          </p>
          <p className="text-pretty text-sm leading-relaxed text-soft-blue/90">
            From academic projects to professional software — work directly with the
            founders, track every stage, and get secure deliverables.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {['Direct founder access', '7-stage tracking', 'Secure delivery'].map((item) => (
              <span
                key={item}
                className="rounded-full border border-soft-blue/20 bg-raised/70 px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © <CurrentYear /> TechService Hub
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl border border-soft-blue/20 bg-panel/95 p-6 shadow-soft backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
