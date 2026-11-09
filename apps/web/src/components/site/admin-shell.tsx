'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  FileText,
} from 'lucide-react';
import useSWR from 'swr';
import type { AdminPaymentDto } from '@tsh/shared';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { RequireAdmin } from '@/components/guards';

const ADMIN_LINKS: Array<{ href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }> = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/requests', label: 'Requests', icon: FileText },
  { href: '/admin/services', label: 'Services', icon: Store },
  { href: '/admin/payments', label: 'Payments', icon: Wallet },
  { href: '/admin/payment-accounts', label: 'Receiving accounts', icon: Landmark },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/messages', label: 'Inbox', icon: MessageSquare },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAdmin>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24 space-y-4">
            <div className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-primary/12 to-brand-fuchsia/8 px-3 py-2.5 shadow-soft">
              <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/15 blur-2xl" />
              <ShieldCheck className="relative h-4 w-4 text-primary" />
              <span className="relative font-heading text-sm font-semibold">Admin console</span>
            </div>
            <nav className="space-y-1" aria-label="Admin">
              {ADMIN_LINKS.map((link) => {
                const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:origin-top before:scale-y-0 before:rounded-full before:bg-primary-foreground before:transition-transform before:duration-300',
                      active
                        ? 'bg-gradient-to-r from-primary to-brand-violet text-primary-foreground shadow-glow before:scale-y-100'
                        : 'text-muted-foreground hover:translate-x-0.5 hover:bg-primary/5 hover:text-foreground',
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                    {link.href === '/admin/payments' && <InboxIndicator />}
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Customer area
            </Link>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 shadow-[0_-12px_32px_-24px_var(--glow)] backdrop-blur-xl md:hidden">
          <nav className="flex justify-around gap-1 overflow-x-auto py-2" aria-label="Admin mobile">
            {ADMIN_LINKS.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex shrink-0 flex-col items-center gap-0.5 px-2 py-1 text-[10px] transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <link.icon className={cn('h-5 w-5 transition-transform duration-200', active && 'scale-110')} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main key={pathname} className="page-enter min-w-0 flex-1 pb-24 md:pb-8">{children}</main>
      </div>
    </RequireAdmin>
  );
}

/** Badge on the Payments link when the verification queue is non-empty. */
function InboxIndicator() {
  // The list endpoint paginates (default 20 rows) but returns the full count —
  // read `total` so the badge never truncates a long queue.
  const { data } = useSWR<{ items: AdminPaymentDto[]; total: number }>(
    '/admin/payments?status=SUBMITTED',
    () => api.get<{ items: AdminPaymentDto[]; total: number }>('/admin/payments?status=SUBMITTED'),
    { refreshInterval: 90_000 },
  );
  const pending = data?.total ?? data?.items.length ?? 0;
  if (!pending) return null;
  return (
    <span key={pending} className="animate-badge-pop ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {pending}
    </span>
  );
}
