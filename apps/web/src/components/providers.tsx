'use client';

import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/hooks/use-auth';
import { CartProvider } from '@/hooks/use-cart';
import { OnboardingOverlay } from '@/components/onboarding-overlay';
import { Toaster } from '@/components/ui/sonner';

/** Single client boundary wrapping the whole app (theme + auth + cart + toasts). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <AuthProvider>
        <CartProvider>
          {children}
          <OnboardingOverlay />
          <Toaster position="top-center" richColors closeButton />
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
