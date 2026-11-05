import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/**
 * Sitemap with published marketplace services. When the marketplace flag is
 * off (API returns 404) or the fetch fails, the static routes still ship.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ['', '/services', '/login', '/register'].map((path) => ({
    url: `${SITE}${path}`,
    lastModified: new Date(),
  }));

  try {
    const res = await fetch(`${API_URL}/marketplace/services?pageSize=50`, { cache: 'no-store' });
    if (!res.ok) return staticRoutes;
    const payload = (await res.json()) as { success: boolean; data?: { items: Array<{ slug: string }> } };
    if (!payload.success || !payload.data) return staticRoutes;
    return [
      ...staticRoutes,
      ...payload.data.items.map((s) => ({
        url: `${SITE}/services/${s.slug}`,
        lastModified: new Date(),
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
