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
import { useAuth } from '@/hooks/use-auth';
import { useMascotForm } from '@/hooks/use-mascot-form';
import { useState } from 'react';

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const { login, loginWithGoogle } = useAuth();
  const { mood, emailFocus, passwordFocus, blur, shake } = useMascotForm();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  /** Friendly messages for Firebase auth errors (never leak raw codes). */
  function firebaseError(err: unknown): string {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Wrong email or password. Try again.';
        case 'auth/too-many-requests':
          return 'Too many attempts — please wait a minute and try again.';
        case 'auth/user-disabled':
          return 'This account has been disabled. Contact support.';
        case 'auth/network-request-failed':
          return 'Network error — check your connection.';
        default:
          return 'Could not sign you in. Please try again.';
      }
    }
    return 'Could not sign you in. Please try again.';
  }

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      router.replace(next ?? '/dashboard');
    } catch (err) {
      shake();
      toast.error('Sign in failed', { description: firebaseError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    try {
      await loginWithGoogle();
      router.replace(next ?? '/dashboard');
    } catch (err) {
      shake();
      toast.error('Google sign-in failed', { description: firebaseError(err) });
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
