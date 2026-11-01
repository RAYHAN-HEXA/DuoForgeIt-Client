import type { ApiEnvelope } from '@tsh/shared';

/**
 * Typed client for the Express API. Every response uses the shared envelope;
 * non-2xx responses throw a typed ApiClientError so callers can branch on
 * machine-readable codes (e.g. PROFILE_NOT_SYNCED, FILE_STORAGE_UNCONFIGURED).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

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
  const token = await tokenProvider();
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

/** Client-side Cloudinary upload using a signature minted by the API. */
export async function uploadToCloudinary(
  file: File,
  signature: { uploadUrl: string; publicId: string; apiKey: string; timestamp: number; signature: string; folder: string },
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);
  const res = await fetch(signature.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new ApiClientError(res.status, 'UPLOAD_FAILED', 'File upload failed — try again');
  const data = (await res.json()) as { public_id: string };
  return data.public_id;
}
