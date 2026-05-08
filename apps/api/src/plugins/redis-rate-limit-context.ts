import type { Context, Options } from "elysia-rate-limit";
import { redis } from "@/lib/core/redis";
import { logger } from "@/lib/core/logger";

type StoredItem = {
  count: number;
  nextReset: number;
};

/**
 * Redis-backed store for `elysia-rate-limit` (same semantics as DefaultContext).
 */
export class RedisRateLimitContext implements Context {
  private readonly namespace: string;
  private durationMs = 60_000;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  init(options: Omit<Options, "context">): void {
    this.durationMs = options.duration;
  }

  private key(clientKey: string): string {
    return `erl:${this.namespace}:${clientKey}`;
  }

  async increment(clientKey: string): Promise<{ count: number; nextReset: Date }> {
    const k = this.key(clientKey);
    const now = Date.now();

    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await redis.get(k);
      if (!raw) {
        const item: StoredItem = { count: 1, nextReset: now + this.durationMs };
        const setOk = await redis.set(k, JSON.stringify(item), "PX", this.durationMs, "NX");
        if (setOk === "OK") {
          return { count: 1, nextReset: new Date(item.nextReset) };
        }
        continue;
      }

      let parsed: StoredItem;
      try {
        parsed = JSON.parse(raw) as StoredItem;
      } catch {
        await redis.del(k);
        continue;
      }

      if (parsed.nextReset < now) {
        const item: StoredItem = { count: 1, nextReset: now + this.durationMs };
        const ttl = Math.max(1, item.nextReset - now);
        await redis.set(k, JSON.stringify(item), "PX", ttl);
        return { count: 1, nextReset: new Date(item.nextReset) };
      }

      parsed.count += 1;
      const ttl = Math.max(1, parsed.nextReset - now);
      await redis.set(k, JSON.stringify(parsed), "PX", ttl);
      return { count: parsed.count, nextReset: new Date(parsed.nextReset) };
    }

    logger.error({ clientKey }, "redis rate limit increment failed after retries");
    return { count: 1, nextReset: new Date(now + this.durationMs) };
  }

  async decrement(clientKey: string): Promise<void> {
    const k = this.key(clientKey);
    const raw = await redis.get(k);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredItem;
      parsed.count = Math.max(0, parsed.count - 1);
      const ttl = await redis.pttl(k);
      if (ttl > 0) {
        await redis.set(k, JSON.stringify(parsed), "PX", ttl);
      } else {
        await redis.del(k);
      }
    } catch {
      await redis.del(k);
    }
  }

  async reset(clientKey?: string): Promise<void> {
    if (typeof clientKey === "string") {
      await redis.del(this.key(clientKey));
      return;
    }
    const pattern = `erl:${this.namespace}:*`;
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  async kill(): Promise<void> {
    await this.reset();
  }
}
