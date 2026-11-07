'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  AdminServiceCategoryDto,
  AdminServiceDetailDto,
  FormFieldType,
  FounderDiscipline,
  PricingModel,
  ServiceStatus,
  ServiceType,
  ServiceUpsertInput,
} from '@tsh/shared';
import {
  FOUNDER_DISCIPLINES,
  FORM_FIELD_TYPES,
  PRICING_MODELS,
  SERVICE_STATUSES,
  SERVICE_TYPES,
  serviceUpsertSchema,
} from '@tsh/shared';
import { api, ApiClientError, errorMessage, validationDetails } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';

// ─── Labels ─────────────────────────────────────────────────

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  SD_WEB: 'SD Projects',
  COMMERCIAL_WEB: 'Commercial Web',
  JAVA_OOP: 'Java & OOP',
  PRESENTATION: 'Presentations',
  LAB_REPORT: 'Lab Reports',
  ASSIGNMENT_FORMATTING: 'Assignment Formatting',
  PROJECT_DOCUMENTATION: 'Project Documentation',
  HARDWARE_PROJECT: 'Hardware Projects',
  PC_REPAIR: 'PC & Laptop Repair',
  CONSULTATION: 'Consultation',
};

const PRICING_LABELS: Record<PricingModel, string> = {
  FIXED: 'Fixed price',
  STARTING_FROM: 'Starting from',
  RANGE: 'Price range',
  CUSTOM_QUOTE: 'Custom quote',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  ARCHIVED: 'Archived',
};

const DISCIPLINE_LABELS: Record<FounderDiscipline, string> = {
  WEB_SOFTWARE_ECOMMERCE: 'Engineering (web & software)',
  DESIGN_DOCS_UX: 'Design & documentation',
  BOTH: 'Both founders',
};

const FORM_FIELD_LABELS: Record<FormFieldType, string> = {
  TEXT: 'Short text',
  TEXTAREA: 'Long text',
  NUMBER: 'Number',
  SELECT: 'Single select',
  MULTISELECT: 'Multi select',
  DATE: 'Date',
  CHECKBOX: 'Checkbox',
  FILE: 'File upload',
  URL: 'URL',
  PHONE: 'Phone',
};

type TabKey = 'basics' | 'pricing' | 'content' | 'packages' | 'form' | 'visibility';

// ─── Form state ─────────────────────────────────────────────

type OptionRow = {
  id?: string;
  kind: 'PACKAGE' | 'ADDON';
  label: string;
  description: string;
  priceFrom: string;
  priceTo: string;
  isActive: boolean;
  displayOrder: string;
};

type FieldRow = {
  id?: string;
  key: string;
  label: string;
  type: FormFieldType;
  optionsText: string;
  required: boolean;
  helpText: string;
  displayOrder: string;
};

type FormState = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  categoryId: string;
  serviceType: ServiceType | '';
  pricingModel: PricingModel | '';
  basePrice: string;
  priceFrom: string;
  priceTo: string;
  priceNote: string;
  deliveryDays: string;
  deliveryEstimateText: string;
  revisionPolicy: string;
  requirementsText: string;
  featuresText: string;
  deliverablesText: string;
  acceptedFileTypesText: string;
  faqs: Array<{ q: string; a: string }>;
  imageUrl: string;
  thumbnail: string;
  bannerImage: string;
  founderDiscipline: FounderDiscipline;
  isFeatured: boolean;
  isPopular: boolean;
  status: ServiceStatus;
  displayOrder: string;
  options: OptionRow[];
  formFields: FieldRow[];
};

const EMPTY_FORM: FormState = {
  slug: '',
  name: '',
  tagline: '',
  description: '',
  categoryId: '',
  serviceType: '',
  pricingModel: 'FIXED',
  basePrice: '',
  priceFrom: '',
  priceTo: '',
  priceNote: '',
  deliveryDays: '7',
  deliveryEstimateText: '',
  revisionPolicy: '',
  requirementsText: '',
  featuresText: '',
  deliverablesText: '',
  acceptedFileTypesText: '',
  faqs: [],
  imageUrl: '',
  thumbnail: '',
  bannerImage: '',
  founderDiscipline: 'BOTH',
  isFeatured: false,
  isPopular: false,
  status: 'DRAFT',
  displayOrder: '0',
  options: [],
  formFields: [],
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function fromDetail(service: AdminServiceDetailDto): FormState {
  return {
    slug: service.slug,
    name: service.name,
    tagline: service.tagline ?? '',
    description: service.description,
    categoryId: service.category.id,
    serviceType: service.serviceType ?? '',
    pricingModel: service.pricingModel ?? 'FIXED',
    basePrice: service.basePrice,
    priceFrom: service.priceFrom ?? '',
    priceTo: service.priceTo ?? '',
    priceNote: service.priceNote ?? '',
    deliveryDays: String(service.deliveryDays),
    deliveryEstimateText: service.deliveryEstimateText ?? '',
    revisionPolicy: service.revisionPolicy ?? '',
    requirementsText: service.requirementsText ?? '',
    featuresText: service.features.join('\n'),
    deliverablesText: service.deliverables.join('\n'),
    acceptedFileTypesText: service.acceptedFileTypes.join(', '),
    faqs: service.faqs.map((faq) => ({ ...faq })),
    imageUrl: service.imageUrl ?? '',
    thumbnail: service.thumbnail ?? '',
    bannerImage: service.bannerImage ?? '',
    founderDiscipline: service.founderDiscipline,
    isFeatured: service.isFeatured,
    isPopular: service.isPopular,
    status: service.status,
    displayOrder: String(service.displayOrder),
    options: service.options.map((option) => ({
      id: option.id,
      kind: option.kind,
      label: option.label,
      description: option.description ?? '',
      priceFrom: option.priceFrom ?? '',
      priceTo: option.priceTo ?? '',
      isActive: option.isActive,
      displayOrder: String(option.displayOrder),
    })),
    formFields: service.formFields.map((field) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      optionsText: field.options.join(', '),
      required: field.required,
      helpText: field.helpText ?? '',
      displayOrder: String(field.displayOrder),
    })),
  };
}

function toPayload(form: FormState, statusOverride?: ServiceStatus): ServiceUpsertInput {
  const lines = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const basePrice =
    form.pricingModel === 'FIXED' ? form.basePrice.trim() || '0' : form.priceFrom.trim() || form.basePrice.trim() || '0';

  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    ...(form.tagline.trim() ? { tagline: form.tagline.trim() } : {}),
    description: form.description.trim(),
    categoryId: form.categoryId,
    serviceType: form.serviceType as ServiceType,
    pricingModel: form.pricingModel as PricingModel,
    basePrice,
    ...(form.priceFrom.trim() ? { priceFrom: form.priceFrom.trim() } : {}),
    ...(form.priceTo.trim() ? { priceTo: form.priceTo.trim() } : {}),
    ...(form.priceNote.trim() ? { priceNote: form.priceNote.trim() } : {}),
    deliveryDays: Number(form.deliveryDays) || 7,
    ...(form.deliveryEstimateText.trim() ? { deliveryEstimateText: form.deliveryEstimateText.trim() } : {}),
    ...(form.revisionPolicy.trim() ? { revisionPolicy: form.revisionPolicy.trim() } : {}),
    ...(form.requirementsText.trim() ? { requirementsText: form.requirementsText.trim() } : {}),
    features: lines(form.featuresText),
    deliverables: lines(form.deliverablesText),
    acceptedFileTypes: form.acceptedFileTypesText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    faqs: form.faqs
      .map((faq) => ({ q: faq.q.trim(), a: faq.a.trim() }))
      .filter((faq) => faq.q && faq.a),
    ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    ...(form.thumbnail.trim() ? { thumbnail: form.thumbnail.trim() } : {}),
    ...(form.bannerImage.trim() ? { bannerImage: form.bannerImage.trim() } : {}),
    founderDiscipline: form.founderDiscipline,
    isFeatured: form.isFeatured,
    isPopular: form.isPopular,
    status: statusOverride ?? form.status,
    displayOrder: Number(form.displayOrder) || 0,
    options: form.options.map((option, index) => ({
      ...(option.id ? { id: option.id } : {}),
      kind: option.kind,
      label: option.label.trim(),
      ...(option.description.trim() ? { description: option.description.trim() } : {}),
      ...(option.priceFrom.trim() ? { priceFrom: option.priceFrom.trim() } : {}),
      ...(option.priceTo.trim() ? { priceTo: option.priceTo.trim() } : {}),
      isActive: option.isActive,
      displayOrder: Number(option.displayOrder) || index,
    })),
    formFields: form.formFields.map((field, index) => ({
      ...(field.id ? { id: field.id } : {}),
      key: field.key.trim(),
      label: field.label.trim(),
      type: field.type,
      options: field.optionsText
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      required: field.required,
      ...(field.helpText.trim() ? { helpText: field.helpText.trim() } : {}),
      displayOrder: Number(field.displayOrder) || index,
    })),
  };
}

function errorsFrom(result: { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}

function tabForError(path: string): TabKey {
  if (path.startsWith('options.')) return 'packages';
  if (path.startsWith('formFields.')) return 'form';
  if (path.startsWith('faqs.')) return 'content';
  if (
    [
      'pricingModel',
      'basePrice',
      'priceFrom',
      'priceTo',
      'priceNote',
      'deliveryDays',
      'deliveryEstimateText',
    ].some((field) => path === field)
  ) {
    return 'pricing';
  }
  if (
    [
      'features',
      'deliverables',
      'acceptedFileTypes',
      'faqs',
      'imageUrl',
      'thumbnail',
      'bannerImage',
      'revisionPolicy',
      'requirementsText',
    ].some((field) => path === field)
  ) {
    return 'content';
  }
  if (['status', 'isFeatured', 'isPopular', 'displayOrder'].includes(path)) return 'visibility';
  return 'basics';
}

// ─── Editor wrapper (edit route) ────────────────────────────

export function ServiceEditor({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<AdminServiceDetailDto>(
    `/admin/services/${serviceId}`,
    () => api.get<AdminServiceDetailDto>(`/admin/services/${serviceId}`),
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Could not load this service"
        description={errorMessage(error)}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void mutate()}>
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
            <Button variant="ghost" onClick={() => router.push('/admin/services')}>
              Back to services
            </Button>
          </div>
        }
      />
    );
  }

  return <ServiceForm service={data} />;
}

// ─── Main form ──────────────────────────────────────────────

export function ServiceForm({ service }: { service?: AdminServiceDetailDto }) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const isEdit = Boolean(service);

  const [form, setForm] = useState<FormState>(() => (service ? fromDetail(service) : EMPTY_FORM));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<TabKey>('basics');
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(isEdit);

  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useSWR<
    AdminServiceCategoryDto[]
  >('/admin/service-categories', () => api.get<AdminServiceCategoryDto[]>('/admin/service-categories'));

  const selectedCategory = useMemo(
    () => categories?.find((category) => category.id === form.categoryId),
    [categories, form.categoryId],
  );

  // Auto-fill the slug from the name until the admin edits it themselves.
  function setName(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
    clearError('name');
    if (!slugTouched) clearError('slug');
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  }

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function fieldError(path: string): string | undefined {
    return errors[path];
  }

  function setOption(index: number, patch: Partial<OptionRow>) {
    setForm((prev) => {
      const next = [...prev.options];
      const current = next[index];
      if (current) next[index] = { ...current, ...patch };
      return { ...prev, options: next };
    });
    for (const key of Object.keys(patch)) clearError(`options.${index}.${key}`);
  }

  function setFieldRow(index: number, patch: Partial<FieldRow>) {
    setForm((prev) => {
      const next = [...prev.formFields];
      const current = next[index];
      if (current) next[index] = { ...current, ...patch };
      return { ...prev, formFields: next };
    });
    for (const key of Object.keys(patch)) clearError(`formFields.${index}.${key}`);
  }

  function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    const [row] = next.splice(index, 1);
    if (!row) return list;
    next.splice(target, 0, row);
    return next;
  }

  async function submit(statusOverride?: ServiceStatus) {
    if (saving) return;
    setErrors({});

    const payload = toPayload(form, statusOverride);
    const parsed = serviceUpsertSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors = errorsFrom(parsed);
      setErrors(nextErrors);
      const firstPath = Object.keys(nextErrors)[0] ?? '';
      setTab(tabForError(firstPath));
      toast.error('Please fix the highlighted fields', {
        description: nextErrors[firstPath] ?? 'The form is incomplete.',
      });
      return;
    }

    setSaving(true);
    try {
      const saved = isEdit
        ? await api.put<AdminServiceDetailDto>(`/admin/services/${service!.id}`, parsed.data)
        : await api.post<AdminServiceDetailDto>('/admin/services', parsed.data);

      toast.success(isEdit ? 'Service updated' : 'Service created', {
        description:
          saved.status === 'PUBLISHED'
            ? 'Published — it is live on the services page.'
            : `Saved as ${STATUS_LABELS[saved.status]}. It is hidden from the public catalog.`,
      });

      await globalMutate(
        (key) =>
          typeof key === 'string' &&
          (key.startsWith('/admin/services') ||
            key.startsWith('/marketplace/services') ||
            key.startsWith('/marketplace/categories') ||
            key.startsWith('home:marketplace')),
        undefined,
        { revalidate: true },
      );
      router.push('/admin/services');
      router.refresh();
    } catch (err) {
      const details = validationDetails(err);
      if (Object.keys(details).length > 0) {
        setErrors(details);
        const firstPath = Object.keys(details)[0] ?? '';
        setTab(tabForError(firstPath));
      } else if (err instanceof ApiClientError && err.code === 'SERVICE_SLUG_TAKEN') {
        setErrors({ slug: err.message });
        setTab('basics');
      }
      toast.error(isEdit ? 'Could not update service' : 'Could not create service', {
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const publishChecklist = [
    { label: 'Category selected', done: Boolean(form.categoryId) },
    { label: 'Service type selected', done: Boolean(form.serviceType) },
    { label: 'Pricing model selected', done: Boolean(form.pricingModel) },
    {
      label: 'Valid price for the chosen model',
      done:
        form.pricingModel === 'CUSTOM_QUOTE'
          ? true
          : form.pricingModel === 'RANGE'
            ? Boolean(form.priceFrom && form.priceTo)
            : form.pricingModel === 'STARTING_FROM'
              ? Boolean(form.priceFrom)
              : Boolean(form.basePrice),
    },
    { label: 'Description (min 10 characters)', done: form.description.trim().length >= 10 },
  ];
  const readyToPublish = publishChecklist.every((item) => item.done);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isEdit ? 'Edit service' : 'Add service'}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isEdit
              ? 'Changes go live immediately once saved as Published.'
              : 'Create a marketplace card. Drafts stay hidden until you publish.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={form.status === 'PUBLISHED' ? 'default' : 'outline'}>{STATUS_LABELS[form.status]}</Badge>
          {isEdit && service && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/services/${service.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> View live
              </a>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="packages">
            Packages{form.options.length > 0 ? ` (${form.options.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="form">
            Request form{form.formFields.length > 0 ? ` (${form.formFields.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="visibility">Visibility</TabsTrigger>
        </TabsList>

        {/* ── Basics ───────────────────────────────────────── */}
        <TabsContent value="basics">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" error={fieldError('name')} className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Website Development"
                  maxLength={160}
                />
              </Field>

              <Field label="Slug" error={fieldError('slug')} className="sm:col-span-2" hint="Public URL: /services/<slug>">
                <div className="flex gap-2">
                  <Input
                    value={form.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setField('slug', event.target.value);
                    }}
                    placeholder="website-development"
                    maxLength={120}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSlugTouched(false);
                      setField('slug', slugify(form.name));
                    }}
                  >
                    Generate
                  </Button>
                </div>
              </Field>

              <Field label="Category" error={fieldError('categoryId')}>
                <Select
                  value={form.categoryId || undefined}
                  onValueChange={(value) => setField('categoryId', value)}
                  disabled={categoriesLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={categoriesLoading ? 'Loading categories…' : 'Select a category'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                        {category.isActive ? '' : ' (inactive)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoriesError && (
                  <p className="mt-1 text-xs text-destructive">{errorMessage(categoriesError)}</p>
                )}
                {selectedCategory && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedCategory.serviceCount} service{selectedCategory.serviceCount === 1 ? '' : 's'} in this
                    category
                  </p>
                )}
              </Field>

              <Field label="Service type" error={fieldError('serviceType')}>
                <Select
                  value={form.serviceType || undefined}
                  onValueChange={(value) => setField('serviceType', value as ServiceType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {SERVICE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tagline" error={fieldError('tagline')} className="sm:col-span-2" hint="Shown on the card under the name.">
                <Input
                  value={form.tagline}
                  onChange={(event) => setField('tagline', event.target.value)}
                  placeholder="Fast, mobile-first storefronts with local payments"
                  maxLength={200}
                />
              </Field>

              <Field label="Description" error={fieldError('description')} className="sm:col-span-2">
                <Textarea
                  value={form.description}
                  onChange={(event) => setField('description', event.target.value)}
                  placeholder="What the customer gets, who it is for, and what makes this service different."
                  rows={6}
                  maxLength={8000}
                />
              </Field>

              <Field label="Founder discipline" error={fieldError('founderDiscipline')} className="sm:col-span-2">
                <Select
                  value={form.founderDiscipline}
                  onValueChange={(value) => setField('founderDiscipline', value as FounderDiscipline)}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOUNDER_DISCIPLINES.map((discipline) => (
                      <SelectItem key={discipline} value={discipline}>
                        {DISCIPLINE_LABELS[discipline]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pricing ──────────────────────────────────────── */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing & delivery</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Pricing model" error={fieldError('pricingModel')}>
                <Select
                  value={form.pricingModel || undefined}
                  onValueChange={(value) => setField('pricingModel', value as PricingModel)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_MODELS.map((model) => (
                      <SelectItem key={model} value={model}>
                        {PRICING_LABELS[model]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Delivery (days)" error={fieldError('deliveryDays')} hint="Used by the legacy catalog.">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.deliveryDays}
                  onChange={(event) => setField('deliveryDays', event.target.value)}
                />
              </Field>

              {form.pricingModel === 'FIXED' && (
                <Field label="Price (BDT)" error={fieldError('basePrice')}>
                  <Input
                    inputMode="decimal"
                    value={form.basePrice}
                    onChange={(event) => setField('basePrice', event.target.value)}
                    placeholder="1500.00"
                  />
                </Field>
              )}

              {(form.pricingModel === 'STARTING_FROM' || form.pricingModel === 'RANGE') && (
                <Field
                  label={form.pricingModel === 'RANGE' ? 'Minimum price (BDT)' : 'Starting price (BDT)'}
                  error={fieldError('priceFrom')}
                >
                  <Input
                    inputMode="decimal"
                    value={form.priceFrom}
                    onChange={(event) => setField('priceFrom', event.target.value)}
                    placeholder="1500.00"
                  />
                </Field>
              )}

              {form.pricingModel === 'RANGE' && (
                <Field label="Maximum price (BDT)" error={fieldError('priceTo')}>
                  <Input
                    inputMode="decimal"
                    value={form.priceTo}
                    onChange={(event) => setField('priceTo', event.target.value)}
                    placeholder="4500.00"
                  />
                </Field>
              )}

              <Field
                label="Price note"
                error={fieldError('priceNote')}
                className="sm:col-span-2"
                hint="Shown next to the price, e.g. “per page” or “scope dependent”."
              >
                <Input
                  value={form.priceNote}
                  onChange={(event) => setField('priceNote', event.target.value)}
                  maxLength={200}
                />
              </Field>

              <Field
                label="Delivery estimate text"
                error={fieldError('deliveryEstimateText')}
                className="sm:col-span-2"
                hint="Optional. Only shown on the public card/detail when set — never fabricated."
              >
                <Input
                  value={form.deliveryEstimateText}
                  onChange={(event) => setField('deliveryEstimateText', event.target.value)}
                  placeholder="7–10 working days"
                  maxLength={120}
                />
              </Field>

              <div className="sm:col-span-2 rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Price label preview</p>
                <p className="mt-1 text-lg font-bold text-primary">
                  {form.pricingModel === 'FIXED' && `Fixed ৳${form.basePrice || '0'}`}
                  {form.pricingModel === 'STARTING_FROM' && `From ৳${form.priceFrom || '0'}`}
                  {form.pricingModel === 'RANGE' && `৳${form.priceFrom || '0'}–৳${form.priceTo || '0'}`}
                  {form.pricingModel === 'CUSTOM_QUOTE' && 'Custom Quote'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Content ──────────────────────────────────────── */}
        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content & media</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Thumbnail URL" error={fieldError('thumbnail')}>
                <Input
                  value={form.thumbnail}
                  onChange={(event) => setField('thumbnail', event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Image URL" error={fieldError('imageUrl')} hint="Fallback when no thumbnail is set.">
                <Input
                  value={form.imageUrl}
                  onChange={(event) => setField('imageUrl', event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Banner image URL" error={fieldError('bannerImage')} className="sm:col-span-2">
                <Input
                  value={form.bannerImage}
                  onChange={(event) => setField('bannerImage', event.target.value)}
                  placeholder="https://…"
                />
              </Field>

              <Field
                label="Features"
                error={fieldError('features')}
                className="sm:col-span-2"
                hint="One per line."
              >
                <Textarea
                  value={form.featuresText}
                  onChange={(event) => setField('featuresText', event.target.value)}
                  rows={5}
                  placeholder={'Responsive design\nbKash & Nagad checkout\nAdmin dashboard'}
                />
              </Field>

              <Field
                label="Deliverables"
                error={fieldError('deliverables')}
                className="sm:col-span-2"
                hint="One per line."
              >
                <Textarea
                  value={form.deliverablesText}
                  onChange={(event) => setField('deliverablesText', event.target.value)}
                  rows={5}
                  placeholder={'Source code\nDeployment guide\n30 days of support'}
                />
              </Field>

              <Field
                label="Accepted file types"
                error={fieldError('acceptedFileTypes')}
                className="sm:col-span-2"
                hint="Comma-separated extensions, e.g. pdf, docx, png."
              >
                <Input
                  value={form.acceptedFileTypesText}
                  onChange={(event) => setField('acceptedFileTypesText', event.target.value)}
                  placeholder="pdf, docx, png"
                />
              </Field>

              <Field label="Revision policy" error={fieldError('revisionPolicy')} className="sm:col-span-2">
                <Textarea
                  value={form.revisionPolicy}
                  onChange={(event) => setField('revisionPolicy', event.target.value)}
                  rows={3}
                  placeholder="Two rounds of revisions within 14 days of delivery."
                />
              </Field>

              <Field label="Requirements text" error={fieldError('requirementsText')} className="sm:col-span-2">
                <Textarea
                  value={form.requirementsText}
                  onChange={(event) => setField('requirementsText', event.target.value)}
                  rows={3}
                  placeholder="What the customer should prepare before ordering."
                />
              </Field>

              <div className="sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">FAQs</p>
                    <p className="text-xs text-muted-foreground">Shown on the service detail page.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((prev) => ({ ...prev, faqs: [...prev.faqs, { q: '', a: '' }] }))}
                  >
                    <Plus className="h-4 w-4" /> Add FAQ
                  </Button>
                </div>
                {form.faqs.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No FAQs yet.</p>
                ) : (
                  form.faqs.map((faq, index) => (
                    <div key={index} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">FAQ {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove FAQ ${index + 1}`}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, faqs: prev.faqs.filter((_, i) => i !== index) }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        value={faq.q}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            faqs: prev.faqs.map((row, i) => (i === index ? { ...row, q: event.target.value } : row)),
                          }))
                        }
                        placeholder="Question"
                        maxLength={200}
                      />
                      <Textarea
                        value={faq.a}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            faqs: prev.faqs.map((row, i) => (i === index ? { ...row, a: event.target.value } : row)),
                          }))
                        }
                        placeholder="Answer"
                        rows={2}
                        maxLength={2000}
                      />
                      {fieldError(`faqs.${index}.q`) && (
                        <p className="text-xs text-destructive">{fieldError(`faqs.${index}.q`)}</p>
                      )}
                      {fieldError(`faqs.${index}.a`) && (
                        <p className="text-xs text-destructive">{fieldError(`faqs.${index}.a`)}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Packages / add-ons ───────────────────────────── */}
        <TabsContent value="packages">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Packages & add-ons</CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      options: [
                        ...prev.options,
                        {
                          kind: 'PACKAGE',
                          label: '',
                          description: '',
                          priceFrom: '',
                          priceTo: '',
                          isActive: true,
                          displayOrder: String(prev.options.length),
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Package
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      options: [
                        ...prev.options,
                        {
                          kind: 'ADDON',
                          label: '',
                          description: '',
                          priceFrom: '',
                          priceTo: '',
                          isActive: true,
                          displayOrder: String(prev.options.length),
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Add-on
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.options.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No packages or add-ons. The service will still display and be requestable.
                </p>
              ) : (
                form.options.map((option, index) => (
                  <div key={option.id ?? `new-${index}`} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={option.kind === 'PACKAGE' ? 'default' : 'secondary'}>
                          {option.kind === 'PACKAGE' ? 'Package' : 'Add-on'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => setForm((prev) => ({ ...prev, options: move(prev.options, index, -1) }))}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Move down"
                          disabled={index === form.options.length - 1}
                          onClick={() => setForm((prev) => ({ ...prev, options: move(prev.options, index, 1) }))}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove"
                          onClick={() =>
                            setForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Label" error={fieldError(`options.${index}.label`)}>
                        <Input
                          value={option.label}
                          onChange={(event) => setOption(index, { label: event.target.value })}
                          maxLength={120}
                        />
                      </Field>
                      <Field label="Kind" error={fieldError(`options.${index}.kind`)}>
                        <Select
                          value={option.kind}
                          onValueChange={(value) => setOption(index, { kind: value as 'PACKAGE' | 'ADDON' })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PACKAGE">Package</SelectItem>
                            <SelectItem value="ADDON">Add-on</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Min price (BDT)" error={fieldError(`options.${index}.priceFrom`)}>
                        <Input
                          inputMode="decimal"
                          value={option.priceFrom}
                          onChange={(event) => setOption(index, { priceFrom: event.target.value })}
                          placeholder="Optional"
                        />
                      </Field>
                      <Field label="Max price (BDT)" error={fieldError(`options.${index}.priceTo`)}>
                        <Input
                          inputMode="decimal"
                          value={option.priceTo}
                          onChange={(event) => setOption(index, { priceTo: event.target.value })}
                          placeholder="Optional"
                        />
                      </Field>
                      <Field label="Description" className="sm:col-span-2">
                        <Textarea
                          value={option.description}
                          onChange={(event) => setOption(index, { description: event.target.value })}
                          rows={2}
                          maxLength={1000}
                        />
                      </Field>
                      <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                        <div>
                          <p className="text-sm font-medium">Active</p>
                          <p className="text-xs text-muted-foreground">Inactive rows stay hidden on the detail page.</p>
                        </div>
                        <Switch
                          checked={option.isActive}
                          onCheckedChange={(checked) => setOption(index, { isActive: checked })}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Request form fields ──────────────────────────── */}
        <TabsContent value="form">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Request form fields</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  The customer answers these before submitting a request. Leave empty to show notes only.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    formFields: [
                      ...prev.formFields,
                      {
                        key: '',
                        label: '',
                        type: 'TEXT',
                        optionsText: '',
                        required: false,
                        helpText: '',
                        displayOrder: String(prev.formFields.length),
                      },
                    ],
                  }))
                }
              >
                <Plus className="h-4 w-4" /> Add field
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.formFields.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No custom fields yet. Customers will only see the notes box.
                </p>
              ) : (
                form.formFields.map((field, index) => (
                  <div key={field.id ?? `new-${index}`} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Field {index + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, formFields: move(prev.formFields, index, -1) }))
                          }
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="Move down"
                          disabled={index === form.formFields.length - 1}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, formFields: move(prev.formFields, index, 1) }))
                          }
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              formFields: prev.formFields.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Key" error={fieldError(`formFields.${index}.key`)} hint="Letters, numbers, underscores.">
                        <Input
                          value={field.key}
                          onChange={(event) => setFieldRow(index, { key: event.target.value })}
                          className="font-mono"
                          maxLength={60}
                        />
                      </Field>
                      <Field label="Label" error={fieldError(`formFields.${index}.label`)}>
                        <Input
                          value={field.label}
                          onChange={(event) => setFieldRow(index, { label: event.target.value })}
                          maxLength={160}
                        />
                      </Field>
                      <Field label="Type" error={fieldError(`formFields.${index}.type`)}>
                        <Select
                          value={field.type}
                          onValueChange={(value) => setFieldRow(index, { type: value as FormFieldType })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FORM_FIELD_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {FORM_FIELD_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field
                        label="Options"
                        error={fieldError(`formFields.${index}.options`)}
                        hint="Comma-separated. Required for select fields."
                      >
                        <Input
                          value={field.optionsText}
                          onChange={(event) => setFieldRow(index, { optionsText: event.target.value })}
                        />
                      </Field>
                      <Field label="Help text" className="sm:col-span-2">
                        <Input
                          value={field.helpText}
                          onChange={(event) => setFieldRow(index, { helpText: event.target.value })}
                          maxLength={500}
                        />
                      </Field>
                      <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                        <div>
                          <p className="text-sm font-medium">Required</p>
                          <p className="text-xs text-muted-foreground">
                            FILE fields stay optional until storage is configured.
                          </p>
                        </div>
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) => setFieldRow(index, { required: checked })}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Visibility ───────────────────────────────────── */}
        <TabsContent value="visibility">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status & flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Field label="Status" error={fieldError('status')}>
                  <Select
                    value={form.status}
                    onValueChange={(value) => setField('status', value as ServiceStatus)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Featured</p>
                    <p className="text-xs text-muted-foreground">Shows the Featured badge and starred row.</p>
                  </div>
                  <Switch checked={form.isFeatured} onCheckedChange={(checked) => setField('isFeatured', checked)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Popular</p>
                    <p className="text-xs text-muted-foreground">Shows the Popular badge and ranks higher.</p>
                  </div>
                  <Switch checked={form.isPopular} onCheckedChange={(checked) => setField('isPopular', checked)} />
                </div>

                <Field label="Display order" error={fieldError('displayOrder')} hint="Lower numbers appear first.">
                  <Input
                    type="number"
                    min={0}
                    value={form.displayOrder}
                    onChange={(event) => setField('displayOrder', event.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publish checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {publishChecklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    <CheckCircle2
                      className={item.done ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-muted-foreground/40'}
                    />
                    <span className={item.done ? '' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">
                  {readyToPublish
                    ? 'Everything required for publishing is present.'
                    : 'Finish the checklist before publishing — drafts can be saved at any time.'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="ghost" onClick={() => router.push('/admin/services')} disabled={saving}>
          Cancel
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void submit(isEdit ? undefined : 'DRAFT')} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Save draft'}
          </Button>
          <Button onClick={() => void submit('PUBLISHED')} disabled={saving || !readyToPublish}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isEdit ? 'Save & publish' : 'Create & publish'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────

function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
