'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import type { MarketplaceServiceFormDto } from '@tsh/shared';
import { buildRequestAnswersSchema, type ServiceFormFieldDef } from '@tsh/shared';
import { api, errorMessage, validationDetails } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Reveal } from '@/components/motion/reveal';
import { RequireAuth } from '@/components/guards';

type Field = MarketplaceServiceFormDto['fields'][number];

export function RequestFormContent({ slug }: { slug: string }) {
  return (
    <RequireAuth>
      <Inner slug={slug} />
    </RequireAuth>
  );
}

function Inner({ slug }: { slug: string }) {
  const { data, isLoading, error } = useSWR<MarketplaceServiceFormDto>(
    `request-form:${slug}`,
    () => api.get<MarketplaceServiceFormDto>(`/marketplace/services/${slug}/form`),
  );
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (error || !data)
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load this request form"
        description={errorMessage(error) ?? 'The service may be unavailable.'}
      />
    );
  return <RequestForm form={data} slug={slug} />;
}

function RequestForm({ form, slug }: { form: MarketplaceServiceFormDto; slug: string }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ requestId: string; referenceNo: string } | null>(null);

  const defs: ServiceFormFieldDef[] = form.fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type as ServiceFormFieldDef['type'],
    options: f.options,
    required: f.required,
    // M4a interim: file uploads ship with the next pass — FILE fields are optional here.
    ...(f.type === 'FILE' ? { required: false } : {}),
    validation: (f.validation ?? null) as ServiceFormFieldDef['validation'],
  }));

  function validateCurrent(): boolean {
    // FILE answers are stripped before validation (uploads arrive with M4b).
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(answers)) {
      const field = form.fields.find((f) => f.key === k);
      if (field?.type === 'FILE') continue;
      if (v === '' || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
      payload[k] = v;
    }
    const schema = buildRequestAnswersSchema(defs, 'submit');
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      setFieldErrors({});
      return true;
    }
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    setFieldErrors(errors);
    return false;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validateCurrent()) return;
    setSubmitting(true);
    try {
      // Send only non-empty, non-FILE answers; server re-validates everything.
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answers)) {
        const field = form.fields.find((f) => f.key === k);
        if (field?.type === 'FILE') continue;
        if (v === '' || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
        payload[k] = v;
      }
      const res = await api.post<{ requestId: string; referenceNo: string }>(
        `/marketplace/services/${slug}/requests`,
        { answers: payload, notes: notes || undefined },
      );
      setResult({ requestId: res.requestId, referenceNo: res.referenceNo });
      window.scrollTo({ top: 0 });
    } catch (err) {
      const details = validationDetails(err);
      if (Object.keys(details).length > 0) setFieldErrors(details);
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="card-lift border-primary/20 shadow-glow">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-brand-fuchsia/10 ring-1 ring-primary/20">
            <CheckCircle2 className="h-9 w-9 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Request submitted</h1>
            <p className="mt-1 text-muted-foreground">
              Your reference number is{' '}
              <span className="font-mono font-semibold text-foreground">{result.referenceNo}</span>
            </p>
          </div>
          <div className="max-w-md text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What happens next?</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
              <li>We review your requirements and any references.</li>
              <li>You receive a quotation with price, scope and timeline.</li>
              <li>You accept the quotation — it becomes an order.</li>
              <li>Pay via bKash from the order page and track every step.</li>
            </ol>
          </div>
          <div className="flex gap-3">
            <Button asChild>
              <Link href={`/requests/${result.requestId}`}>Track this request</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <Link href={`/services/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to service
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">Request: {form.service.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in your requirements — we review everything and send you a quotation before any payment.
        </p>
      </Reveal>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {form.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={answers[field.key]}
            error={fieldErrors[field.key]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [field.key]: v }))}
          />
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="notes">Additional notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Anything else we should know?"
          />
        </div>

        {submitError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Submitting…
            </>
          ) : (
            'Submit request'
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          No payment is taken at this step. You&apos;ll review and accept a quotation first.
        </p>
      </form>
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: Field;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.key}`;
  const invalid = Boolean(error);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && (
          <span className="text-destructive" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </Label>

      {field.type === 'TEXT' && (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'TEXTAREA' && (
        <Textarea
          id={id}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'NUMBER' && (
        <Input
          id={id}
          type="number"
          value={value === undefined || value === '' ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'DATE' && (
        <Input
          id={id}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'URL' && (
        <Input
          id={id}
          type="url"
          placeholder="https://…"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'PHONE' && (
        <Input
          id={id}
          type="tel"
          placeholder="01XXXXXXXXX"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {field.type === 'SELECT' && (
        <Select
          value={typeof value === 'string' && value ? value : undefined}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={id} aria-invalid={invalid}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.type === 'MULTISELECT' && (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={field.label}>
          {(field.options ?? []).map((o) => {
            const selected = Array.isArray(value) ? (value as string[]).includes(o) : false;
            return (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => {
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    onChange(checked ? [...current, o] : current.filter((x) => x !== o));
                  }}
                />
                {o}
              </label>
            );
          })}
        </div>
      )}
      {field.type === 'CHECKBOX' && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          Yes
        </label>
      )}
      {field.type === 'FILE' && (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <Upload className="h-4 w-4" aria-hidden="true" />
          File attachments arrive with the next update — the team will request files if needed.
        </div>
      )}

      {field.helpText && !error && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
