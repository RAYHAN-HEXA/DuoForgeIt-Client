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
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <MascotMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
            <span className="font-semibold">TechService Hub</span>
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
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
                    className="inline-block text-sm text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:text-foreground"
                  >
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
                  className="inline-block text-sm text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground sm:px-6">
          © <CurrentYear /> TechService Hub. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
