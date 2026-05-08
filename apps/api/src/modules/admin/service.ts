import { count, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { auditLogs, companies, trackingSessions, users } from "../../../drizzle/schema";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function loadDashboardStats() {
  const [companiesCount, usersCount, activeTrackingCount, todaySessionsCount, recentAuditLogs] = await Promise.all([
    db.select({ count: count() }).from(companies).where(eq(companies.isActive, true)),
    db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
    db.select({ count: count() }).from(trackingSessions).where(isNull(trackingSessions.stoppedAt)),
    db.select({ count: count() }).from(trackingSessions).where(gte(trackingSessions.startedAt, startOfToday())),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
  ]);

  return {
    stats: {
      companies: Number(companiesCount[0]?.count ?? 0),
      users: Number(usersCount[0]?.count ?? 0),
      activeTracking: Number(activeTrackingCount[0]?.count ?? 0),
      todaySessions: Number(todaySessionsCount[0]?.count ?? 0),
    },
    recentActivity: recentAuditLogs.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      createdAt: r.createdAt.toISOString(),
      user: r.userName ? { name: r.userName, email: r.userEmail } : null,
    })),
  };
}
