import { redis } from "@/lib/core/redis";
import { publishCompanyTrackingEvent } from "@/lib/tracking/tracking-redis";

const OFFLINE_DELAY_MS = 30_000;

const PRESENCE_KEY_PREFIX = "presence:";
/** TTL curto para snapshot de presença (online/offline) em Redis. */
const PRESENCE_STATE_TTL_SEC = 90;

const connectionCount = new Map<string, number>();
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

function presenceKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}

async function persistPresenceSnapshot(userId: string, state: "online" | "offline"): Promise<void> {
  const payload = JSON.stringify({ state, ts: Date.now() });
  await redis.set(presenceKey(userId), payload, "EX", PRESENCE_STATE_TTL_SEC);
}

async function publishPresence(userId: string, companyIds: string[], state: "online" | "offline"): Promise<void> {
  const event = {
    type: "USER_PRESENCE",
    userId,
    state,
    timestamp: Date.now(),
  };
  await Promise.all(companyIds.map((cid) => publishCompanyTrackingEvent(cid, event)));
  await persistPresenceSnapshot(userId, state);
}

function clearOfflineTimer(userId: string): void {
  const t = offlineTimers.get(userId);
  if (t) {
    clearTimeout(t);
    offlineTimers.delete(userId);
  }
}

export async function wsPresenceConnected(userId: string, companyIds: string[]): Promise<void> {
  clearOfflineTimer(userId);
  const prev = connectionCount.get(userId) ?? 0;
  const next = prev + 1;
  connectionCount.set(userId, next);
  if (prev === 0) {
    await publishPresence(userId, companyIds, "online");
  }
}

export function wsPresenceDisconnected(userId: string, companyIds: string[]): void {
  const prev = connectionCount.get(userId) ?? 0;
  const next = Math.max(0, prev - 1);
  if (next === 0) {
    connectionCount.delete(userId);
    clearOfflineTimer(userId);
    offlineTimers.set(
      userId,
      setTimeout(() => {
        offlineTimers.delete(userId);
        void publishPresence(userId, companyIds, "offline");
      }, OFFLINE_DELAY_MS),
    );
  } else {
    connectionCount.set(userId, next);
  }
}
