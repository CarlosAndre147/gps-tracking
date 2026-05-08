import { redis } from "@/lib/core/redis";

export const TRACKING_REDIS_CHANNEL_PREFIX = "gps:company:";

export const LAST_LOC_KEY_PREFIX = "lastloc:";
export const LAST_LOC_TTL_SEC = 600;

export const LOCATION_THROTTLE_MS = 1000;
export const LOCATION_THROTTLE_KEY_PREFIX = "throttle:location:";

export function lastLocationKey(userId: string): string {
  return `${LAST_LOC_KEY_PREFIX}${userId}`;
}

export function locationThrottleKey(userId: string): string {
  return `${LOCATION_THROTTLE_KEY_PREFIX}${userId}`;
}

export function companyTrackingChannel(companyId: string): string {
  return `${TRACKING_REDIS_CHANNEL_PREFIX}${companyId}`;
}

export type LastLocationPayload = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  timestamp: number;
  /** Unix ms do último INSERT real em `locations` (dead reckoning). */
  savedAt?: number;
  isActive: boolean;
};

export async function setLastLocation(userId: string, payload: LastLocationPayload): Promise<void> {
  await redis.set(lastLocationKey(userId), JSON.stringify(payload), "EX", LAST_LOC_TTL_SEC);
}

export async function getLastLocation(userId: string): Promise<LastLocationPayload | null> {
  const raw = await redis.get(lastLocationKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastLocationPayload;
  } catch {
    return null;
  }
}

export async function publishCompanyTrackingEvent(companyId: string, payload: unknown): Promise<void> {
  await redis.publish(companyTrackingChannel(companyId), JSON.stringify(payload));
}
