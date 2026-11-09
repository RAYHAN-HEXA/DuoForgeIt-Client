'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, FileText, LayoutDashboard, LogOut, Menu, Plus, ShieldCheck, ShoppingCart, Store, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MascotMark } from '@/components/mascot';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { NotificationsResponseDto } from '@tsh/shared';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#contact', label: 'Contact' },
] as const;

export function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Notification badge (only while signed in)
  const { data: notifications } = useSWR<NotificationsResponseDto>(
    user ? ['/notifications', user.id] : null,
    () => api.get<NotificationsResponseDto>('/notifications'),
    { refreshInterval: 60_000 },
  );
  const unread = notifications?.unread ?? 0;

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl transition-all duration-300 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/30 after:to-transparent supports-[backdrop-filter]:bg-background/55 ${
        scrolled ? 'shadow-[0_18px_44px_-32px_var(--glow)]' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <MascotMark className="h-9 w-9 transition-transform duration-300 group-hover:scale-105" />
          <span className="font-heading text-base font-semibold tracking-tight">
            TechService <span className="text-gradient-strong">Hub</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-300 after:absolute after:inset-x-3.5 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-gradient-to-r after:from-primary after:via-brand-violet after:to-brand-fuchsia after:transition-transform after:duration-300 hover:bg-primary/5 hover:text-foreground hover:after:scale-x-100 ${
                pathname === link.href
                  ? 'bg-primary/8 text-foreground after:scale-x-100'
                  : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {isAdmin && (
                <Button variant="outline" size="sm" asChild className="hidden lg:inline-flex">
                  <Link href="/admin/services/new">
                    <Plus className="h-4 w-4" /> Add service
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" asChild className="relative" aria-label="Notifications">
                <Link href="/notifications">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span
                      key={unread}
                      className="animate-badge-pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                    >
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild className="relative" aria-label="Cart">
                <Link href="/cart">
                  <ShoppingCart className="h-5 w-5" />
                  {itemCount > 0 && (
                    <span
                      key={itemCount}
                      className="animate-badge-pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                    >
                      {itemCount > 9 ? '9+' : itemCount}
                    </span>
                  )}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-1.5">
                    <Avatar className="h-8 w-8 ring-2 ring-primary/15 ring-offset-2 ring-offset-background transition-transform duration-300 hover:scale-105">
                      <AvatarImage src={user.profileImage ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">
                        {initials(user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-28 truncate text-sm lg:inline">
                      {user.fullName.split(' ')[0]}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-medium">{user.fullName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/orders" className="cursor-pointer">
                      <ShoppingCart className="h-4 w-4" /> My orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/requests" className="cursor-pointer">
                      <FileText className="h-4 w-4" /> My requests
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">
                      <UserRound className="h-4 w-4" /> Profile settings
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="cursor-pointer">
                          <ShieldCheck className="h-4 w-4" /> Admin
                          <Badge variant="secondary" className="ml-auto">
                            admin
                          </Badge>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/services/new" className="cursor-pointer">
                          <Plus className="h-4 w-4" /> Add service
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/services" className="cursor-pointer">
                          <Store className="h-4 w-4" /> Manage services
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void logout()} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          )}

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MascotMark className="h-7 w-7" /> TechService Hub
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="my-2 h-px bg-border" />
                {user ? (
                  <>
                    <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
                      Dashboard
                    </Link>
                    <Link href="/requests" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
                      My requests
                    </Link>
                    {isAdmin && (
                      <>
                        <Link href="/admin" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
                          Admin
                        </Link>
                        <Link
                          href="/admin/services/new"
                          onClick={() => setOpen(false)}
                          className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                        >
                          Add service
                        </Link>
                        <Link
                          href="/admin/services"
                          onClick={() => setOpen(false)}
                          className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                        >
                          Manage services
                        </Link>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setOpen(false);
                        void logout();
                      }}
                      className="rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-3 pt-2">
                    <Button asChild onClick={() => setOpen(false)}>
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button variant="outline" asChild onClick={() => setOpen(false)}>
                      <Link href="/register">Create account</Link>
                    </Button>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
