import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CheckoutContent } from './checkout-content';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Deadline math calls `new Date()` at render, and the flow is auth-gated —
 * instant=false renders at request time and the Suspense boundary lets the
 * client-only subtree stream in without blocking prerender of the shell.
 */
export const instant = false;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6"><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}
