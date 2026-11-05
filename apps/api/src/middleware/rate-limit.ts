import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { ENABLE_CLOUDINARY_AUTH, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_TOKEN } from '../config/env.js';

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
let redisStoreInstance: any;
function getRedisStore() {
  if (!UPSTASH_REDIS_REST_URL) {
    // No Upstash config – skip Redis store entirely.
    return undefined;
  }
  if (redisStoreInstance !== undefined) return redisStoreInstance;
  try {
    redisStoreInstance = new RedisStore({
      // Upstash REST API client
      sendCommand: async (...args: any[]) => {
        if (!UPSTASH_REDIS_REST_URL) {
          throw new Error('Upstash Redis URL not configured');
        }
        const url = `${UPSTASH_REDIS_REST_URL}`;
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
  } catch (e) {
    // fallback to undefined store
    redisStoreInstance = undefined;
  }
  return redisStoreInstance;
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => {
    if (req.authUser?.id) return String(req.authUser.id);
    const { ipKeyGenerator } = require('express-rate-limit');
    return ipKeyGenerator(req);
  },
  store: getRedisStore(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many upload signature requests' } });
  },
});


/** Wrapper that fails closed if Redis is unavailable when auth mode is enabled. */
export async function uploadRateLimiter(req: any, res: any, next: any) {
  // When auth feature is disabled, bypass rate limiting (legacy behavior preserved).
  if (!ENABLE_CLOUDINARY_AUTH) return next();
  try {
    await uploadLimiter(req, res, next);
  } catch (err) {
    // Fail closed – treat as service unavailable.
    res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Rate limit service unavailable' } });
  }
}

