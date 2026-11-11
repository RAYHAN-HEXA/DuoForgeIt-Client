import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../middleware/error.js';

/**
 * Prisma schema-drift mapping — regression 2026-11-11: an unapplied OTP
 * migration made every registration request 500 with an opaque INTERNAL
 * because P2021 (table does not exist) fell through to the generic handler.
 * It must surface as a distinct 503 DB_SCHEMA_MISMATCH so the failure is
 * diagnosable from the client.
 *
 * Standalone file on purpose: importing the app (and its env stubs) is not
 * needed here, and a module-scope import in app.test.ts would evaluate
 * config/env.js before that file's vi.stubEnv calls run.
 */

/** Prisma request errors are plain Errors carrying a string `code`. */
const prismaError = (code: string) =>
  Object.assign(new Error('The table `main.OtpChallenge` does not exist in the current database.'), {
    code,
  });

const next = (() => undefined) as NextFunction;

/** Call the handler with a stubbed Express response, return the spies. */
function handleError(err: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json } as unknown as Response;
  errorHandler(err, { id: 'test-req' } as Request, res, next);
  return { status, json };
}

describe('errorHandler — Prisma schema drift', () => {
  it.each(['P2021', 'P2022'])('maps %s to 503 DB_SCHEMA_MISMATCH', (code) => {
    const { status, json } = handleError(prismaError(code));
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'DB_SCHEMA_MISMATCH' }),
      }),
    );
  });

  it('leaves P2002 (unique constraint) and unknown errors on the generic 500 path', () => {
    for (const err of [prismaError('P2002'), new Error('boom')]) {
      const { status, json } = handleError(err);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL' }) }),
      );
    }
  });
});
