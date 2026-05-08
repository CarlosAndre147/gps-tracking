import { redis } from "@/lib/core/redis";

const FAIL_TTL_SEC = 15 * 60;
const BLOCK_TTL_SEC = 15 * 60;
const MAX_FAILURES = 5;

function failKey(ip: string): string {
  return `auth:login:fail:${ip}`;
}

function blockKey(ip: string): string {
  return `auth:login:block:${ip}`;
}

export async function isLoginBlocked(ip: string): Promise<boolean> {
  const blocked = await redis.exists(blockKey(ip));
  return blocked === 1;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const key = failKey(ip);
  const failures = await redis.incr(key);
  if (failures === 1) {
    await redis.expire(key, FAIL_TTL_SEC);
  }
  if (failures >= MAX_FAILURES) {
    await redis.set(blockKey(ip), "1", "EX", BLOCK_TTL_SEC);
    await redis.del(key);
  }
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await redis.del(failKey(ip));
}
