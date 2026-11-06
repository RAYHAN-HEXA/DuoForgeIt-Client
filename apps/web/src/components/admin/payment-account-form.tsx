'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { AdminPaymentAccountDto } from '@tsh/shared';
import { paymentAccountCreateSchema, paymentAccountUpdateSchema } from '@tsh/shared';
import { api, errorMessage, uploadToBlob, BlobUploadTicket } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const QR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const QR_MAX_BYTES = 5 * 1024 * 1024;


type FormState = {
  methodKey: string;
  label: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
  instructions: string;
  displayOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  methodKey: 'BKASH',
  label: '',
  accountNumber: '',
  accountHolder: '',
  accountType: '',
  instructions: '',
  displayOrder: '',
  isActive: true,
};

const METHOD_SUGGESTIONS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'BANK_TRANSFER'];

function errorsFrom(result: { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}

export function PaymentAccountForm({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AdminPaymentAccountDto | null;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = Boolean(account);
  const [form, setForm] = useState<FormState>(() =>
    account
      ? {
          methodKey: account.methodKey,
          label: account.label,
          accountNumber: account.accountNumber,
          accountHolder: account.accountHolder,
          accountType: account.accountType ?? '',
          instructions: account.instructions ?? '',
          displayOrder: String(account.displayOrder),
          isActive: account.isActive,
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  // undefined = leave existing QR unchanged; null = remove; string = replace.
  const [qrPathname, setQrPathname] = useState<string | null | undefined>(undefined);
  const [qrPreview, setQrPreview] = useState<string | null>(account?.qrUrl ?? null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function uploadQr(file: File) {
    if (!QR_MIME_TYPES.includes(file.type as (typeof QR_MIME_TYPES)[number])) {
      toast.error('QR image must be a PNG, JPEG or WebP file');
      return;
    }
    if (file.size > QR_MAX_BYTES) {
      toast.error('QR image must be 5 MB or smaller');
      return;
    }

    setQrUploading(true);
    try {
      const ticket = await api.post<BlobUploadTicket>('/admin/payment-accounts/qr/sign', {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      const pathname = await uploadToBlob(file, ticket);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const preview = URL.createObjectURL(file);
      objectUrlRef.current = preview;
      setQrPathname(pathname);
      setQrPreview(preview);
      toast.success('QR image uploaded — save to apply it');
    } catch (err) {
      // Keep the previous QR reference and preview intact on failure.
      toast.error('QR upload failed', { description: errorMessage(err) });
    } finally {
      setQrUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeQr() {
    setQrPathname(null);
    setQrPreview(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || qrUploading) return;

    const trimmed = {
      methodKey: form.methodKey.trim(),
      label: form.label.trim(),
      accountNumber: form.accountNumber.trim(),
      accountHolder: form.accountHolder.trim(),
      accountType: form.accountType.trim(),
      instructions: form.instructions.trim(),
      displayOrder: form.displayOrder.trim(),
      isActive: form.isActive,
    };

    if (isEdit) {
      const payload: Record<string, unknown> = {
        methodKey: trimmed.methodKey,
        label: trimmed.label,
        accountNumber: trimmed.accountNumber,
        accountHolder: trimmed.accountHolder,
        accountType: trimmed.accountType || null,
        instructions: trimmed.instructions || null,
        isActive: trimmed.isActive,
        ...(trimmed.displayOrder ? { displayOrder: Number(trimmed.displayOrder) } : {}),
      };
      if (qrPathname !== undefined) payload.qrPathname = qrPathname;

      const parsed = paymentAccountUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(errorsFrom(parsed));
        return;
      }

      setSaving(true);
      try {
        await api.patch(`/admin/payment-accounts/${account!.id}`, parsed.data);
        toast.success('Payment account updated');
        await onSaved();
        onOpenChange(false);
      } catch (err) {
        toast.error('Could not update account', { description: errorMessage(err) });
      } finally {
        setSaving(false);
      }
      return;
    }

    const payload: Record<string, unknown> = {
      methodKey: trimmed.methodKey,
      label: trimmed.label,
      accountNumber: trimmed.accountNumber,
      accountHolder: trimmed.accountHolder,
      ...(trimmed.accountType ? { accountType: trimmed.accountType } : {}),
      ...(trimmed.instructions ? { instructions: trimmed.instructions } : {}),
      ...(trimmed.displayOrder ? { displayOrder: Number(trimmed.displayOrder) } : {}),
      isActive: trimmed.isActive,
      ...(typeof qrPathname === 'string' ? { qrPathname } : {}),
    };

    const parsed = paymentAccountCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(errorsFrom(parsed));
      return;
    }

    setSaving(true);
    try {
      await api.post('/admin/payment-accounts', parsed.data);
      toast.success('Payment account created');
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not create account', { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || qrUploading;

  return (
    <Dialog open={open} onOpenChange={(next) => !disabled && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit payment account' : 'Add payment account'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the receiving account customers will see. Existing payment records keep their original snapshots.'
              : 'Add a receiving account customers can use for manual payments. Only active accounts are shown to customers.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pa-method">Payment method</Label>
              <Input
                id="pa-method"
                value={form.methodKey}
                onChange={(e) => setField('methodKey', e.target.value.toUpperCase())}
                placeholder="BKASH"
                list="payment-method-keys"
                autoComplete="off"
                aria-invalid={Boolean(errors.methodKey)}
                disabled={disabled}
              />
              <datalist id="payment-method-keys">
                {METHOD_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Uppercase letters, digits and underscores. Custom rails are allowed.
              </p>
              {errors.methodKey && <p className="text-xs text-destructive">{errors.methodKey}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-label">Account label</Label>
              <Input
                id="pa-label"
                value={form.label}
                onChange={(e) => setField('label', e.target.value)}
                placeholder="Main bKash — Personal"
                maxLength={120}
                aria-invalid={Boolean(errors.label)}
                disabled={disabled}
              />
              {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-number">Account number</Label>
              <Input
                id="pa-number"
                value={form.accountNumber}
                onChange={(e) => setField('accountNumber', e.target.value)}
                placeholder="01XXXXXXXXX"
                maxLength={60}
                aria-invalid={Boolean(errors.accountNumber)}
                disabled={disabled}
              />
              {errors.accountNumber && <p className="text-xs text-destructive">{errors.accountNumber}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-holder">Account holder</Label>
              <Input
                id="pa-holder"
                value={form.accountHolder}
                onChange={(e) => setField('accountHolder', e.target.value)}
                placeholder="Name on the account"
                maxLength={120}
                aria-invalid={Boolean(errors.accountHolder)}
                disabled={disabled}
              />
              {errors.accountHolder && <p className="text-xs text-destructive">{errors.accountHolder}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-type">Account type (optional)</Label>
              <Input
                id="pa-type"
                value={form.accountType}
                onChange={(e) => setField('accountType', e.target.value)}
                placeholder="Personal, Merchant, Savings…"
                maxLength={40}
                aria-invalid={Boolean(errors.accountType)}
                disabled={disabled}
              />
              {errors.accountType && <p className="text-xs text-destructive">{errors.accountType}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-order">Display order (optional)</Label>
              <Input
                id="pa-order"
                type="number"
                min={0}
                max={100000}
                value={form.displayOrder}
                onChange={(e) => setField('displayOrder', e.target.value)}
                placeholder="Append to the end"
                aria-invalid={Boolean(errors.displayOrder)}
                disabled={disabled}
              />
              {errors.displayOrder && <p className="text-xs text-destructive">{errors.displayOrder}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pa-instructions">Instructions (optional)</Label>
            <Textarea
              id="pa-instructions"
              value={form.instructions}
              onChange={(e) => setField('instructions', e.target.value)}
              placeholder="e.g. Send money, then submit the TrxID shown in bKash."
              maxLength={1000}
              rows={3}
              aria-invalid={Boolean(errors.instructions)}
              disabled={disabled}
            />
            {errors.instructions && <p className="text-xs text-destructive">{errors.instructions}</p>}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive accounts stay in the database but are hidden from customers.
              </p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setField('isActive', checked)}
              disabled={disabled}
              aria-label="Account active"
            />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">QR image (optional)</p>
                <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 5 MB.</p>
              </div>
              <div className="flex gap-2">
                {qrPreview && (
                  <Button type="button" variant="outline" size="sm" onClick={removeQr} disabled={disabled}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  {qrUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {qrUploading ? 'Uploading…' : qrPreview ? 'Replace' : 'Upload'}
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={QR_MIME_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadQr(file);
              }}
            />
            {qrPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrPreview}
                alt="Payment account QR preview"
                className="h-40 w-40 rounded-md border object-contain p-1"
              />
            ) : (
              <p className="text-xs text-muted-foreground">No QR image attached.</p>
            )}
            {qrPathname === null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                The current QR image will be removed when you save.
              </p>
            )}
          </div>

          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
