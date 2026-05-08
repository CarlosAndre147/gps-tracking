import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { trackingSessions } from "../../../drizzle/schema";

/** Users that currently have at least one open `TrackingSession` (`stoppedAt` is null). */
export async function userIdsWithActiveTracking(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .selectDistinct({ userId: trackingSessions.userId })
    .from(trackingSessions)
    .where(and(inArray(trackingSessions.userId, userIds), isNull(trackingSessions.stoppedAt)));
  return new Set(rows.map((r) => r.userId));
}
