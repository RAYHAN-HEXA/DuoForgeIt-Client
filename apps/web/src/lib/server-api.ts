import 'server-only';

/**
 * Server-side fetch for PUBLIC API endpoints (RSC pages, metadata, sitemap).
 * No auth token — never use for endpoints that need one. No caching: the
 * catalog must reflect admin edits immediately.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export async function serverGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  const payload = (await res.json()) as { success: boolean; data?: T };
  if (!payload.success || payload.data === undefined) throw new Error(`GET ${path} returned an error`);
  return payload.data;
}
