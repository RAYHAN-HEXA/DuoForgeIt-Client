'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
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
import { api, ApiClientError } from '@/lib/api';

/** Friendly messages for Firebase auth and API errors (never leak raw codes). */
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

  if (err instanceof ApiClientError) {
    if (err.status === 0 || err.code === 'NETWORK_ERROR') {
      return 'Cannot connect to the server. Please check your network connection.';
    }
    // OTP errors (OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, OTP_TOO_MANY_REQUESTS,
    // EMAIL_ALREADY_REGISTERED, DISPOSABLE_EMAIL_REJECTED, OTP_SEND_FAILED…)
    // ship friendly messages from the server — pass them through.
    return err.message;
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

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAccount, loginWithGoogle, user, firebaseUser, loading } = useAuth();
  const { mood, emailFocus, passwordFocus, blur, shake, setMood } = useMascotForm();
  const [showPassword, setShowPassword] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  /** Credentials from step 1, replayed to Firebase once the OTP clears. */
  const [pending, setPending] = useState<{ fullName: string; email: string; password: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  /** True while the OTP→create→sync chain is in flight; suppresses the auto-redirect so the celebration plays. */
  const flowActive = useRef(false);

  // Auto-redirect if already signed in (verified → dashboard, unverified →
  // the verify page). Skipped while this page's own flow is mid-flight.
  useEffect(() => {
    if (flowActive.current || loading || !user) return;
    const emailVerified = Boolean(user.emailVerified || firebaseUser?.emailVerified);
    router.replace(emailVerified ? '/dashboard' : '/verify-email');
  }, [loading, user, firebaseUser, router]);

  // 1s resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  async function requestCode(email: string, fullName: string) {
    setRequesting(true);
    try {
      await api.post('/auth/otp/request', { email, purpose: 'REGISTER', fullName });
      setResendIn(60);
      return true;
    } catch (err) {
      shake();
      toast.error('Could not send the code', { description: formatAuthError(err) });
      return false;
    } finally {
      setRequesting(false);
    }
  }

  /** Step 1 → email a code, then reveal the OTP entry. */
  async function onSubmit(values: RegisterForm) {
    const sent = await requestCode(values.email, values.fullName.trim());
    if (!sent) return;
    setPending({ fullName: values.fullName.trim(), email: values.email, password: values.password });
    setOtpCode('');
    setMood('watching');
    setStep('otp');
  }

  /** Step 2 → check the code, then create the Firebase account + profile with the grant. */
  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || otpCode.length !== 6) return;
    setVerifying(true);
    flowActive.current = true;
    try {
      const { grantToken } = await api.post<{ grantToken: string; email: string }>('/auth/otp/verify', {
        email: pending.email,
        purpose: 'REGISTER',
        code: otpCode,
      });
      await registerAccount(pending.fullName, pending.email, pending.password, grantToken);
      setMood('celebrating');
      showOnboarding();
      setTimeout(() => router.replace('/dashboard'), 900);
    } catch (err) {
      flowActive.current = false;
      shake();
      toast.error('Verification failed', { description: formatAuthError(err) });
      if (err instanceof ApiClientError && ['OTP_EXPIRED', 'OTP_LOCKED', 'OTP_NOT_FOUND'].includes(err.code)) {
        setOtpCode('');
      }
    } finally {
      setVerifying(false);
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

  if (step === 'otp' && pending) {
    return (
      <div className="page-enter space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Mascot mood={mood} className="h-40 w-40" />
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Step 2 of 2</p>
            <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">Check your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{pending.email}</span>.
              <br />
              Enter it below to finish creating your account.
            </p>
          </div>
        </div>

        <form onSubmit={onVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp" className="sr-only">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={6}
              autoFocus
              aria-invalid={false}
              className="text-center text-xl font-semibold tracking-[0.6em]"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onBlur={blur}
              onFocus={emailFocus}
            />
          </div>

          <Button type="submit" className="w-full" disabled={verifying || otpCode.length !== 6}>
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <MailCheck className="h-4 w-4" /> Verify & create account
              </>
            )}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('form');
                setOtpCode('');
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Wrong email? Go back
            </button>
            <button
              type="button"
              onClick={() => void requestCode(pending.email, pending.fullName)}
              disabled={requesting || resendIn > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood={mood} className="h-40 w-40" />
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Step 1 of 2</p>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll email you a 6-digit code to verify your address first.
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

        <Button type="submit" className="w-full" disabled={requesting}>
          {requesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending code…
            </>
          ) : (
            'Send verification code'
          )}
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
