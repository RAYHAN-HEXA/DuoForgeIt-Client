import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated areas stay out of indexes.
        disallow: ['/dashboard', '/admin', '/profile', '/orders', '/notifications', '/wallet'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
