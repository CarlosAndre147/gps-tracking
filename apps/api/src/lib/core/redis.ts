import Redis from "ioredis";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/core/logger";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };
const REDIS_ERROR_LOG_THROTTLE_MS = 10_000;
let lastRedisErrorLogAt = 0;

export function createRedis(): Redis {
  const url = getEnv().REDIS_URL;
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    const now = Date.now();
    if (now - lastRedisErrorLogAt < REDIS_ERROR_LOG_THROTTLE_MS) return;
    lastRedisErrorLogAt = now;
    logger.warn(
      { err, throttleMs: REDIS_ERROR_LOG_THROTTLE_MS },
      "redis connection unavailable (logs throttled)",
    );
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedis();

if (getEnv().NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function checkRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    logger.error({ err }, "redis health check failed");
    return false;
  }
}
