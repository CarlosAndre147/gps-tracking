import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/core";
import { trackingSessions, userCompanies } from "../../../drizzle/schema";
import { publishCompanyTrackingEvent } from "@/lib/tracking";

export async function companyIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  return rows.map((r) => r.companyId);
}

export async function closeOpenSessions(userId: string): Promise<void> {
  await db
    .update(trackingSessions)
    .set({ stoppedAt: new Date() })
    .where(and(eq(trackingSessions.userId, userId), isNull(trackingSessions.stoppedAt)));
}

export async function startTrackingSession(userId: string, source: "http" | "ws" = "http") {
  await closeOpenSessions(userId);
  const [session] = await db.insert(trackingSessions).values({ userId, source }).returning();
  if (!session) throw new Error("Failed to create session");
  const companyIds = await companyIdsForUser(userId);
  const event = { type: "TRACKING_STARTED" as const, userId, sessionId: session.id, timestamp: Date.now() };
  await Promise.all(companyIds.map((id) => publishCompanyTrackingEvent(id, event)));
  return session;
}

export async function stopTrackingSession(userId: string) {
  const [open] = await db
    .select()
    .from(trackingSessions)
    .where(and(eq(trackingSessions.userId, userId), isNull(trackingSessions.stoppedAt)))
    .orderBy(desc(trackingSessions.startedAt))
    .limit(1);
  if (!open) return null;

  const [updated] = await db
    .update(trackingSessions)
    .set({ stoppedAt: new Date() })
    .where(eq(trackingSessions.id, open.id))
    .returning();
  if (!updated) return null;

  const companyIds = await companyIdsForUser(userId);
  const event = { type: "TRACKING_STOPPED" as const, userId, sessionId: updated.id, timestamp: Date.now() };
  await Promise.all(companyIds.map((id) => publishCompanyTrackingEvent(id, event)));
  return updated;
}
