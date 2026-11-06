import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_TOKEN } from '../config/env.js';

/** General API budget per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/** Tighter budget for auth sync/profile endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests — slow down' } },
});

// Lazy initialization of RedisStore to avoid errors when Upstash config is missing
let redisStoreInstance: RedisStore | undefined;
function getRedisStore(): RedisStore | undefined {
  if (!UPSTASH_REDIS_REST_URL) {
    // No Upstash config – skip Redis store entirely (memory store fallback).
    return undefined;
  }
  if (redisStoreInstance !== undefined) return redisStoreInstance;
  try {
    redisStoreInstance = new RedisStore({
      // Upstash REST API client
      sendCommand: async (...args: string[]) => {
        const url = UPSTASH_REDIS_REST_URL;
        if (!url) {
          throw new Error('Upstash Redis URL not configured');
        }
        const body = JSON.stringify({ command: args[0], args: args.slice(1) });
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body,
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`Upstash Redis error: ${resp.status} ${txt}`);
        }
        return await resp.text();
      },
    });
  } catch {
    // fallback to undefined store
    redisStoreInstance = undefined;
  }
  return redisStoreInstance;
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  // Per-user budget for authenticated callers; IPv6-safe per-IP fallback.
  keyGenerator: (req) => req.authUser?.id ?? ipKeyGenerator(req.ip ?? ''),
  store: getRedisStore(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many upload requests — try again in a minute' } });
  },
});

/**
 * Upload-ticket budget (10/min/user). Applies whenever file storage is in
 * use; when storage is unconfigured the ticket endpoint rejects first, so
 * the limiter stays dormant anyway.
 */
export async function uploadRateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    await uploadLimiter(req, res, next);
  } catch {
    // Fail closed – treat as service unavailable.
    res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Rate limit service unavailable' } });
  }
}
