'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, Lock, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

/**
 * Client-side route guards. IMPORTANT (PRD §3): hiding buttons is never the
 * authorization mechanism — every protected API endpoint enforces role and
 * ownership server-side. These guards only shape the UX.
 */

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // window.location read keeps the dynamic-path access out of prerender
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [loading, user, router]);

  if (loading) return <GuardLoader />;
  if (!user) return <GuardLoader />; // redirect is in flight
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=/admin');
  }, [loading, user, router]);

  if (loading) return <GuardLoader />;
  if (!user) return <GuardLoader />; // redirect is in flight
  if (!isAdmin) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-medium">Admin access only</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;re signed in as {user.email}. Switch to a founder account to open the admin console.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link href="/dashboard">My dashboard</Link></Button>
              <Button variant="ghost" onClick={() => void logout().then(() => router.replace('/login'))}>Sign out</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

function GuardLoader() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Checking your session…</p>
      </div>
    </div>
  );
}

/** Inline "sign in to continue" panel for embedding in pages. */
export function AuthPrompt({ message = 'Sign in to continue' }: { message?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/register">Create account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
