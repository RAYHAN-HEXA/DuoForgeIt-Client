import { Suspense } from 'react';
import { Navbar } from '@/components/site/navbar';
import { Footer } from '@/components/site/footer';
import { ScrollProgress } from '@/components/motion/scroll-progress';
import { CursorGlow } from '@/components/motion/cursor-glow';

/**
 * Navbar reads usePathname + auth state — it streams in inside Suspense so
 * dynamic routes (e.g. /orders/[id]) can still prerender their shell.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CursorGlow />
      <ScrollProgress />
      <Suspense fallback={<div className="h-16 border-b" aria-hidden="true" />}>
        <Navbar />
      </Suspense>
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </>
  );
}
