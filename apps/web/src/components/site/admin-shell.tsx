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
  Users,
  Wallet,
} from 'lucide-react';
import useSWR from 'swr';
import type { AdminPaymentDto } from '@tsh/shared';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { RequireAdmin } from '@/components/guards';

const ADMIN_LINKS: Array<{ href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }> = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
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
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Admin console</span>
            </div>
            <nav className="space-y-1" aria-label="Admin">
              {ADMIN_LINKS.map((link) => {
                const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Customer area
            </Link>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <nav className="flex justify-around py-2" aria-label="Admin mobile">
            {ADMIN_LINKS.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn('flex flex-col items-center gap-0.5 px-3 py-1 text-[11px]', active ? 'text-primary' : 'text-muted-foreground')}
                >
                  <link.icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="min-w-0 flex-1 pb-24 md:pb-8">{children}</main>
      </div>
    </RequireAdmin>
  );
}

/** Badge on the Payments link when the verification queue is non-empty. */
function InboxIndicator() {
  const { data } = useSWR<{ items: AdminPaymentDto[] }>(
    '/admin/payments?status=SUBMITTED',
    () => api.get<{ items: AdminPaymentDto[] }>('/admin/payments?status=SUBMITTED'),
    { refreshInterval: 90_000 },
  );
  if (!data?.items.length) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {data.items.length}
    </span>
  );
}
