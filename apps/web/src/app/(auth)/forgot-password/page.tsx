'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { toast } from 'sonner';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mascot } from '@/components/mascot';
import { useAuth } from '@/hooks/use-auth';
import { useMascotForm } from '@/hooks/use-mascot-form';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const { mood, emailFocus, blur } = useMascotForm();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      const message =
        err instanceof FirebaseError && err.code === 'auth/invalid-email'
          ? 'That email address does not look valid.'
          : err instanceof FirebaseError && err.code === 'auth/user-not-found'
            ? 'No account uses this email.'
            : 'Could not send the reset email — try again shortly.';
      toast.error('Reset failed', { description: message });
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>, a
            password-reset link is on its way.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood={mood} className="h-40 w-40" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={emailFocus}
            onBlur={blur}
          />
        </div>
        <Button type="submit" className="w-full" disabled={sending}>
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          {sending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
