'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, AlertCircle, PackageOpen, Search, Star } from 'lucide-react';
import type { Paginated, ServiceCategoryDto, ServiceDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { SpotlightCard } from '@/components/motion/spotlight-card';

const PAGE_SIZE = 12;
const SEARCH_MAX_LENGTH = 120;

const SORTS = ['popular', 'price_asc', 'price_desc', 'newest'] as const;
type SortKey = (typeof SORTS)[number];

/** ?page=abc / 0 / 1.5 / -3 / '' all degrade to page 1 — never a 422. */
function parsePageParam(raw: string | null): number {
  const n = Number(raw ?? '1');
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Unknown sort values fall back to the default instead of erroring. */
function parseSortParam(raw: string | null): SortKey {
  return (SORTS as readonly string[]).includes(raw ?? '') ? (raw as SortKey) : 'popular';
}

export function ServicesContent({ initialData }: { initialData?: Paginated<ServiceDto> }) {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get('category') ?? 'all';
  const search = params.get('search')?.trim() ?? '';
  const sort = parseSortParam(params.get('sort'));
  const page = parsePageParam(params.get('page'));

  const [searchInput, setSearchInput] = useState(search);

  // Debounce search → URL (single source of truth). Trimmed on write so
  // surrounding spaces never become part of the query.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== search) {
        setParams({ search: trimmed || null, page: null });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || (k === 'category' && v === 'all')) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/services${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(sort !== 'popular' ? { sort } : {}),
    ...(category !== 'all' ? { category } : {}),
    ...(search ? { search } : {}),
  });

  const swrKey = `/services?${query.toString()}`;
  // The first unfiltered page is server-rendered and passed in as fallback
  // data, so the grid exists in the initial HTML even if the client fetch is
  // blocked (CORS, extension, offline) or auth bootstrap fails. Sanitized
  // values (page/sort) keep bogus URLs aligned with the SSR fallback key.
  const isDefaultQuery = page === 1 && sort === 'popular' && category === 'all' && !search;

  const { data: categories } = useSWR<ServiceCategoryDto[]>('/categories', () => api.get<ServiceCategoryDto[]>('/categories'));
  const { data, isLoading, error, mutate } = useSWR<Paginated<ServiceDto>>(
    swrKey,
    () => api.get<Paginated<ServiceDto>>(swrKey),
    { keepPreviousData: true, fallbackData: isDefaultQuery ? initialData : undefined },
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // Fresh load finished, requested page is past the end (e.g. ?page=99).
  const isOutOfRange = Boolean(data) && !isLoading && page > totalPages;

  return (
    <div className="space-y-8">
      <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Services
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isOutOfRange
              ? `Page ${page} doesn’t exist — this catalog has ${totalPages} page${totalPages === 1 ? '' : 's'}.`
              : data
                ? `${data.total} service${data.total === 1 ? '' : 's'} available`
                : error
                  ? 'Could not load services'
                  : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search services…"
              className="w-full pl-9 sm:w-64"
              aria-label="Search services"
              maxLength={SEARCH_MAX_LENGTH}
            />
          </div>
          <Select value={sort} onValueChange={(v) => setParams({ sort: v === 'popular' ? null : v, page: null })}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Most popular</SelectItem>
              <SelectItem value="price_asc">Price: low → high</SelectItem>
              <SelectItem value="price_desc">Price: high → low</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Reveal>

      {/* Stale results with a failed refresh — surface it without wiping the grid. */}
      {error && data && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span>
            Couldn’t refresh services — showing the last loaded results. {errorMessage(error)}
          </span>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      )}

      {/* Category chips — toggle buttons (aria-pressed), not a tablist: they
          filter the list rather than switching between views. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <Chip active={category === 'all'} onClick={() => setParams({ category: null, page: null })}>
          All
        </Chip>
        {categories?.map((c) => (
          <Chip key={c.id} active={category === c.slug} onClick={() => setParams({ category: c.slug, page: null })}>
            {c.name}
          </Chip>
        ))}
      </div>

      {/* Grid */}
      {error && !data ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load services"
          description={errorMessage(error)}
          action={
            <Button variant="outline" onClick={() => mutate()}>
              Try again
            </Button>
          }
        />
      ) : isOutOfRange ? (
        <EmptyState
          icon={PackageOpen}
          title="This page doesn’t exist"
          description={`You’ve reached past the last page of results (${totalPages} page${totalPages === 1 ? '' : 's'}).`}
          action={
            <Button variant="outline" onClick={() => setParams({ page: null })}>
              Go to page 1
            </Button>
          }
        />
      ) : isLoading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <SpotlightCard>
                  <ServiceCard service={s} />
                </SpotlightCard>
              </StaggerItem>
            ))}
          </Stagger>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setParams({ page: String(page + 1) })}>
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={PackageOpen}
          title="No services match"
          description={
            search
              ? `Nothing found for “${search}”. Try a different search or category.`
              : category !== 'all'
                ? 'This category has no services yet — check back soon.'
                : 'No services are available right now — check back soon.'
          }
          action={
            (search || category !== 'all') && (
              <Button variant="outline" onClick={() => { setSearchInput(''); setParams({ search: null, category: null, page: null }); }}>
                Clear filters
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-300 ${
        active
          ? 'border-primary bg-gradient-to-r from-primary to-brand-violet text-primary-foreground shadow-glow'
          : 'border-border/70 bg-background/80 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ServiceCard({ service }: { service: ServiceDto }) {
  return (
    <Card className="card-lift group flex h-full flex-col transition-transform duration-500 hover:-translate-y-1 hover:shadow-glow">
      <CardContent className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="bg-primary/8 text-primary">{service.category.name}</Badge>
          {service.isFeatured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
        </div>
        <h3 className="font-heading text-lg font-semibold leading-snug">{service.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{service.tagline ?? service.description}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Starting at</p>
            <p className="font-bold text-primary">{formatBDT(service.basePrice)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Delivery</p>
            <p className="text-sm font-medium">{service.deliveryDays} days</p>
          </div>
        </div>
        <Button variant="outline" className="mt-2 w-full transition-colors duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground" asChild>
          <Link href={`/services/${service.slug}`}>
            View details <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
