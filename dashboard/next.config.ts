import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const corsOrigin = process.env.BASTION_CORS_ORIGIN
  ? process.env.BASTION_CORS_ORIGIN
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

// Next's inline bootstrap/runtime scripts require 'unsafe-inline' unless a
// nonce pipeline is added. Evaluated code is only needed for the dev overlay.
const scriptSrc = isDev
  ? "'self' 'unsafe-eval' 'unsafe-inline'"
  : "'self' 'unsafe-inline'";
// WebSocket connections are only needed for the dev HMR client.
const connectSrc = isDev ? "'self' ws: wss:" : "'self'";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src ${connectSrc}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Vary", value: "Origin" },
          ...(corsOrigin
            ? [
                { key: "Access-Control-Allow-Origin", value: corsOrigin },
                { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Request-ID, X-CSRF-Token, x-bastion-conn" },
                { key: "Access-Control-Allow-Credentials", value: "true" },
                { key: "Access-Control-Max-Age", value: "86400" },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
