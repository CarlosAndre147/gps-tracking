import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import type { AuthUserPayload } from "@/lib/core/response";
import { RateLimitError } from "@/lib/core/errors";
import { getClientIp } from "@/lib/domain/client-ip";
import { RedisRateLimitContext } from "@/plugins/redis-rate-limit-context";

const WINDOW_MS = 60_000;

const ipContext = new RedisRateLimitContext("ip");
const userContext = new RedisRateLimitContext("user");
const locContext = new RedisRateLimitContext("loc");

function skipLowRiskPaths(request: Request): boolean {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/health") {
      return true;
    }
    if (pathname === "/docs" || pathname.startsWith("/docs/")) {
      return true;
    }
    if (pathname === "/ws/tracking" || pathname.startsWith("/ws/")) {
      return true;
    }
    if (pathname === "/tracking/session-status") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 100 req/min per IP (Redis + elysia-rate-limit). */
export function publicIpRateLimitPlugin() {
  return new Elysia({ name: "rate-limit-ip-public" }).use(
    rateLimit({
      duration: WINDOW_MS,
      max: 100,
      scoping: "global",
      countFailedRequest: false,
      context: ipContext,
      headers: true,
      skip: (request) => skipLowRiskPaths(request),
      generator: (request) => getClientIp(request),
      errorResponse: new RateLimitError(Math.ceil(WINDOW_MS / 1000)),
    }),
  );
}

/** 300 req/min per authenticated user — mount only after `authUser` is derived. */
export function authenticatedUserRateLimitPlugin() {
  return new Elysia({ name: "rate-limit-user" }).use(
    rateLimit({
      duration: WINDOW_MS,
      max: 300,
      scoping: "scoped",
      countFailedRequest: false,
      context: userContext,
      headers: true,
      skip: (request, clientKey) => skipLowRiskPaths(request) || clientKey === "",
      generator: (_request, _server, derived) => {
        const user = (derived as { authUser?: AuthUserPayload }).authUser;
        return user ? `uid:${user.id}` : "";
      },
      errorResponse: new RateLimitError(Math.ceil(WINDOW_MS / 1000)),
    }),
  );
}

/** 60 req/min per authenticated user for `POST /tracking/location` (keyed by userId, not IP). */
export function trackingLocationRateLimitPlugin() {
  return new Elysia({ name: "rate-limit-tracking-location" }).use(
    rateLimit({
      duration: WINDOW_MS,
      max: 60,
      scoping: "scoped",
      countFailedRequest: false,
      context: locContext,
      headers: true,
      skip: (_request, clientKey) => clientKey === "",
      generator: (_request, _server, derived) => {
        const user = (derived as { authUser?: AuthUserPayload }).authUser;
        return user ? `uid:${user.id}` : "";
      },
      errorResponse: new RateLimitError(Math.ceil(WINDOW_MS / 1000)),
    }),
  );
}
