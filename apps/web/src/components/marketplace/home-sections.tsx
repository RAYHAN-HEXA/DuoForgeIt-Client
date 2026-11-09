'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { MarketplaceCategoryDto, MarketplaceServiceCardDto, Paginated } from '@tsh/shared';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from './category-icon';
import { ServiceCard, cardVariants, gridVariants } from './service-card';

/**
 * Homepage categories strip + "Popular services" grid, backed by the
 * marketplace-v2 API (PRD v2.0 catalogue) when the flag is on. Rendered
 * instead of the legacy sections; flag off ⇒ legacy homepage unchanged.
 */

function useMarketplaceHomeData() {
  const categories = useSWR<MarketplaceCategoryDto[]>('home:marketplace-categories', () =>
    api.get<MarketplaceCategoryDto[]>('/marketplace/categories'),
  );
  // Same default listing the /services page renders (popular-first), first 6.
  const services = useSWR<Paginated<MarketplaceServiceCardDto>>('home:marketplace-services', () =>
    api.get<Paginated<MarketplaceServiceCardDto>>('/marketplace/services?pageSize=6'),
  );
  return {
    categories: categories.data,
    services: services.data?.items ?? [],
    total: services.data?.total ?? 0,
    loading: !categories.data || !services.data,
  };
}

export function MarketplaceHomeSections() {
  const { categories, services, total, loading } = useMarketplaceHomeData();
  return (
    <>
      <MarketplaceCategories categories={categories} />
      <MarketplaceFeatured services={services} total={total} loading={loading} />
    </>
  );
}

function MarketplaceCategories({ categories }: { categories?: MarketplaceCategoryDto[] }) {
  if (!categories?.length) return null;
  return (
    <section className="relative border-y bg-muted/20 py-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/services?category=${c.slug}`}
              className="group flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium shadow-xs backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary hover:text-primary-foreground hover:shadow-glow"
            >
              <CategoryIcon iconKey={c.iconKey} className="h-4 w-4 text-primary transition-colors duration-300 group-hover:text-primary-foreground" />
              {c.name}
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketplaceFeatured({
  services,
  total,
  loading,
}: {
  services: MarketplaceServiceCardDto[];
  total: number;
  loading: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section heading mirrors the homepage SectionHeading markup */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-gradient-to-r from-primary to-brand-fuchsia" />
            Services
          </p>
          <h2 className="text-balance font-heading text-3xl font-bold tracking-tight sm:text-4xl">Popular services, ready to start</h2>
          <span aria-hidden="true" className="mx-auto mt-4 block h-px w-16 rounded-full bg-gradient-to-r from-primary via-brand-violet to-brand-fuchsia" />
          <p className="mt-3 text-pretty text-muted-foreground">
            Starting prices — submit a request with your requirements and we send a quotation before any payment.
          </p>
        </div>

        {loading ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : (
          <motion.div
            variants={reduced ? { hidden: {}, show: {} } : gridVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
            className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {services.map((s) => (
              <motion.div key={s.id} variants={cardVariants(Boolean(reduced))} className="flex">
                <ServiceCard service={s} />
              </motion.div>
            ))}
            <Card className="flex items-center justify-center border-dashed">
              <CardContent className="p-6 text-center">
                <p className="font-medium">Need something custom?</p>
                <p className="mt-1 text-sm text-muted-foreground">We scope bespoke builds together.</p>
                <Button variant="link" className="mt-2" asChild>
                  <Link href="/services/it-consulting-sprint/request">
                    Request a quote <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* All services → the /services marketplace page */}
        {total > 0 && (
          <div className="mt-10 flex justify-center">
            <Button size="lg" variant="outline" className="h-12 px-8" asChild>
              <Link href="/services">
                All services {total > services.length ? `(${total})` : ''} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
