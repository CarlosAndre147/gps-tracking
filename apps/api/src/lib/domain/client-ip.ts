import { isIP } from "node:net";

function normalizeCandidate(value: string): string | null {
  let candidate = value.trim().replace(/^"+|"+$/g, "");
  if (!candidate) return null;
  if (candidate.toLowerCase() === "unknown") return null;

  // Cloud/proxy chains may send comma-delimited values. Left-most is the client.
  if (candidate.includes(",")) {
    candidate = candidate.split(",")[0]?.trim() ?? "";
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice("::ffff:".length);
  }

  // Bracketed IPv6 with port (e.g. [2001:db8::1]:443)
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]");
    if (end > 1) {
      candidate = candidate.slice(1, end);
    }
  }

  // IPv4 with port (e.g. 203.0.113.10:54432)
  if (candidate.includes(".") && candidate.includes(":")) {
    const [host, port] = candidate.split(":");
    if (host && port && /^\d+$/.test(port)) {
      candidate = host;
    }
  }

  return isIP(candidate) ? candidate : null;
}

/**
 * Resolve best-effort client IP across direct requests, reverse proxies and CDNs.
 * In development, fallback is explicit localhost (`127.0.0.1`) to avoid `unknown` keys.
 */
export function getClientIp(request: Request): string {
  const candidates = [
    request.headers.get("cf-connecting-ip"), // Cloudflare
    request.headers.get("true-client-ip"), // Akamai / proxies
    request.headers.get("x-forwarded-for"), // Nginx / LB chain
    request.headers.get("x-real-ip"), // Nginx
    request.headers.get("x-client-ip"),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = normalizeCandidate(raw);
    if (normalized) return normalized;
  }

  return process.env.NODE_ENV === "development" ? "127.0.0.1" : "unknown";
}
