'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  Archive,
  ArrowUpDown,
  CheckCircle2,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Store,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type {
  AdminServiceCategoryDto,
  AdminServiceListQuery,
  AdminServiceSummaryDto,
  Paginated,
  ServiceStatus,
} from '@tsh/shared';
import { formatPriceLabel } from '@tsh/shared';
import { api, ApiClientError, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';

type StatusFilter = 'ALL' | ServiceStatus;

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  ARCHIVED: 'Archived',
};

const STATUS_VARIANTS: Record<ServiceStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PUBLISHED: 'default',
  DRAFT: 'secondary',
  UNPUBLISHED: 'outline',
  ARCHIVED: 'destructive',
};

const SORT_LABELS: Record<AdminServiceListQuery['sort'], string> = {
  display_order: 'Display order',
  updated_desc: 'Recently updated',
  name_asc: 'Name A–Z',
};

export default function AdminServicesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [sort, setSort] = useState<AdminServiceListQuery['sort']>('display_order');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<AdminServiceSummaryDto | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '50');
    params.set('sort', sort);
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'ALL') params.set('status', status);
    if (categoryId !== 'ALL') params.set('categoryId', categoryId);
    return params.toString();
  }, [search, status, categoryId, sort, page]);

  const listKey = `/admin/services?${query}`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<Paginated<AdminServiceSummaryDto>>(listKey, () =>
    api.get<Paginated<AdminServiceSummaryDto>>(listKey),
  );

  const { data: categories } = useSWR<AdminServiceCategoryDto[]>('/admin/service-categories', () =>
    api.get<AdminServiceCategoryDto[]>('/admin/service-categories'),
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const counts = useMemo(() => {
    const byStatus: Record<ServiceStatus, number> = { DRAFT: 0, PUBLISHED: 0, UNPUBLISHED: 0, ARCHIVED: 0 };
    for (const item of items) byStatus[item.status] += 1;
    return byStatus;
  }, [items]);

  function resetFilters() {
    setSearch('');
    setStatus('ALL');
    setCategoryId('ALL');
    setSort('display_order');
    setPage(1);
  }

  async function changeStatus(service: AdminServiceSummaryDto, next: ServiceStatus) {
    setBusyId(service.id);
    try {
      await api.patch(`/admin/services/${service.id}/status`, { status: next });
      toast.success(
        next === 'PUBLISHED'
          ? 'Service published — it is live on the services page'
          : next === 'ARCHIVED'
            ? 'Service archived — hidden from the public catalog'
            : `Status changed to ${STATUS_LABELS[next]}`,
      );
      await mutate();
    } catch (err) {
      toast.error('Could not change status', { description: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function removeService(service: AdminServiceSummaryDto) {
    setBusyId(service.id);
    try {
      await api.delete(`/admin/services/${service.id}`);
      toast.success('Service deleted');
      await mutate();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SERVICE_IN_USE') {
        toast.error('This service is in use', {
          description: 'Orders, carts or requests reference it. Archive it instead to keep that history intact.',
        });
      } else {
        toast.error('Could not delete service', { description: errorMessage(err) });
      }
    } finally {
      setBusyId(null);
      setDeletePrompt(null);
    }
  }

  const hasFilters = Boolean(search.trim()) || status !== 'ALL' || categoryId !== 'ALL';
  const refresh = () => void mutate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Store className="h-5 w-5 text-primary" /> Service catalog
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Create and manage every marketplace service. Only Published services appear on the public services page.
            Drafts, unpublished and archived services stay hidden.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh} disabled={isValidating}>
            <RefreshCw className={cn('h-4 w-4', isValidating && 'animate-spin')} /> Refresh
          </Button>
          <Button asChild>
            <Link href="/admin/services/new">
              <Plus className="h-4 w-4" /> Add service
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Store}
          label="On this page"
          value={isLoading ? null : items.length}
          hint={isLoading ? 'Loading catalog' : `${total} total service${total === 1 ? '' : 's'}`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Published"
          value={isLoading ? null : counts.PUBLISHED}
          hint="Live on the public catalog"
        />
        <SummaryCard
          icon={EyeOff}
          label="Hidden"
          value={isLoading ? null : counts.DRAFT + counts.UNPUBLISHED + counts.ARCHIVED}
          hint="Draft, unpublished or archived"
        />
        <SummaryCard
          icon={Archive}
          label="Archived"
          value={isLoading ? null : counts.ARCHIVED}
          hint="Kept for history"
        />
      </div>

      {/* Filters */}
      <Card size="sm">
        <CardContent className="grid gap-3 py-2 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,11rem))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name, slug or tagline"
              className="pl-8"
              aria-label="Search services"
            />
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {(categories ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(value as AdminServiceListQuery['sort']);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Sort services">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as AdminServiceListQuery['sort'][]).map((value) => (
                <SelectItem key={value} value={value}>
                  {SORT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <div className="md:col-span-4">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">Could not load services</p>
            <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Store}
          title={hasFilters ? 'No services match these filters' : 'No services yet'}
          description={
            hasFilters
              ? 'Try a different search, status or category.'
              : 'Create your first marketplace service. It stays hidden until you publish it.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link href="/admin/services/new">
                  <Plus className="h-4 w-4" /> Add service
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              busy={busyId === service.id}
              onPublish={() => void changeStatus(service, 'PUBLISHED')}
              onUnpublish={() => void changeStatus(service, 'UNPUBLISHED')}
              onArchive={() => void changeStatus(service, 'ARCHIVED')}
              onRestore={() => void changeStatus(service, 'DRAFT')}
              onDelete={() => setDeletePrompt(service)}
            />
          ))}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {pageCount} · {total} service{total === 1 ? '' : 's'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={Boolean(deletePrompt)}
        onOpenChange={(open) => {
          if (!open && busyId === null) setDeletePrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletePrompt?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePrompt && usageTotal(deletePrompt) > 0
                ? 'This service is referenced by orders, carts or requests and cannot be deleted. Archive it instead so that history stays intact.'
                : 'This permanently removes the service and its packages, add-ons and request-form fields. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            {deletePrompt && usageTotal(deletePrompt) > 0 ? (
              <AlertDialogAction
                disabled={busyId !== null}
                onClick={() => {
                  if (deletePrompt) void changeStatus(deletePrompt, 'ARCHIVED');
                  setDeletePrompt(null);
                }}
              >
                <Archive className="h-4 w-4" /> Archive instead
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                variant="destructive"
                disabled={busyId !== null}
                onClick={() => {
                  if (deletePrompt) void removeService(deletePrompt);
                }}
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function usageTotal(service: AdminServiceSummaryDto): number {
  return service.usage.orders + service.usage.carts + service.usage.requests;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Store;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3 py-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-6 w-10" />
          ) : (
            <p className="text-lg font-semibold leading-tight">{value}</p>
          )}
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceRow({
  service,
  busy,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDelete,
}: {
  service: AdminServiceSummaryDto;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const image = service.thumbnail ?? service.imageUrl;
  const usage = usageTotal(service);
  const priceLabel = service.pricingModel
    ? formatPriceLabel({
        pricingModel: service.pricingModel,
        basePrice: service.basePrice,
        priceFrom: service.priceFrom,
        priceTo: service.priceTo,
      })
    : 'Legacy service';

  return (
    <Card size="sm">
      <CardContent className="space-y-3 py-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded-lg border bg-primary/5 sm:block">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Store className="h-6 w-6 text-primary/50" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANTS[service.status]}>{STATUS_LABELS[service.status]}</Badge>
                {service.isFeatured && <Badge variant="outline">Featured</Badge>}
                {service.isPopular && <Badge variant="outline">Popular</Badge>}
                {usage > 0 && (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <TriangleAlert className="h-3 w-3" /> In use
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono">
                  #{service.displayOrder}
                </Badge>
              </div>

              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{service.name}</span>
                <span className="font-mono text-xs text-muted-foreground">/{service.slug}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {service.category.name}
                {' · '}
                {priceLabel}
                {service.deliveryEstimateText ? ` · ${service.deliveryEstimateText}` : ''}
              </p>
              {service.tagline && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{service.tagline}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {usage > 0
                  ? `${service.usage.orders} order${service.usage.orders === 1 ? '' : 's'} · ${service.usage.carts} cart${
                      service.usage.carts === 1 ? '' : 's'
                    } · ${service.usage.requests} request${service.usage.requests === 1 ? '' : 's'}`
                  : 'Not referenced by any order, cart or request'}
                {' · '}Updated {new Date(service.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" size="sm" asChild disabled={busy}>
            <Link href={`/admin/services/${service.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>

          {service.status === 'PUBLISHED' ? (
            <Button variant="outline" size="sm" onClick={onUnpublish} disabled={busy}>
              <EyeOff className="h-4 w-4" /> Unpublish
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onPublish} disabled={busy}>
              <Rocket className="h-4 w-4" /> Publish
            </Button>
          )}

          {service.status === 'ARCHIVED' ? (
            <Button variant="outline" size="sm" onClick={onRestore} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Restore to draft
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onArchive} disabled={busy}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            title={usage > 0 ? 'Referenced by history — archive this service instead' : 'Delete service'}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>

          {usage > 0 && (
            <span className="self-center text-xs text-muted-foreground">
              Archive instead — orders, carts or requests reference this service.
            </span>
          )}

          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <Link href={`/services/${service.slug}`} target="_blank" rel="noreferrer">
              View public page
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
