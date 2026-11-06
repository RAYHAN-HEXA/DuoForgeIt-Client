'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import type { LoginForm } from '@tsh/shared';
import { loginFormSchema } from '@tsh/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mascot } from '@/components/mascot';
import { GoogleIcon } from '@/components/google-icon';
import { useAuth, AuthSyncError } from '@/hooks/use-auth';
import { useMascotForm } from '@/hooks/use-mascot-form';
import { useState, useEffect } from 'react';

/** Only same-origin absolute paths (a single leading `/`, no scheme, no `//`). */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  // Backslash tricks and control characters never belong in an internal path.
  if (/[\r\n\\]/.test(raw)) return '/dashboard';
  return raw;
}

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const { login, loginWithGoogle, user, loading } = useAuth();
  const { mood, emailFocus, passwordFocus, blur, shake } = useMascotForm();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.replace(safeNextPath(next));
    }
  }, [loading, user, router, next]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  /** Friendly messages for Firebase auth and profile sync errors (never leak raw codes). */
  function formatAuthError(err: unknown): string {
    if (err instanceof AuthSyncError) {
      if (err.code === 'VERIFY_EMAIL_FIRST') {
        return 'Please verify your email before logging in. Check your inbox for the verification link.';
      }
      if (err.code === 'EMAIL_LINKED_TO_DIFFERENT_UID') {
        return 'This email is already associated with another sign-in method.';
      }
      if (err.status === 503) {
        return 'Authentication service is not configured on the server.';
      }
      if (err.status === 0 || err.code === 'NETWORK_ERROR') {
        return 'Cannot connect to the server. Please check your network connection.';
      }
      return err.message || 'Could not synchronize your profile with the server.';
    }

    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Wrong email or password. Try again.';
        case 'auth/invalid-email':
          return 'Please enter a valid email address.';
        case 'auth/too-many-requests':
          return 'Too many attempts — please wait a minute and try again.';
        case 'auth/user-disabled':
          return 'This account has been disabled. Contact support.';
        case 'auth/account-exists-with-different-credential':
          return 'An account already exists with the same email using a different sign-in method.';
        case 'auth/unauthorized-domain':
          return 'This domain is not authorized in Firebase Authentication Console.';
        case 'auth/popup-blocked':
          return 'Popup was blocked by your browser. Please allow popups for this site.';
        case 'auth/operation-not-allowed':
          return 'This sign-in method is not enabled in Firebase Console.';
        case 'auth/network-request-failed':
          return 'Network error — check your connection.';
        default:
          return err.message || 'Could not sign you in. Please try again.';
      }
    }

    if (err instanceof Error) {
      return err.message;
    }

    return 'Could not sign you in. Please try again.';
  }

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      router.replace(safeNextPath(next));
    } catch (err) {
      shake();
      toast.error('Sign in failed', { description: formatAuthError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    try {
      await loginWithGoogle();
      router.replace(safeNextPath(next));
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/popup-closed-by-user') {
        return;
      }
      shake();
      toast.error('Google sign-in failed', { description: formatAuthError(err) });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood={mood} className="h-40 w-40" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to track your projects and orders.</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" aria-describedby="auth-live">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email', { onBlur: blur })}
            onFocus={emailFocus}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-10"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password', { onBlur: blur })}
              onFocus={passwordFocus}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
          or
        </span>
      </div>

      <Button variant="outline" className="w-full" onClick={onGoogle}>
        <GoogleIcon /> Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
