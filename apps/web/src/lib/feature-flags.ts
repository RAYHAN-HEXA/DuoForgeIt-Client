/**
 * Feature flags for the marketplace v2 + wallet rollout.
 *
 * Values are inlined at build time from NEXT_PUBLIC_* env vars (set in Vercel
 * project settings). Flag off ⇒ the legacy pages render exactly as before —
 * new pages/routes check these before activating.
 *
 * Mirrors the API flags (SERVICE_MARKETPLACE_ENABLED / WALLET_ENABLED in
 * apps/api/src/config/env.ts) — keep both in sync when rolling out.
 */
export const SERVICE_MARKETPLACE_ENABLED =
  process.env.NEXT_PUBLIC_SERVICE_MARKETPLACE_ENABLED === 'true';

export const WALLET_ENABLED = process.env.NEXT_PUBLIC_WALLET_ENABLED === 'true';
