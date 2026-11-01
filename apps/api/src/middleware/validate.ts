import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Parse and validate request parts with Zod (schemas live in @tsh/shared).
 * Parsed values are stored on req.validated — controllers read typed data
 * from there instead of touching raw req.body/query.
 */
export function validate(schemas: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.validated.body = schemas.body.parse(req.body);
      if (schemas.query) req.validated.query = schemas.query.parse(req.query);
      if (schemas.params) req.validated.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Typed accessor for validated data (set by validate() before the handler). */
export function validated<T>(req: Request, part: 'body' | 'query' | 'params'): T {
  return req.validated[part] as T;
}
