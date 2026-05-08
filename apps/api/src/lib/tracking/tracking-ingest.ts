import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { locations, trackingSessions, userCompanies } from "../../../drizzle/schema";
import { redis } from "@/lib/core/redis";
import {
  LOCATION_THROTTLE_MS,
  getLastLocation,
  locationThrottleKey,
  publishCompanyTrackingEvent,
  setLastLocation,
  type LastLocationPayload,
} from "@/lib/tracking/tracking-redis";
import { haversineDistance } from "@/lib/utils/haversine";
export type IngestLocationInput = {
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
};

export type IngestLocationResult =
  | { ignored: true }
  | {
      ignored: false;
      persisted: false;
      companiesNotified: string[];
    }
  | {
      ignored: false;
      persisted: true;
      locationId: string;
      companiesNotified: string[];
    };


async function companyIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  return rows.map((r) => r.companyId);
}

export async function ingestLocationUpdate(input: IngestLocationInput): Promise<IngestLocationResult> {
  const throttleKey = locationThrottleKey(input.userId);
  const throttleOk = await redis.set(throttleKey, "1", "PX", LOCATION_THROTTLE_MS, "NX");
  if (throttleOk !== "OK") {
    return { ignored: true };
  }

  const [activeSession] = await db
    .select({ id: trackingSessions.id })
    .from(trackingSessions)
    .where(and(eq(trackingSessions.userId, input.userId), isNull(trackingSessions.stoppedAt)))
    .orderBy(desc(trackingSessions.startedAt))
    .limit(1);

  const isActive = !!activeSession;
  const last = await getLastLocation(input.userId);

  if (last) {
    const dist = haversineDistance(last.lat, last.lng, input.lat, input.lng);
    const lastSavedAt = last.savedAt ?? last.timestamp;
    const msSinceLastSave = Date.now() - lastSavedAt;
    const accuracy = input.accuracy;
    const shouldPersist =
      dist > 10 ||
      (!!accuracy && last.accuracy != null && accuracy > last.accuracy * 3) ||
      msSinceLastSave > 60_000;

    if (!shouldPersist) {
      const now = Date.now();
      const skipPayload: LastLocationPayload = {
        lat: input.lat,
        lng: input.lng,
        accuracy: accuracy ?? last.accuracy ?? null,
        speed: input.speed ?? null,
        heading: input.heading ?? null,
        altitude: input.altitude ?? null,
        timestamp: now,
        savedAt: lastSavedAt,
        isActive,
      };
      await setLastLocation(input.userId, skipPayload);

      const companyIds = await companyIdsForUser(input.userId);
      const event = {
        type: "USER_LOCATION",
        userId: input.userId,
        lat: input.lat,
        lng: input.lng,
        accuracy: accuracy ?? null,
        speed: input.speed ?? null,
        heading: input.heading ?? null,
        altitude: input.altitude ?? null,
        timestamp: now,
        isActive,
      };
      await Promise.all(companyIds.map((companyId) => publishCompanyTrackingEvent(companyId, event)));

      return { ignored: false, persisted: false, companiesNotified: companyIds };
    }
  }

  const [location] = await db
    .insert(locations)
    .values({
      userId: input.userId,
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy ?? undefined,
      speed: input.speed ?? undefined,
      heading: input.heading ?? undefined,
      altitude: input.altitude ?? undefined,
    })
    .returning({ id: locations.id, createdAt: locations.createdAt });

  if (!location) {
    throw new Error("Failed to insert location");
  }

  const createdMs = location.createdAt.getTime();
  const payload: LastLocationPayload = {
    lat: input.lat,
    lng: input.lng,
    accuracy: input.accuracy ?? null,
    speed: input.speed ?? null,
    heading: input.heading ?? null,
    altitude: input.altitude ?? null,
    timestamp: createdMs,
    savedAt: createdMs,
    isActive,
  };
  await setLastLocation(input.userId, payload);

  const companyIds = await companyIdsForUser(input.userId);
  const event = {
    type: "USER_LOCATION",
    userId: input.userId,
    locationId: location.id,
    lat: input.lat,
    lng: input.lng,
    accuracy: input.accuracy ?? null,
    speed: input.speed ?? null,
    heading: input.heading ?? null,
    altitude: input.altitude ?? null,
    timestamp: createdMs,
    isActive,
  };

  await Promise.all(companyIds.map((companyId) => publishCompanyTrackingEvent(companyId, event)));

  return { ignored: false, persisted: true, locationId: location.id, companiesNotified: companyIds };
}

export async function snapshotLocationsForCompanies(
  companyIds: string[],
): Promise<Record<string, LastLocationPayload | null>> {
  if (companyIds.length === 0) {
    return {};
  }
  const userRows = await db
    .selectDistinct({ userId: userCompanies.userId })
    .from(userCompanies)
    .where(inArray(userCompanies.companyId, companyIds));

  const ids = userRows.map((u) => u.userId);
  const out: Record<string, LastLocationPayload | null> = {};
  await Promise.all(
    ids.map(async (userId) => {
      const cached = await getLastLocation(userId);
      const [latest] = await db
        .select({
          lat: locations.lat,
          lng: locations.lng,
          accuracy: locations.accuracy,
          speed: locations.speed,
          heading: locations.heading,
          altitude: locations.altitude,
          createdAt: locations.createdAt,
        })
        .from(locations)
        .where(eq(locations.userId, userId))
        .orderBy(desc(locations.createdAt))
        .limit(1);

      if (!latest && !cached) {
        out[userId] = null;
        return;
      }

      const [open] = await db
        .select({ id: trackingSessions.id })
        .from(trackingSessions)
        .where(and(eq(trackingSessions.userId, userId), isNull(trackingSessions.stoppedAt)))
        .orderBy(desc(trackingSessions.startedAt))
        .limit(1);

      const latestFromDb: LastLocationPayload | null = latest
        ? {
            lat: latest.lat,
            lng: latest.lng,
            accuracy: latest.accuracy ?? null,
            speed: latest.speed ?? null,
            heading: latest.heading ?? null,
            altitude: latest.altitude ?? null,
            timestamp: latest.createdAt.getTime(),
            savedAt: latest.createdAt.getTime(),
            isActive: !!open,
          }
        : null;

      const cachedTs = cached?.savedAt ?? cached?.timestamp ?? 0;
      const dbTs = latestFromDb?.savedAt ?? latestFromDb?.timestamp ?? 0;

      if (!latestFromDb) {
        out[userId] = { ...cached!, isActive: !!open };
        return;
      }

      if (!cached) {
        out[userId] = latestFromDb;
        return;
      }

      out[userId] = cachedTs >= dbTs ? { ...cached, isActive: !!open } : latestFromDb;
    }),
  );
  return out;
}
