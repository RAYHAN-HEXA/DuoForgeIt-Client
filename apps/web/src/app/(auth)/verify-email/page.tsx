'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MailCheck, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mascot } from '@/components/mascot';
import { useAuth } from '@/hooks/use-auth';
import { api, ApiClientError } from '@/lib/api';

/**
 * Self-service email verification for signed-in-but-unverified accounts —
 * legacy sign-ups created before the OTP gate, or rows whose verification
 * flag never landed. A 6-digit code is emailed (purpose VERIFY); the grant
 * from /auth/otp/verify flips the stored flag via /auth/sync. Google users
 * and OTP-registered users never see this page (their flag is already true).
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, loading, refreshProfile } = useAuth();
  const [step, setStep] = useState<'idle' | 'otp'>('idle');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const email = user?.email ?? '';

  useEffect(() => {
    if (loading) return;
    // Signed-in and already verified → straight through.
    if (user?.emailVerified) router.replace('/dashboard');
  }, [loading, user, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function formatError(err: unknown): string {
    if (err instanceof ApiClientError) {
      if (err.status === 0 || err.code === 'NETWORK_ERROR') {
        return 'Cannot connect to the server. Please check your network connection.';
      }
      // OTP_* / EMAIL_* codes ship friendly server messages — pass through.
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
  }

  async function sendCode() {
    if (!email) return;
    setSending(true);
    try {
      await api.post('/auth/otp/request', { email, purpose: 'VERIFY' });
      setResendIn(60);
      setStep('otp');
      toast.success('Code sent', { description: `A 6-digit code is on its way to ${email}.` });
    } catch (err) {
      toast.error('Could not send the code', { description: formatError(err) });
    } finally {
      setSending(false);
    }
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const { grantToken } = await api.post<{ grantToken: string; email: string }>('/auth/otp/verify', {
        email,
        purpose: 'VERIFY',
        code,
      });
      // Consume the grant server-side — flips emailVerified in the DB — then
      // refresh the profile now that /auth/me is un-gated for this account.
      await api.post('/auth/sync', { registrationGrant: grantToken });
      await refreshProfile();
      toast.success('Email verified');
      router.replace('/dashboard');
    } catch (err) {
      toast.error('Verification failed', { description: formatError(err) });
      if (err instanceof ApiClientError && ['OTP_EXPIRED', 'OTP_LOCKED', 'OTP_NOT_FOUND'].includes(err.code)) {
        setCode('');
      }
    } finally {
      setVerifying(false);
    }
  }

  // Session still resolving.
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Checking your session…</p>
      </div>
    );
  }

  // Not signed in — the verify loop needs a session to sync the flag onto.
  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <MailWarning className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Verify your email</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in first — verification applies to your account.</p>
        </div>
        <Button asChild>
          <Link href="/login?next=%2Fverify-email">Sign in</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="page-enter space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Mascot mood="watching" className="h-36 w-36" />
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Enter your code</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
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
              className="text-center text-xl font-semibold tracking-[0.6em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <MailCheck className="h-4 w-4" /> Verify email
              </>
            )}
          </Button>

          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={sending || resendIn > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="page-enter flex flex-col items-center gap-6 py-6 text-center">
      <Mascot mood="idle" className="h-36 w-36" />
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Verify your email</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email}</span> still needs verification before you can
          continue. We&apos;ll send a 6-digit code — it expires in 10 minutes.
        </p>
      </div>
      <Button onClick={() => void sendCode()} disabled={sending} className="w-full max-w-xs">
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          'Send verification code'
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        Wrong account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in with a different email
        </Link>
      </p>
    </div>
  );
}
