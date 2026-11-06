import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { SITE_URL } from '@/lib/site-url';
import { serverGet } from '@/lib/server-api';
import type { MarketplaceServiceCardDto, MarketplaceServiceDetailDto, Paginated, ServiceDto } from '@tsh/shared';
import { ServiceDetailView } from '@/components/marketplace/service-detail-view';
import { ServiceDetailContent } from './service-detail';

type Params = { params: Promise<{ slug: string }> };

/** Request-scoped fetch — generateMetadata and the page share one call. */
const getMarketplaceService = cache(async (slug: string) => {
  return serverGet<MarketplaceServiceDetailDto>(`/marketplace/services/${slug}`);
});

const getLegacyService = cache(async (slug: string) => {
  return serverGet<ServiceDto>(`/services/${slug}`);
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const service = SERVICE_MARKETPLACE_ENABLED ? await getMarketplaceService(slug) : await getLegacyService(slug);
    const description = service.tagline ?? service.description.slice(0, 155);
    return {
      title: service.name,
      description,
      alternates: { canonical: `/services/${service.slug}` },
      openGraph: {
        title: service.name,
        description,
        url: `${SITE_URL}/services/${service.slug}`,
        type: 'website',
        images: service.imageUrl ? [{ url: service.imageUrl }] : undefined,
      },
    };
  } catch {
    return { title: 'Service', robots: { index: false } };
  }
}

/**
 * The service fetch runs inside the Suspense boundary (cacheComponents
 * requires runtime data below a boundary). The fetch is request-scoped and
 * shared with generateMetadata, so unknown slugs still resolve metadata and
 * render the not-found page server-side — with no client loading flash.
 */
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
        <LegacyDetail params={params} />
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

/** Flag off ⇒ legacy detail page, server-fetched. */
async function LegacyDetail({ params }: Params) {
  const { slug } = await params;
  let service: ServiceDto;
  try {
    service = await getLegacyService(slug);
  } catch {
    // Unknown / inactive / archived slug → not-found page.
    notFound();
  }
  return <ServiceDetailContent initialData={service} />;
}

async function MarketplaceDetail({ params }: Params) {
  const { slug } = await params;
  let service: MarketplaceServiceDetailDto;
  try {
    service = await getMarketplaceService(slug);
  } catch {
    // Not found / unpublished / archived → not-found page
    notFound();
  }
  let related: MarketplaceServiceCardDto[] = [];
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
