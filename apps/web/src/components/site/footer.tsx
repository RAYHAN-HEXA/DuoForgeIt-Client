'use client';

import Link from 'next/link';
import { MascotMark } from '@/components/mascot';
import { CurrentYear } from '@/components/year';

const columns = [
  {
    title: 'Services',
    links: [
      { href: '/services?category=web-development', label: 'Website Development' },
      { href: '/services?category=software-projects', label: 'Software & Programming' },
      { href: '/services?category=academic-documentation-presentation', label: 'Academic Docs & Presentations' },
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
  {
    title: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create account' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/orders', label: 'My orders' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2.5">
            <MascotMark className="h-8 w-8" />
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
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground sm:px-6">
          © <CurrentYear /> TechService Hub. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
