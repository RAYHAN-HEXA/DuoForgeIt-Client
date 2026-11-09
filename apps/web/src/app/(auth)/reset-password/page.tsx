'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mascot } from '@/components/mascot';
import { useAuth } from '@/hooks/use-auth';
import { useMascotForm } from '@/hooks/use-mascot-form';

function ResetPasswordContent() {
  const params = useSearchParams();
  const oobCode = params.get('oobCode');
  const { verifyResetCode, confirmPasswordReset } = useAuth();
  const { mood, passwordFocus, blur } = useMascotForm();
  // checked = code verified | invalid = bad/missing code | done = password updated
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>(oobCode ? 'checking' : 'invalid');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!oobCode) return; // initialized to 'invalid' above
    let cancelled = false;
    verifyResetCode(oobCode)
      .then((verifiedEmail) => {
        if (!cancelled) {
          setEmail(verifiedEmail);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [oobCode, verifyResetCode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password too short', { description: 'Use at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(oobCode!, password);
      setStatus('done');
    } catch (err) {
      const message =
        err instanceof FirebaseError && err.code === 'auth/weak-password'
          ? 'Password is too weak — use at least 6 characters.'
          : 'The reset link expired or was already used. Request a new one.';
      toast.error('Reset failed', { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'checking') {
    return (
      <div className="page-enter flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Validating your reset link…</p>
      </div>
    );
  }

  if (status === 'invalid' || status === 'done') {
    return (
      <div className="page-enter flex flex-col items-center gap-5 text-center">
        {status === 'done' ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 animate-badge-pop">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
              <p className="mt-2 text-sm text-muted-foreground">You can now sign in with your new password.</p>
            </div>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Link not valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This reset link is invalid, expired, or already used.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood={mood} className="h-40 w-40" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            for <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={passwordFocus}
            onBlur={blur}
            required
            minLength={6}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onFocus={passwordFocus}
            onBlur={blur}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
