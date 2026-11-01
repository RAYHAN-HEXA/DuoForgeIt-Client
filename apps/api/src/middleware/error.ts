import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { fail } from '../utils/envelope.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Centralized error handler — MUST be registered last.
 * Zod issues → 422; ApiError → its own status; anything else → 500 with no
 * internals leaked to the client (full stack goes to pino server-side only).
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

  logger.error({ err, reqId: req.id }, 'Unhandled error');
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : String((err as Error)?.message ?? err);
  return res.status(500).json(fail('INTERNAL', message));
}
