import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { serverGet } from '@/lib/server-api';
import type { MarketplaceServiceCardDto, MarketplaceServiceDetailDto, Paginated } from '@tsh/shared';
import { ServiceDetailView } from '@/components/marketplace/service-detail-view';
import { ServiceDetailContent } from './service-detail';

type Params = { params: Promise<{ slug: string }> };

/** Request-scoped fetch — generateMetadata and the page share one call. */
const getService = cache(async (slug: string) => {
  return serverGet<MarketplaceServiceDetailDto>(`/marketplace/services/${slug}`);
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  if (!SERVICE_MARKETPLACE_ENABLED) return {};
  const { slug } = await params;
  try {
    const service = await getService(slug);
    return {
      title: service.name,
      description:
        service.tagline ??
        service.description.slice(0, 155),
      openGraph: {
        title: service.name,
        description: service.tagline ?? service.description.slice(0, 155),
        type: 'website',
        images: service.imageUrl ? [{ url: service.imageUrl }] : undefined,
      },
    };
  } catch {
    return { title: 'Service' };
  }
}

/** Flag off ⇒ legacy detail page renders exactly as before. */
export default function ServiceDetailPage({ params }: Params) {
  if (!SERVICE_MARKETPLACE_ENABLED) {
    return (
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6">
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
          </div>
        }
      >
        <ServiceDetailContent />
      </Suspense>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Suspense
        fallback={
          <div className="space-y-8">
            <div className="h-56 animate-pulse rounded-2xl bg-muted" />
            <div className="h-64 animate-pulse rounded-xl bg-muted" />
          </div>
        }
      >
        <MarketplaceDetail params={params} />
      </Suspense>
    </div>
  );
}

async function MarketplaceDetail({ params }: Params) {
  const { slug } = await params;
  let service: MarketplaceServiceDetailDto;
  try {
    service = await getService(slug);
  } catch {
    // Not found / unpublished / archived → 404 page
    notFound();
  }
  let related = [] as Awaited<ReturnType<typeof fetchRelated>>;
  try {
    related = await fetchRelated(service);
  } catch {
    // related services are best-effort
  }
  return <ServiceDetailView service={service} related={related} />;
}

async function fetchRelated(service: MarketplaceServiceDetailDto): Promise<MarketplaceServiceCardDto[]> {
  const page = await serverGet<Paginated<MarketplaceServiceCardDto>>(
    `/marketplace/services?category=${encodeURIComponent(service.category.slug)}&pageSize=4`,
  );
  return page.items.filter((s) => s.id !== service.id).slice(0, 3);
}
