import express from 'express';
import cors from 'cors';
import { createRequire } from 'node:module';
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { corsOrigins } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiLimiter, apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import type { pinoHttp as pinoHttpType } from 'pino-http';

// pino-http ships CJS at runtime with dual default/named types; require it
// directly so both sides line up under NodeNext.
const require = createRequire(import.meta.url);

// Imported via createRequire — helmet's dual CJS/ESM types resolve
// differently under serverless build diagnostics; this keeps one callable shape.
type HelmetFactory = (options?: Record<string, unknown>) => RequestHandler;
const helmetModule = require('helmet') as HelmetFactory & { default?: HelmetFactory };
const helmet = helmetModule.default ?? helmetModule;
const pinoHttp = require('pino-http') as typeof pinoHttpType;

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Vercel/serverless proxies set X-Forwarded-*
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow server-to-server/no-origin requests (curl, health checks).
        // Disallowed origins get no CORS headers (not an error) so the request
        // is still served normally and the browser blocks the response.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: false, // Bearer-token auth; no cookies cross-origin
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.validated = {};
    next();
  });
  app.use(pinoHttp({ logger, genReqId: () => randomUUID(), autoLogging: false }));

  app.use('/api', apiLimiter, apiRouter);

  // Express 5: wildcard routes are gone — a terminal use() is the 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);
  return app;
}
