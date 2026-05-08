import { Elysia } from "elysia";
import { getEnv } from "@/config/env";

/**
 * Security headers (CSP, frame denial, nosniff, referrer policy, optional HSTS).
 * Implemented without `elysia-helmet` for reliable ESM/Node + Bun compatibility.
 */
export function helmetPlugin() {
  const isProd = getEnv().NODE_ENV === "production";

  const scriptSrc = isProd ? "'self'" : "'self' 'unsafe-inline' https:";
  const connectSrc = isProd ? "'self'" : "'self' http: https: ws: wss:";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc}`,
    "upgrade-insecure-requests",
  ].join("; ");

  return new Elysia({ name: "helmet" }).onRequest(({ set }) => {
    set.headers["Content-Security-Policy"] = csp;
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    if (isProd) {
      set.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
    }
  });
}
