'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import type { RegisterForm } from '@tsh/shared';
import { registerFormSchema } from '@tsh/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mascot } from '@/components/mascot';
import { GoogleIcon } from '@/components/google-icon';
import { useAuth, AuthSyncError } from '@/hooks/use-auth';
import { useMascotForm } from '@/hooks/use-mascot-form';
import { showOnboarding } from '@/components/onboarding-overlay';
import { useEffect } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAccount, loginWithGoogle, user, loading } = useAuth();
  const { mood, emailFocus, passwordFocus, blur, shake, setMood } = useMascotForm();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-redirect if already signed in
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  function formatAuthError(err: unknown): string {
    if (err instanceof AuthSyncError) {
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
        case 'auth/email-already-in-use':
          return 'An account with this email already exists — try signing in.';
        case 'auth/weak-password':
          return 'Password is too weak — use at least 6 characters.';
        case 'auth/invalid-email':
          return 'That email address does not look valid.';
        case 'auth/too-many-requests':
          return 'Too many attempts — please wait a minute and try again.';
        case 'auth/popup-blocked':
          return 'Popup was blocked by your browser. Please allow popups for this site.';
        case 'auth/unauthorized-domain':
          return 'This domain is not authorized in Firebase Authentication Console.';
        case 'auth/operation-not-allowed':
          return 'This sign-in method is not enabled in Firebase Console.';
        case 'auth/network-request-failed':
          return 'Network error — check your connection.';
        default:
          return err.message || 'Could not create your account. Please try again.';
      }
    }

    if (err instanceof Error) {
      return err.message;
    }

    return 'Could not create your account. Please try again.';
  }

  async function onSubmit(values: RegisterForm) {
    setSubmitting(true);
    try {
      await registerAccount(values.fullName.trim(), values.email, values.password);
      setMood('celebrating');
      showOnboarding();
      setTimeout(() => router.replace('/dashboard'), 900);
    } catch (err) {
      shake();
      toast.error('Registration failed', { description: formatAuthError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    try {
      await loginWithGoogle();
      router.replace('/dashboard');
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
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track orders, chat with founders, and get secure deliverables.
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Your name"
            {...form.register('fullName', { onBlur: blur })}
            onFocus={emailFocus}
          />
          {form.formState.errors.fullName && (
            <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...form.register('email', { onBlur: blur })}
            onFocus={emailFocus}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className="pr-10"
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

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your password"
            {...form.register('confirmPassword', { onBlur: blur })}
            onFocus={passwordFocus}
          />
          {form.formState.errors.confirmPassword && (
            <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Creating account…' : 'Create account'}
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
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
