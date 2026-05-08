import Redis from "ioredis";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/core/logger";
import { publishWsTopic } from "@/lib/tracking/ws-publish";
import { TRACKING_REDIS_CHANNEL_PREFIX } from "@/lib/tracking/tracking-redis";

let subscriber: Redis | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let starting = false;
const RECONNECT_DELAY_MS = 10_000;

/**
 * Bridges Redis Pub/Sub (HTTP tracking publishes) into Bun WebSocket topics (`company:{id}`).
 */
export function startTrackingRedisSubscriber(): void {
  if (subscriber || starting) return;

  starting = true;
  const url = getEnv().REDIS_URL;
  const nextSubscriber = new Redis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: undefined,
  });

  nextSubscriber.on("error", (err) => {
    logger.warn(
      { redisError: summarizeRedisError(err) },
      "tracking redis subscriber disconnected",
    );
  });

  nextSubscriber.on("end", () => {
    subscriber = null;
    scheduleTrackingRedisReconnect();
  });

  nextSubscriber.on("pmessage", (_pattern, channel, message) => {
    if (!channel.startsWith(TRACKING_REDIS_CHANNEL_PREFIX)) return;
    const companyId = channel.slice(TRACKING_REDIS_CHANNEL_PREFIX.length);
    if (!companyId) return;
    publishWsTopic(`company:${companyId}`, message);
  });

  void nextSubscriber
    .connect()
    .then(async () => {
      await nextSubscriber.psubscribe(`${TRACKING_REDIS_CHANNEL_PREFIX}*`);
      subscriber = nextSubscriber;
      logger.info("tracking redis subscriber connected");
    })
    .catch((err) => {
      logger.warn(
        { redisError: summarizeRedisError(err), reconnectInMs: RECONNECT_DELAY_MS },
        "tracking redis unavailable, websocket bridge running in degraded mode",
      );
      nextSubscriber.disconnect();
      scheduleTrackingRedisReconnect();
    })
    .finally(() => {
      starting = false;
    });
}

export async function stopTrackingRedisSubscriber(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (!subscriber) return;
  try {
    await subscriber.punsubscribe();
    await subscriber.quit();
  } catch (err) {
    logger.warn({ err }, "tracking redis subscriber stop failed");
  } finally {
    subscriber = null;
  }
}

function scheduleTrackingRedisReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startTrackingRedisSubscriber();
  }, RECONNECT_DELAY_MS);
}

function summarizeRedisError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
