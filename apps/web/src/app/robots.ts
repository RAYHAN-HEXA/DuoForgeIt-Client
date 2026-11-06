import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated/transactional areas stay out of indexes.
        disallow: [
          '/dashboard',
          '/admin',
          '/profile',
          '/orders',
          '/notifications',
          '/cart',
          '/checkout',
          '/login',
          '/register',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
