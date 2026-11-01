import type { ApiEnvelope } from '@tsh/shared';

/** Build the success envelope: `res.json(ok(data))` (or `res.status(201).json(ok(data))`). */
export function ok<T>(data: T): ApiEnvelope<T> {
  return { success: true, data };
}

/** Build the error payload (used by the error middleware). */
export function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiEnvelope<never> & { success: false } {
  return { success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } };
}
