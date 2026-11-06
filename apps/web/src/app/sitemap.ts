import type { MetadataRoute } from 'next';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { SITE_URL } from '@/lib/site-url';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

type ServiceRow = { slug: string; updatedAt?: string };

/**
 * Sitemap: canonical home + catalog + every live service detail URL. Auth
 * pages are excluded (never index gated flows). Service URLs come from the
 * marketplace endpoint when that flag is on, the legacy catalog otherwise.
 * When the fetch fails the static routes still ship. lastModified derives
 * from each service's updatedAt — stable across requests, not `new Date()`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ['', '/services'].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));

  const path = SERVICE_MARKETPLACE_ENABLED
    ? `/marketplace/services?pageSize=50`
    : `/services?pageSize=50`;

  try {
    const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return staticRoutes;
    const payload = (await res.json()) as { success: boolean; data?: { items: ServiceRow[] } };
    if (!payload.success || !payload.data) return staticRoutes;
    return [
      ...staticRoutes,
      ...payload.data.items.map((s) => ({
        url: `${SITE_URL}/services/${s.slug}`,
        ...(s.updatedAt ? { lastModified: new Date(s.updatedAt) } : {}),
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
