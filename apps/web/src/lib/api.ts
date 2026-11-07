import type { ApiEnvelope } from '@tsh/shared';

/**
 * Typed client for the Express API. Every response uses the shared envelope;
 * non-2xx responses throw a typed ApiClientError so callers can branch on
 * machine-readable codes (e.g. PROFILE_NOT_SYNCED, FILE_STORAGE_UNCONFIGURED).
 */

// Strip any trailing slash so env values like ".../api/" don't produce "//path" URLs.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/+$/, '');

/** Set by the auth provider at boot; lets every call attach the fresh token. */
let tokenProvider: () => Promise<string | null> = async () => null;
export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  // Auth bootstrap (expired refresh token, Firebase network error, first paint
  // before the provider is registered) must never break public endpoints —
  // fall through and call the API unauthenticated.
  let token: string | null = null;
  try {
    token = await tokenProvider();
  } catch {
    token = null;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Cannot reach the server — check your connection');
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // non-JSON error body (proxy down, HTML error page, …)
  }

  if (!res.ok || !payload || payload.success !== true) {
    const err = payload && payload.success === false ? payload.error : null;
    throw new ApiClientError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return payload.data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** Zod issue paths from a 422 VALIDATION_ERROR → { field: message }. */
export function validationDetails(err: unknown): Record<string, string> {
  if (err instanceof ApiClientError && err.code === 'VALIDATION_ERROR') {
    const issues = (err.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues;
    if (issues) return Object.fromEntries(issues.map((i) => [i.path, i.message]));
  }
  return {};
}

/**
 * Scoped upload ticket minted by POST /api/uploads/blob/token (or the admin
 * QR variant). The pathname is server-minted and ownership-scoped; the token
 * is constrained to this pathname, MIME type and size.
 */
export type BlobUploadTicket = {
  pathname: string;
  token: string;
  access: 'private';
  expiresAt: string;
};

/** Client-side upload to Vercel Blob using a scoped ticket minted by the API. */
export async function uploadToBlob(file: File, ticket: BlobUploadTicket): Promise<string> {
  // Client subpath; `put` consumes the server-minted ticket token directly
  // (unlike `upload`, which expects a handleUpload route to mint tokens).
  const { put } = await import('@vercel/blob/client');
  const result = await put(ticket.pathname, file, {
    access: 'private',
    token: ticket.token,
    contentType: file.type || 'application/octet-stream',
  });
  return result.pathname;
}

/**
 * Upload a public image (avatar or service media). The raw bytes go through
 * the API, which stores them as a PUBLIC Vercel Blob and returns the permanent
 * CDN URL — drop it straight into profileImage / imageUrl / thumbnail /
 * bannerImage fields.
 */
export async function uploadPublicImage(
  file: File,
  kind: 'avatar' | 'service-image',
): Promise<{ url: string; pathname: string }> {
  const path = kind === 'avatar' ? '/uploads/image' : '/admin/uploads/image';
  const token = await tokenProvider().catch(() => null);
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: file });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Cannot reach the server — check your connection');
  }

  let payload: ApiEnvelope<{ url: string; pathname: string }> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<{ url: string; pathname: string }>;
  } catch {
    // non-JSON error body (proxy down, HTML error page, …)
  }
  if (!res.ok || !payload || payload.success !== true) {
    const err = payload && payload.success === false ? payload.error : null;
    throw new ApiClientError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? `Upload failed (${res.status})`,
      err?.details,
    );
  }
  return payload.data;
}
