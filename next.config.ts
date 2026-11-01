import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers (spec §11.7). The CSP locks connections down to the app and
 * its Supabase project (REST + realtime websocket) and disallows framing.
 *
 * `script-src` allows Next.js's own inline bootstrap/hydration scripts via
 * 'unsafe-inline' (and 'unsafe-eval' in development for HMR/React Refresh).
 * Hardening to a per-request nonce — removing 'unsafe-inline' — is tracked as a
 * follow-up in docs/SECURITY.md. `object-src 'none'` + `frame-ancestors 'none'`
 * keep the main XSS/clickjacking surface closed.
 */
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const connectSrc = isDev
  ? `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} ws://localhost:* http://localhost:*`
  : `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`;

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'", // Tailwind injects a style tag
  `img-src 'self' data: blob: https://${supabaseHost}`,
  "font-src 'self'",
  connectSrc,
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // The app is inherently dynamic (auth sessions, live scores), so we opt out of
  // cacheComponents and render per-request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
