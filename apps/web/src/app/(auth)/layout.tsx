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
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary bg-aurora-rich p-10 text-primary-foreground lg:flex">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
        <div className="absolute inset-0 bg-grain opacity-[0.05]" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-1/4 h-[520px] w-[520px] animate-spin-slow rounded-full border border-dashed border-primary-foreground/15 [mask-image:radial-gradient(circle,transparent_58%,#000_60%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-48 bottom-0 h-[620px] w-[620px] animate-spin-slow rounded-full border border-dashed border-primary-foreground/10 [animation-direction:reverse] [mask-image:radial-gradient(circle,transparent_64%,#000_66%)]"
        />
        <div
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl animate-float-slow"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-brand-fuchsia/25 blur-3xl animate-float-slow [animation-delay:-3s]"
          aria-hidden="true"
        />
        <Link href="/" className="relative flex items-center gap-2.5 font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 p-1.5">
            <MascotMark className="h-full w-full [&_rect:first-of-type]:fill-primary-foreground [&_rect:nth-of-type(2)]:fill-primary/90 [&_line]:stroke-primary-foreground [&_circle]:fill-primary-foreground" />
          </span>
          TechService Hub
        </Link>
        <div className="relative space-y-4">
          <p className="font-heading text-3xl font-bold leading-tight">
            Your Ideas. Our Expertise.
            <br />
            One Digital Solution.
          </p>
          <p className="max-w-md text-pretty text-primary-foreground/80">
            From academic projects to professional software — work directly with the
            founders, track every stage, and get secure deliverables.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {['Direct founder access', '7-stage tracking', 'Secure delivery'].map((item) => (
              <span
                key={item}
                className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs font-medium backdrop-blur"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <p className="relative text-sm text-primary-foreground/60">
          © <CurrentYear /> TechService Hub
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-brand-fuchsia/10 blur-3xl"
        />
        <div className="relative w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
