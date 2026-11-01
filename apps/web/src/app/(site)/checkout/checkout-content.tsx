'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  FileUp,
  Loader2,
  Paperclip,
  Trash2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { FounderDto, OrderDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api, errorMessage, uploadToCloudinary, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { AuthPrompt } from '@/components/guards';
import { FounderPicker, type FounderChoice } from '@/components/founder-picker';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';

const STEPS = ['Review', 'Requirements', 'Files', 'Deadline', 'Your lead', 'Pricing', 'Payment', 'Submit'] as const;

type StagedFile = {
  publicId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function CheckoutContent() {
  const { user, loading } = useAuth();
  const { cart, loading: cartLoading, refresh } = useCart();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [founderChoice, setFounderChoice] = useState<FounderChoice>('AUTO_ASSIGN');
  const [paymentMethod, setPaymentMethod] = useState('BKASH');
  const [submitting, setSubmitting] = useState(false);
  /**
   * One checkout attempt = one idempotency key (retries replay the same order).
   * Generated lazily in the submit handler — unstable values are forbidden
   * during prerender under cacheComponents.
   */
  const idempotencyKeyRef = useRef('');
  const getIdempotencyKey = () => {
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    return idempotencyKeyRef.current;
  };

  const { data: homepage } = useSWR('/public/homepage', () => api.get<{ founders: FounderDto[] }>('/public/homepage'), {
    revalidateOnFocus: false,
  });

  const minDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const suggestedDeadline = useMemo(() => {
    const days = Math.max(7, (cart?.estimatedDays ?? 7) + 3);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [cart?.estimatedDays]);

  if (loading) return <div className="flex-1" />;
  if (!user) return <AuthPrompt message="Sign in to check out — your cart is saved to your account." />;

  if (cartLoading && !cart) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-4xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertCircle}
          title="Nothing to check out"
          description="Your cart is empty — add a service first."
          action={<Button asChild><Link href="/services">Browse services</Link></Button>}
        />
      </div>
    );
  }

  async function onUpload(files: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - staged.length)) {
        const sign = await api.post<{
          uploadUrl: string;
          publicId: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          folder: string;
        }>('/uploads/sign', { folder: 'requirements' });
        const publicId = await uploadToCloudinary(file, sign);
        setStaged((prev) => [
          ...prev,
          { publicId, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size },
        ]);
      }
      toast.success('File uploaded');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'FILE_STORAGE_UNCONFIGURED') {
        toast.warning('File uploads unavailable', {
          description: 'Secure file storage is not set up yet. Describe your requirements in text — the founder will follow up.',
        });
      } else {
        toast.error('Upload failed', { description: errorMessage(err) });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const { order } = await api.post<{ order: OrderDto; replayed: boolean }>('/orders', {
        idempotencyKey: getIdempotencyKey(),
        items: cart!.items.map((i) => ({
          serviceId: i.service.id,
          quantity: i.quantity,
          optionIds: i.options.map((o) => o.id),
          ...(i.requirements ? { requirements: i.requirements } : {}),
        })),
        deadline: new Date(`${deadline || suggestedDeadline}T23:59:00`).toISOString(),
        founderPreference: founderChoice,
        notes: notes.trim() || undefined,
        attachmentIds: [],
      });

      // Register staged files against the fresh order (best-effort; retriable from the order page)
      for (const f of staged) {
        try {
          await api.post(`/orders/${order.id}/attachments`, f);
        } catch {
          toast.warning('One or more files could not be attached — re-attach from the order page.');
        }
      }

      // Remember the payment method for the order-page payment form
      sessionStorage.setItem(`tsh-payment-method-${order.id}`, paymentMethod);
      await refresh();
      toast.success(`Order ${order.orderNumber} submitted`, {
        description: 'Next: pay via your chosen method and submit the transaction ID.',
      });
      router.replace(`/orders/${order.id}`);
    } catch (err) {
      toast.error('Checkout failed', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance = [
    true, // review
    true, // requirements optional
    true, // files optional
    Boolean(deadline || suggestedDeadline), // deadline
    true, // founder (AUTO_ASSIGN default)
    true, // pricing
    true, // payment method (prefilled)
    true, // submit
  ][step];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-muted-foreground">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>
      <Progress value={((step + 1) / STEPS.length) * 100} className="mt-4" />

      <Card className="mt-6">
        <CardContent className="p-6 sm:p-8">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Review your services</h2>
              {cart.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">
                      {item.service.name} <span className="text-muted-foreground">× {item.quantity}</span>
                    </p>
                    {item.options.length > 0 && (
                      <ul className="mt-1 text-sm text-muted-foreground">
                        {item.options.map((o) => (
                          <li key={o.id}>+ {o.label}</li>
                        ))}
                      </ul>
                    )}
                    {item.requirements && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">Requirements: {item.requirements}</p>
                    )}
                  </div>
                  <p className="font-semibold">{formatBDT(item.lineTotal)}</p>
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Project requirements</h2>
              <p className="text-sm text-muted-foreground">
                Overall notes for the whole order (per-item requirements stay editable in your cart and order page).
              </p>
              <Textarea
                rows={6}
                maxLength={8000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything both founders should know: context, links, constraints, academic formatting requirements…"
              />
              <p className="text-xs text-muted-foreground">{notes.length}/8000</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Reference files (optional)</h2>
              <p className="text-sm text-muted-foreground">
                Briefs, slides, past work — up to 5 files, 10 MB each. Stored privately and shared only with your project lead.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && void onUpload(e.target.files)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.zip"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || staged.length >= 5}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Choose files'}
              </Button>
              {staged.length > 0 && (
                <ul className="space-y-2">
                  {staged.map((f) => (
                    <li key={f.publicId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        {f.fileName}
                        <span className="text-xs text-muted-foreground">({Math.round(f.sizeBytes / 1024)} KB)</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setStaged((prev) => prev.filter((x) => x.publicId !== f.publicId))}
                        aria-label={`Remove ${f.fileName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Project deadline</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                When do you need the finished project?
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  min={minDeadline}
                  value={deadline || suggestedDeadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-56"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled from the estimated delivery time ({cart.estimatedDays} days + buffer). Minimum: tomorrow.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <UserCheck className="h-4 w-4 text-primary" /> Choose your project lead
              </h2>
              <FounderPicker founders={homepage?.founders ?? []} value={founderChoice} onChange={setFounderChoice} />
              <p className="text-xs text-muted-foreground">
                This is a preference — founders may reassign internally to balance workload; you&apos;ll be notified.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Pricing review</h2>
              <div className="space-y-2 text-sm">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {item.service.name} × {item.quantity}
                    </span>
                    <span>{formatBDT(item.lineTotal)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total due</span>
                  <span className="text-lg text-primary">{formatBDT(cart.total)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Totals are computed from the live catalog at submission time — locked into your order as snapshot pricing.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Wallet className="h-4 w-4 text-primary" /> Payment method
              </h2>
              <p className="text-sm text-muted-foreground">
                Manual verification in this release: pay after submitting the order, then record your transaction ID —
                a founder verifies it against our records.
              </p>
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'BKASH', label: 'bKash', hint: 'Mobile wallet' },
                  { value: 'NAGAD', label: 'Nagad', hint: 'Mobile wallet' },
                  { value: 'ROCKET', label: 'Rocket', hint: 'Mobile wallet' },
                  { value: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'Direct deposit' },
                ].map((m) => (
                  <Label
                    key={m.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={m.value} />
                    <span>
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Submit your order</h2>
              <div className="space-y-1.5 rounded-lg border p-4 text-sm">
                <Row label="Items" value={`${cart.items.length}`} />
                <Row label="Deadline" value={new Date(`${deadline || suggestedDeadline}T23:59:00`).toLocaleDateString()} />
                <Row
                  label="Project lead"
                  value={founderChoice === 'AUTO_ASSIGN' ? 'Auto-assign' : founderChoice === 'FOUNDER_A' ? 'Founder A (preferred)' : 'Founder B (preferred)'}
                />
                <Row label="Files" value={staged.length ? `${staged.length} attached` : 'None'} />
                <Row label="Payment method" value={paymentMethod === 'BANK_TRANSFER' ? 'Bank transfer' : paymentMethod} />
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatBDT(cart.total)}</span>
                </div>
              </div>
              <Button size="lg" className="w-full" onClick={onSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Submitting…' : `Submit order — ${formatBDT(cart.total)}`}
              </Button>
            </div>
          )}

          {/* Step controls */}
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Badge variant="secondary">Final step</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
