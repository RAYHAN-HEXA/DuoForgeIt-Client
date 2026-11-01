'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, PackageOpen, Search, Star } from 'lucide-react';
import type { Paginated, ServiceCategoryDto, ServiceDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';

const PAGE_SIZE = 12;

export function ServicesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get('category') ?? 'all';
  const search = params.get('search') ?? '';
  const sort = params.get('sort') ?? 'popular';
  const page = Number(params.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(search);

  // Debounce search → URL (single source of truth)
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) {
        setParams({ search: searchInput || null, page: null });
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

  const { data: categories } = useSWR<ServiceCategoryDto[]>('/categories', () => api.get<ServiceCategoryDto[]>('/categories'));
  const { data, isLoading } = useSWR<Paginated<ServiceDto>>(
    `/services?${query.toString()}`,
    () => api.get<Paginated<ServiceDto>>(`/services?${query.toString()}`),
    { keepPreviousData: true },
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="mt-1 text-muted-foreground">
            {data ? `${data.total} service${data.total === 1 ? '' : 's'} available` : 'Loading…'}
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
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categories">
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
      {isLoading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
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
          description={search ? `Nothing found for “${search}”. Try a different search or category.` : 'This category has no services yet — check back soon.'}
          action={
            (search || category !== 'all') && (
              <Button variant="outline" onClick={() => { setSearchInput(''); setParams({ search: null, category: null }); }}>
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ServiceCard({ service }: { service: ServiceDto }) {
  return (
    <Card className="group flex flex-col transition-all hover:-translate-y-1 hover:shadow-lg">
      <CardContent className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{service.category.name}</Badge>
          {service.isFeatured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
        </div>
        <h3 className="text-lg font-semibold leading-snug">{service.name}</h3>
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
        <Button variant="outline" className="mt-2 w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
          <Link href={`/services/${service.slug}`}>
            View details <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
