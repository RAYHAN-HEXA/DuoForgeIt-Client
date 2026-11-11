import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { fail } from '../utils/envelope.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Prisma codes for schema drift — the deployed client queries a table or
 * column the database doesn't have, i.e. a migration wasn't applied before
 * the code shipped. Duck-typed like the P2002 mappings in the payment
 * services (Prisma errors are plain Errors with a string `code`).
 */
const PRISMA_SCHEMA_DRIFT_CODES = new Set(['P2021', 'P2022']);

function isPrismaSchemaDrift(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    PRISMA_SCHEMA_DRIFT_CODES.has((err as { code?: string }).code ?? '')
  );
}

/**
 * Centralized error handler — MUST be registered last.
 * Zod issues → 422; ApiError → its own status; Prisma schema drift → 503
 * (so an unapplied migration is diagnosable from the client instead of an
 * opaque 500 — regression 2026-11-11: registration 500'd because the OTP
 * migration wasn't applied); anything else → 500 with no internals leaked to
 * the client (full stack goes to pino server-side only).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json(
      fail('VALIDATION_ERROR', 'Some fields are invalid', {
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
    );
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, reqId: req.id }, err.message);
    return res.status(err.status).json(fail(err.code, err.message, err.details));
  }

  // Body-parser JSON syntax errors
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed') {
    return res.status(400).json(fail('INVALID_JSON', 'Request body is not valid JSON'));
  }

  // Unapplied migration — tell the operator loudly and the client honestly.
  if (isPrismaSchemaDrift(err)) {
    logger.error(
      { err, reqId: req.id },
      'Prisma schema drift — a migration is not applied on this database (run `prisma migrate deploy`)',
    );
    return res.status(503).json(
      fail('DB_SCHEMA_MISMATCH', 'Database update in progress — please try again in a moment'),
    );
  }

  logger.error({ err, reqId: req.id }, 'Unhandled error');
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : String((err as Error)?.message ?? err);
  return res.status(500).json(fail('INTERNAL', message));
}
