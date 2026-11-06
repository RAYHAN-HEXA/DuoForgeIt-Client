import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

/**
 * Baseline security headers (always on) + CSP in Report-Only mode first:
 * Firebase/Google auth popups and Next's inline bootstrap scripts/styles mean
 * the report-only phase is needed to collect violations before enforcing.
 * Promote `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
 * after production reports come back clean (see docs/DEPLOYMENT.md).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next.js hydration requires inline scripts; 'unsafe-eval' only matters in dev.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      // Tailwind/shadcn inject inline styles.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      // Firebase auth/Firestore REST + WebSocket endpoints and the API.
      `connect-src 'self' ${API_URL} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

/**
 * Private/authenticated routes — never indexed. Delivered as X-Robots-Tag so
 * it applies regardless of whether a route renders from a client component.
 */
const noindexPaths = [
  "dashboard",
  "orders",
  "cart",
  "checkout",
  "notifications",
  "profile",
  "admin",
  "login",
  "register",
  "forgot-password",
  "reset-password",
];
const X_ROBOTS_NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
const noindexRules = noindexPaths.flatMap((p) => [
  { source: `/${p}`, headers: X_ROBOTS_NOINDEX },
  { source: `/${p}/:path*`, headers: X_ROBOTS_NOINDEX },
]);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      ...noindexRules,
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
