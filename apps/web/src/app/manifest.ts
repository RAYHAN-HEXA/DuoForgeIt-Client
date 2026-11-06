import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TechService Hub',
    short_name: 'TechService',
    description:
      'From academic projects to professional software development — two founders, direct access, full transparency.',
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#0b1220',
    icons: [
      { src: `${SITE_URL}/icon`, sizes: '32x32', type: 'image/png' },
      { src: `${SITE_URL}/apple-icon`, sizes: '180x180', type: 'image/png' },
    ],
  };
}
