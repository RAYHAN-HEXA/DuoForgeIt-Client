import { Suspense } from 'react';
import { AdminShell } from '@/components/site/admin-shell';

/**
 * The admin shell reads usePathname + auth state — it streams inside Suspense
 * so the page subtree can prerender; instant=false keeps routes blocking.
 */
export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-8" aria-hidden="true" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
