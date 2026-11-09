'use client';

import Link from 'next/link';
import { MascotMark } from '@/components/mascot';
import { CurrentYear } from '@/components/year';
import { useAuth } from '@/hooks/use-auth';

const columns = [
  {
    title: 'Services',
    links: [
      { href: '/services?category=web-development', label: 'Website Development' },
      { href: '/services?category=software-projects', label: 'Software & Programming' },
      // Active legacy category (the academic v2 category is inactive for launch).
      { href: '/services?category=presentation-design', label: 'Presentation & Slide Design' },
      { href: '/services', label: 'All services' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/#founders', label: 'Meet the founders' },
      { href: '/#portfolio', label: 'Portfolio' },
      { href: '/#faq', label: 'FAQ' },
      { href: '/#contact', label: 'Contact' },
    ],
  },
] as const;

export function Footer() {
  const { user } = useAuth();

  // Signed-out visitors never see links that bounce them through login.
  const accountLinks = user
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/orders', label: 'My orders' },
      ]
    : [
        { href: '/login', label: 'Sign in' },
        { href: '/register', label: 'Create account' },
      ];

  return (
    <footer className="relative overflow-hidden border-t bg-muted/20">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grain opacity-[0.025]"
      />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <MascotMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
            <span className="font-heading font-semibold">
              TechService <span className="text-gradient-strong">Hub</span>
            </span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Your ideas. Our expertise. One digital solution — from academic projects to
            professional software, led by the founders themselves.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-3 text-sm font-semibold">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="group/link inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  >
                    <span className="h-px w-0 bg-gradient-to-r from-primary to-brand-fuchsia transition-all duration-300 group-hover/link:w-3" />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="mb-3 text-sm font-semibold">Account</p>
          <ul className="space-y-2">
            {accountLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group/link inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <span className="h-px w-0 bg-gradient-to-r from-primary to-brand-fuchsia transition-all duration-300 group-hover/link:w-3" />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative border-t border-border/60 py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground sm:px-6">
          © <CurrentYear /> TechService Hub. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
