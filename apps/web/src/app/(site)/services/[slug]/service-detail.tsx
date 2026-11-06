'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Clock, Loader2, PackageOpen, ShoppingCart, Star } from 'lucide-react';
import type { ServiceDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';

const GROUP_LABELS: Record<string, string> = {
  scope: 'Scope',
  platform: 'Platform',
  urgency: 'Timeline',
  extras: 'Add-ons',
};

export function ServiceDetailContent({ initialData }: { initialData?: ServiceDto }) {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { addItem } = useCart();
  const router = useRouter();

  // Server-rendered pages pass the fetched service as fallback data, so the
  // first paint is complete (no skeleton flash).
  const { data: service, isLoading, error } = useSWR<ServiceDto>(
    slug ? `/services/${slug}` : null,
    () => api.get<ServiceDto>(`/services/${slug}`),
    initialData ? { fallbackData: initialData } : undefined,
  );

  const [requirements, setRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** User overrides per group — replace to change selection. */
  const [overrides, setOverrides] = useState<{ serviceId: string; groups: Record<string, string[]> }>({ serviceId: '', groups: {} });

  /** groupKey → optionId (single-select groups) / array (extras) */
  const groups = useMemo(() => {
    if (!service) return [];
    const map = new Map<string, typeof service.options>();
    for (const o of service.options) {
      map.set(o.groupKey, [...(map.get(o.groupKey) ?? []), o]);
    }
    return [...map.entries()];
  }, [service]);

  /** Effective selection = catalog defaults merged with user overrides. */
  const selected = useMemo(() => {
    if (!service) return {};
    const defaults: Record<string, string[]> = {};
    for (const o of service.options) {
      if (o.isDefault) defaults[o.groupKey] = [...(defaults[o.groupKey] ?? []), o.id];
    }
    const eff = { ...defaults };
    if (overrides.serviceId === service.id) Object.assign(eff, overrides.groups);
    return eff;
  }, [service, overrides]);

  const setSelectedGroup = (groupKey: string, ids: string[]) =>
    setOverrides((prev) => ({
      serviceId: service?.id ?? '',
      groups: { ...(prev.serviceId === service?.id ? prev.groups : {}), [groupKey]: ids },
    }));

  const selectedIds = Object.values(selected).flat();

  const preview = useMemo(() => {
    if (!service) return null;
    const chosen = service.options.filter((o) => selectedIds.includes(o.id));
    const delta = chosen.reduce((sum, o) => sum + Number(o.priceDelta), 0);
    const days = service.deliveryDays + chosen.reduce((sum, o) => sum + o.daysDelta, 0);
    return { price: Math.max(0, Number(service.basePrice) + delta), days: Math.max(1, days) };
  }, [service, selectedIds]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="mx-auto flex max-w-7xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <EmptyState
          icon={PackageOpen}
          title="Service not found"
          description="It may have been removed or the link is wrong."
          action={<Button asChild><Link href="/services">Browse services</Link></Button>}
        />
      </div>
    );
  }

  async function onAddToCart() {
    if (!user) {
      toast.info('Sign in to add services to your cart');
      router.push(`/login?next=/services/${slug}`);
      return;
    }
    setSubmitting(true);
    try {
      await addItem({
        serviceId: service!.id,
        quantity: 1,
        optionIds: selectedIds,
        requirements: requirements.trim() || undefined,
      });
      toast.success('Added to cart', {
        action: { label: 'View cart', onClick: () => router.push('/cart') },
      });
    } catch (err) {
      toast.error('Could not add to cart', { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {/* breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/services" className="hover:text-foreground">Services</Link>
        <span>/</span>
        <Link href={`/services?category=${service.category.slug}`} className="hover:text-foreground">
          {service.category.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">{service.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Main info */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{service.category.name}</Badge>
              {service.isFeatured && (
                <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  <Star className="h-3 w-3 fill-current" /> Popular
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{service.name}</h1>
            {service.tagline && <p className="mt-2 text-lg text-muted-foreground">{service.tagline}</p>}
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Standard delivery: {service.deliveryDays} days
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">About this service</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{service.description}</p>
          </div>

          {service.options.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">Configure your order</h2>
              {groups.map(([groupKey, options]) => (
                <div key={groupKey} className="space-y-3" role="group" aria-labelledby={`option-group-${groupKey}`}>
                  <p id={`option-group-${groupKey}`} className="font-medium">{GROUP_LABELS[groupKey] ?? groupKey}</p>
                  {groupKey === 'extras' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((o) => (
                        <Label
                          key={o.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition-colors hover:bg-muted/50 data-[checked=true]:border-primary data-[checked=true]:bg-primary/5"
                          data-checked={selected[groupKey]?.includes(o.id) ?? false}
                        >
                          {/* Radix Checkbox is a <button> — a wrapping <label>
                              doesn't name it, so an explicit aria-label is required. */}
                          <Checkbox
                            aria-label={o.label}
                            checked={selected[groupKey]?.includes(o.id) ?? false}
                            onCheckedChange={(checked) => {
                              const current = selected[groupKey] ?? [];
                              setSelectedGroup(groupKey, checked ? [...current, o.id] : current.filter((id) => id !== o.id));
                            }}
                          />
                          <span className="flex-1 text-sm">{o.label}</span>
                          <span className="text-sm font-medium text-primary">
                            {Number(o.priceDelta) >= 0 ? '+' : ''}
                            {formatBDT(o.priceDelta)}
                          </span>
                        </Label>
                      ))}
                    </div>
                  ) : (
                    <RadioGroup
                      value={selected[groupKey]?.[0] ?? ''}
                      onValueChange={(value) => setSelectedGroup(groupKey, [value])}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {options.map((o) => (
                        <Label
                          key={o.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                        >
                          {/* Radix RadioGroupItem is a <button> — explicit name. */}
                          <RadioGroupItem value={o.id} aria-label={o.label} />
                          <span className="flex-1 text-sm">{o.label}</span>
                          <span className="text-sm font-medium text-primary">
                            {Number(o.priceDelta) >= 0 ? '+' : ''}
                            {formatBDT(o.priceDelta)}
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="requirements">Project requirements (you can refine later)</Label>
            <Textarea
              id="requirements"
              rows={5}
              maxLength={8000}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="Describe your project: goals, references, tech constraints, academic requirements — anything the founder should know."
            />
            <p className="text-xs text-muted-foreground">{requirements.length}/8000</p>
          </div>
        </div>

        {/* Order summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {preview && selectedIds.length > 0 ? 'Configured price' : 'Starting at'}
                </span>
                <span className="text-3xl font-bold">{formatBDT(preview?.price ?? service.basePrice)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated delivery</span>
                <span className="font-medium">{preview?.days ?? service.deliveryDays} days</span>
              </div>
              <Separator />
              <Button size="lg" className="w-full" onClick={onAddToCart} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                {submitting ? 'Adding…' : 'Add to cart'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You&apos;ll set the deadline and pick your project lead at checkout.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
