/**
 * Canonical origin for metadata, sitemap and robots. NEXT_PUBLIC_SITE_URL is
 * baked at build time — set it (e.g. https://techservicehub.vercel.app) in the
 * Vercel project settings and redeploy; changing it later requires a rebuild.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
