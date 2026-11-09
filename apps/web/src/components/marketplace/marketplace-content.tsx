'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Flame, Lightbulb, PackageOpen, Search, Star } from 'lucide-react';
import type {
  MarketplaceCategoryDto,
  MarketplaceServiceCardDto,
  Paginated,
  ServiceType,
} from '@tsh/shared';
import { SERVICE_TYPES } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { CategoryIcon } from './category-icon';
import { ServiceCard, cardVariants, gridVariants } from './service-card';

const PAGE_SIZE = 12;

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

export function MarketplaceContent() {
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotion();

  const category = params.get('category') ?? '';
  const search = params.get('search') ?? '';
  const pricing = params.get('pricing') ?? '';
  const serviceType = params.get('type') ?? '';
  const sort = params.get('sort') ?? 'popular';
  const page = Number(params.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(search);
  const isFiltered = Boolean(category || search || pricing || serviceType) || sort !== 'popular';

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParams({ search: searchInput || null, page: null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/services${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }

  const { data: categories } = useSWR<MarketplaceCategoryDto[]>('marketplace-categories', () =>
    api.get<MarketplaceCategoryDto[]>('/marketplace/categories'),
  );

  const gridQuery = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(sort !== 'popular' ? { sort } : {}),
    ...(category ? { category } : {}),
    ...(search ? { search } : {}),
    ...(pricing ? { pricing } : {}),
    ...(serviceType ? { serviceType } : {}),
  });
  const gridKey = `/marketplace/services?${gridQuery.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<Paginated<MarketplaceServiceCardDto>>(
    gridKey,
    () => api.get<Paginated<MarketplaceServiceCardDto>>(gridKey),
    { keepPreviousData: true },
  );

  // Section rows only exist on the unfiltered landing view.
  const { data: popular } = useSWR<Paginated<MarketplaceServiceCardDto>>(
    isFiltered ? null : 'marketplace-popular',
    () => api.get<Paginated<MarketplaceServiceCardDto>>('/marketplace/services?badge=popular&pageSize=3'),
  );
  const { data: featured } = useSWR<Paginated<MarketplaceServiceCardDto>>(
    isFiltered ? null : 'marketplace-featured',
    () => api.get<Paginated<MarketplaceServiceCardDto>>('/marketplace/services?badge=featured&pageSize=6'),
  );

  const activeCategory = categories?.find((c) => c.slug === category) ?? null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-10">
      {/* Heading + intro */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-gradient-to-r from-primary to-brand-fuchsia" />
            Marketplace
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Service Marketplace</h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Browse our services, submit a request with your requirements, receive a quotation, and pay
            securely from your wallet. Prices shown are starting prices — the final quotation depends on
            complexity, scope and deadline.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search services…"
              className="w-full pl-9 sm:w-64"
              aria-label="Search services"
            />
          </div>
          <div className="flex gap-3">
            <Select value={serviceType || 'all-types'} onValueChange={(v) => setParams({ type: v === 'all-types' ? null : v, page: null })}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filter by service type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All types</SelectItem>
                {SERVICE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SERVICE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setParams({ sort: v === 'popular' ? null : v, page: null })}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Sort">
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
      </div>

      {/* Category + price-model chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <Chip active={!category} onClick={() => setParams({ category: null, page: null })}>
          All categories
        </Chip>
        {categories?.map((c) => (
          <Chip key={c.slug} active={category === c.slug} onClick={() => setParams({ category: c.slug, page: null })}>
            {c.name}
          </Chip>
        ))}
        <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden="true" />
        <Chip active={pricing === 'priced'} onClick={() => setParams({ pricing: pricing === 'priced' ? null : 'priced', page: null })}>
          Starting price
        </Chip>
        <Chip
          active={pricing === 'CUSTOM_QUOTE'}
          onClick={() => setParams({ pricing: pricing === 'CUSTOM_QUOTE' ? null : 'CUSTOM_QUOTE', page: null })}
        >
          Custom quote
        </Chip>
      </div>

      {/* Category hero (visual identity per PRD §A) */}
      {activeCategory && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.3 }}
          className="flex items-start gap-4 rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/8 to-brand-fuchsia/5 p-5 shadow-soft"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
            <CategoryIcon iconKey={activeCategory.iconKey} className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{activeCategory.name}</h2>
            {activeCategory.description && (
              <p className="mt-1 text-sm text-muted-foreground">{activeCategory.description}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {activeCategory.serviceCount} service{activeCategory.serviceCount === 1 ? '' : 's'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Error state */}
      {error && (
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
      )}

      {/* Unfiltered landing: Popular + Featured sections, then the full grid */}
      {!isFiltered && (
        <>
          {popular && popular.items.length > 0 && (
            <ServiceSection icon={<Flame className="h-5 w-5 text-orange-500" aria-hidden="true" />} title="Popular right now">
              <StaggerGrid>
                {popular.items.map((s) => (
                  <ServiceCard key={s.id} service={s} />
                ))}
              </StaggerGrid>
            </ServiceSection>
          )}
          {featured && featured.items.length > 0 && (
            <ServiceSection icon={<Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />} title="Featured">
              <StaggerGrid>
                {featured.items.map((s) => (
                  <ServiceCard key={s.id} service={s} />
                ))}
              </StaggerGrid>
            </ServiceSection>
          )}
        </>
      )}

      {/* Grid */}
      <section aria-label={isFiltered ? 'Filtered services' : 'All services'}>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{isFiltered ? 'Results' : 'All services'}</h2>
          {data && <p className="text-sm text-muted-foreground">{data.total} available</p>}
        </div>

        {isLoading && !data ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <StaggerGrid>
              {data.items.map((s) => (
                <ServiceCard key={s.id} service={s} />
              ))}
            </StaggerGrid>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
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
          !error && (
            <EmptyState
              icon={PackageOpen}
              title="No services match"
              description={
                search
                  ? `Nothing found for “${search}”. Try a different search or filter.`
                  : 'No services match these filters yet — check back soon.'
              }
              action={
                isFiltered && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchInput('');
                      setParams({ search: null, category: null, pricing: null, type: null, page: null });
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          )
        )}
      </section>

      {/* Custom-request entry point — routed to the IT Consulting Sprint (the
          catch-all for custom work) until a dedicated custom-request service ships. */}
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: reduced ? 0.15 : 0.35 }}
        className="flex flex-col items-start gap-4 rounded-xl border border-primary/30 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Can&apos;t find your service?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Describe what you need — we&apos;ll scope it and send you a custom quotation.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/services/it-consulting-sprint/request">Request a custom quote</Link>
        </Button>
      </motion.div>
    </div>
  );
}

function ServiceSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduced ? 0.15 : 0.35 }}
    >
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function StaggerGrid({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? { hidden: {}, show: {} } : gridVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </motion.div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        active
          ? 'border-primary bg-gradient-to-r from-primary to-brand-violet text-primary-foreground shadow-glow'
          : 'border-border/70 bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// cardVariants is re-exported for consumers that need standalone animation.
export { cardVariants };
