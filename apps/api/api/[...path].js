// Vercel serverless entry — the whole Express app as one catch-all function.
// Imports the COMPILED app (dist/) — plain .js all the way down, so the
// bundler and file tracer see real files (no TS extension aliasing).
// Local dev uses src/server.ts; this entry never listens.
import { createApp } from '../dist/app.js';

const app = createApp();

// Vercel's function router may deliver the URL with the `/api` prefix
// stripped (this file lives under /api) — normalize so Express always sees
// the same `/api/*` routes it serves in local dev.
function normalizeUrl(req) {
  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url === '/' ? '' : req.url}`;
  }
}

export default function handler(req, res) {
  normalizeUrl(req);
  return app(req, res);
}
