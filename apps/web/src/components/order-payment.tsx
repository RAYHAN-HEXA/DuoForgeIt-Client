'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Clock,
  Copy,
  ImagePlus,
  Loader2,
  QrCode,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import type { OrderDto, PaymentAccountOptionDto, PaymentDto } from '@tsh/shared';
import { PAYMENT_ERROR_CODES, formatBDT, paymentSubmitV2Schema } from '@tsh/shared';
import {
  api,
  ApiClientError,
  errorMessage,
  uploadToBlob,
  BlobUploadTicket,
  validationDetails,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentMethodBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';

/**
 * Customer manual-payment experience (Stage 5) — extends the order page with
 * the account-driven V2 flow. The backend owns every rule: exact outstanding
 * amount, account activity, duplicate TrxIDs, negotiated-order bKash-only
 * restriction, and verification. The UI only displays what the server
 * returned and never invents a successful state — SUBMITTED means "awaiting
 * admin review", nothing more.
 */

const SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

// ── Exact money helpers (string decimals → BigInt cents; never floats).
// BigInt(...) constructor calls instead of literals — the web tsconfig
// targets ES2017, which rejects `100n` syntax.

const ONE_HUNDRED = BigInt(100);
const ZERO = BigInt(0);
/** Shared zero constant (BigInt(0)) — page files compare outstanding against it. */
export const ZERO_CENTS = ZERO;

export function moneyToCents(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * ONE_HUNDRED + BigInt((frac + '00').slice(0, 2));
}

function centsToMoney(cents: bigint): string {
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  const money = `${abs / ONE_HUNDRED}.${(abs % ONE_HUNDRED).toString().padStart(2, '0')}`;
  return negative ? `-${money}` : money;
}

/** Mirrors the backend's computeOutstanding: total − Σ VERIFIED payments. */
export function orderOutstanding(order: Pick<OrderDto, 'totalAmount' | 'payments'>): string {
  const paid = order.payments
    .filter((p) => p.status === 'VERIFIED')
    .reduce((sum, p) => sum + moneyToCents(p.amount), ZERO);
  return centsToMoney(moneyToCents(order.totalAmount) - paid);
}

type AccountList = { items: PaymentAccountOptionDto[] };

type Screenshot = { pathname: string; mimeType: string; sizeBytes: number; previewUrl: string };

export function OrderPaymentSection({
  order,
  rejectedPayment,
  onDone,
}: {
  order: OrderDto;
  /** Latest REJECTED payment whose reason the customer must see. */
  rejectedPayment?: PaymentDto;
  onDone: () => void;
}) {
  const outstanding = orderOutstanding(order);
  const outstandingCents = moneyToCents(outstanding);
  const paidCents = moneyToCents(order.totalAmount) - outstandingCents;

  const {
    data: accounts,
    error: accountsError,
    mutate: revalidateAccounts,
  } = useSWR<AccountList>('/payment-accounts', () => api.get<AccountList>('/payment-accounts'));
  const accountItems = accounts?.items ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = accountItems.find((a) => a.id === selectedId) ?? null;

  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  async function copyAccountNumber() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.accountNumber);
      setCopied(true);
      toast.success('Account number copied');
    } catch {
      toast.error('Could not copy — long-press the number to copy it manually');
    }
  }

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function uploadScreenshot(file: File) {
    setFieldErrors((prev) => {
      if (!prev.screenshot) return prev;
      const next = { ...prev };
      delete next.screenshot;
      return next;
    });
    if (!SCREENSHOT_MIME_TYPES.includes(file.type as (typeof SCREENSHOT_MIME_TYPES)[number])) {
      setFieldErrors((prev) => ({
        ...prev,
        screenshot: 'Screenshot must be a PNG, JPEG or WebP file',
      }));
      return;
    }
    if (file.size > SCREENSHOT_MAX_BYTES) {
      setFieldErrors((prev) => ({ ...prev, screenshot: 'Screenshot must be 5 MB or smaller' }));
      return;
    }

    setScreenshotUploading(true);
    try {
      const ticket = await api.post<BlobUploadTicket>('/uploads/blob/token', {
        folder: 'payments',
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      const pathname = await uploadToBlob(file, ticket);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      setScreenshot({ pathname, mimeType: file.type, sizeBytes: file.size, previewUrl });
      toast.success('Screenshot uploaded — submit your payment to finish');
    } catch (err) {
      toast.error('Screenshot upload failed', { description: errorMessage(err) });
    } finally {
      setScreenshotUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeScreenshot() {
    setScreenshot(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit() {
    if (submitting || screenshotUploading || !selected) return;
    setFormError(null);
    setFieldErrors({});

    // The client sends the outstanding it displays; the backend recomputes
    // the authoritative balance and rejects any mismatch.
    const payload = {
      accountId: selected.id,
      transactionId: transactionId.trim(),
      ...(senderNumber.trim() ? { senderNumber: senderNumber.trim() } : {}),
      amount: outstanding,
      ...(screenshot
        ? {
            screenshotPathname: screenshot.pathname,
            screenshotMimeType: screenshot.mimeType,
            screenshotSizeBytes: screenshot.sizeBytes,
          }
        : {}),
    };

    const parsed = paymentSubmitV2Schema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join('.') || 'form';
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/orders/${order.id}/payments/v2`, parsed.data);
      toast.success('Payment submitted — we will review it shortly');
      onDone();
    } catch (err) {
      setFieldErrors(validationDetails(err));
      if (err instanceof ApiClientError) {
        switch (err.code) {
          case PAYMENT_ERROR_CODES.DUPLICATE_TRANSACTION:
            setFormError(
              'This transaction ID is already recorded on a payment awaiting review. Check the ID — if you sent money twice, wait for the first review or contact support.',
            );
            break;
          case PAYMENT_ERROR_CODES.PAYMENT_ALREADY_PENDING:
            setFormError(
              'This order already has a payment awaiting verification. Wait for it to be reviewed.',
            );
            break;
          case PAYMENT_ERROR_CODES.AMOUNT_MISMATCH: {
            const expected =
              (err.details as { expected?: string } | undefined)?.expected ?? outstanding;
            setFormError(
              `Payment amounts must match exactly — send and submit ${formatBDT(expected)}.`,
            );
            break;
          }
          case PAYMENT_ERROR_CODES.INVALID_PAYMENT_ACCOUNT:
            setFormError(err.message);
            break;
          case PAYMENT_ERROR_CODES.ORDER_ALREADY_PAID:
            setFormError('This order is already fully paid.');
            break;
          default:
            setFormError(errorMessage(err));
        }
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" /> Pay for this order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Payment summary — server data only, exact decimal arithmetic */}
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Order total" value={formatBDT(order.totalAmount)} />
          <SummaryTile label="Paid so far" value={formatBDT(centsToMoney(paidCents))} muted />
          <SummaryTile label="Outstanding" value={formatBDT(outstanding)} highlight />
        </div>

        {rejectedPayment && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Your previous payment was rejected</p>
              <p className="mt-0.5 text-destructive/90">
                {rejectedPayment.rejectionReason ??
                  rejectedPayment.adminNote ??
                  'No reason was provided.'}{' '}
                Submit a corrected payment below — historical records are kept.
              </p>
            </div>
          </div>
        )}

        {/* Everything below the summary requires a usable receiving-account
            list: when none are published (or the list fails to load) the pay
            form is hidden entirely — a customer must never compose a payment
            they cannot submit. */}
        {accountsError ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm">
            <p className="text-muted-foreground">Could not load payment accounts.</p>
            <p className="mt-1 text-xs text-muted-foreground">{errorMessage(accountsError)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void revalidateAccounts()}
            >
              Try again
            </Button>
          </div>
        ) : !accounts ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : accountItems.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payment accounts are available"
            description="We have not published any receiving accounts yet. Please contact support before sending money."
            className="py-8"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/#contact">Contact support</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ol className="space-y-1 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent p-3 text-sm text-muted-foreground">
              <li>
                1. Pick a receiving account below and open its app (bKash / Nagad / Rocket / your
                bank).
              </li>
              <li>2. Send exactly {formatBDT(outstanding)} to the displayed account number.</li>
              <li>3. Copy the transaction ID (TrxID) from your payment receipt.</li>
              <li>4. Come back here, enter the details and submit.</li>
              <li className="font-medium text-foreground">
                A founder reviews every payment manually — you will see the status update on this
                page.
              </li>
            </ol>

            {/* Account selection */}
            <div className="space-y-2">
              <Label>Receiving account</Label>
              <RadioGroup
                value={selectedId ?? ''}
                onValueChange={(value) => {
                  setSelectedId(value);
                  setFieldErrors((prev) => {
                    if (!prev.accountId) return prev;
                    const next = { ...prev };
                    delete next.accountId;
                    return next;
                  });
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                {accountItems.map((account) => (
                  <Label
                    key={account.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.04] has-[[data-state=checked]]:shadow-glow',
                      selectedId && selectedId !== account.id && 'opacity-70',
                    )}
                  >
                    <RadioGroupItem value={account.id} className="mt-0.5" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <PaymentMethodBadge method={account.methodKey} />
                        <span className="truncate font-medium">{account.label}</span>
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {account.accountNumber}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {account.accountHolder}
                        {account.accountType ? ` · ${account.accountType}` : ''}
                        {account.qrUrl ? ' · QR available' : ''}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {fieldErrors.accountId && (
                <p className="text-xs text-destructive">{fieldErrors.accountId}</p>
              )}
            </div>

            {/* Selected account details + instructions */}
            {selected && (
              <div className="space-y-4 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <PaymentMethodBadge method={selected.methodKey} /> {selected.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send to —{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {selected.accountNumber}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.accountHolder}
                      {selected.accountType ? ` · ${selected.accountType}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyAccountNumber()}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? 'Copied' : 'Copy number'}
                    </Button>
                  </div>
                </div>

                {selected.instructions && (
                  <>
                    <Separator />
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {selected.instructions}
                    </p>
                  </>
                )}

                {selected.qrUrl && (
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.qrUrl}
                      alt={`QR code for ${selected.label}`}
                      className="h-32 w-32 rounded-md border bg-white object-contain p-1"
                    />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <QrCode className="h-3.5 w-3.5" />
                      Scan this QR in the app to prefill the receiving details.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submission form */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amount">Amount to send</Label>
                  <Input id="pay-amount" value={formatBDT(outstanding)} readOnly aria-readonly />
                  <p className="text-xs text-muted-foreground">
                    Full outstanding amount — partial payments are not supported.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-sender">
                    Your {selected?.methodKey === 'BANK_TRANSFER' ? 'bank account' : 'wallet'}{' '}
                    number
                  </Label>
                  <Input
                    id="pay-sender"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    maxLength={32}
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={Boolean(fieldErrors.senderNumber)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The number you sent from — helps us match your transfer.
                  </p>
                  {fieldErrors.senderNumber && (
                    <p className="text-xs text-destructive">{fieldErrors.senderNumber}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-trx">Transaction ID (TrxID)</Label>
                <Input
                  id="pay-trx"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. BKASH8H2K9L0P"
                  maxLength={60}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.transactionId)}
                />
                <p className="text-xs text-muted-foreground">
                  Copy the exact TrxID from your payment confirmation SMS or app receipt.
                </p>
                {fieldErrors.transactionId && (
                  <p className="text-xs text-destructive">{fieldErrors.transactionId}</p>
                )}
              </div>

              {/* Optional screenshot */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Payment screenshot (optional)</p>
                    <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 5 MB.</p>
                  </div>
                  <div className="flex gap-2">
                    {screenshot && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeScreenshot}
                        disabled={screenshotUploading}
                      >
                        <X className="h-4 w-4" /> Remove
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={screenshotUploading}
                    >
                      {screenshotUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                      {screenshotUploading ? 'Uploading…' : screenshot ? 'Replace' : 'Upload'}
                    </Button>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SCREENSHOT_MIME_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadScreenshot(file);
                  }}
                />
                {screenshot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={screenshot.previewUrl}
                    alt="Payment screenshot preview"
                    className="h-32 w-32 rounded-md border object-cover"
                  />
                )}
                {fieldErrors.screenshot && (
                  <p className="text-xs text-destructive">{fieldErrors.screenshot}</p>
                )}
              </div>

              {formError && (
                <div
                  className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{formError}</p>
                </div>
              )}

              <Button
                className="w-full sm:w-auto"
                onClick={() => void submit()}
                disabled={
                  submitting || screenshotUploading || !selected || transactionId.trim().length < 6
                }
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitting ? 'Submitting…' : `Submit ${formatBDT(outstanding)} for verification`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Submitting does not mark the order paid — an administrator verifies the transaction
                first.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-card/60 p-3 shadow-soft transition-colors',
        highlight &&
          'border-primary/30 bg-gradient-to-br from-primary/10 to-brand-fuchsia/5 shadow-glow',
      )}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-heading text-lg font-semibold',
          muted && 'text-muted-foreground',
          highlight && 'text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Contextual status banner shown inside the Payments history card. */
export function PaymentStatusBanner({
  payments,
  fullyPaid,
}: {
  payments: PaymentDto[];
  fullyPaid: boolean;
}) {
  const active = payments.find((p) => p.status === 'SUBMITTED' || p.status === 'PENDING');
  const refunded = payments.find((p) => p.status === 'REFUNDED');

  if (fullyPaid) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Payment complete</p>
          <p className="mt-0.5 text-emerald-700/80 dark:text-emerald-300/80">
            Your payments for this order are fully verified. Thank you!
          </p>
        </div>
      </div>
    );
  }

  if (active) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-300">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Payment under review</p>
          <p className="mt-0.5">
            We received {formatBDT(active.amount)}
            {active.transactionId ? ` (TrxID ${active.transactionId})` : ''} on{' '}
            {new Date(active.createdAt).toLocaleString()}. A founder is verifying it — this page
            refreshes automatically every 30 seconds until the review is done.
          </p>
        </div>
      </div>
    );
  }

  if (refunded) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          A refunded payment of {formatBDT(refunded.amount)} is on this order&apos;s history below.
        </p>
      </div>
    );
  }

  return null;
}
