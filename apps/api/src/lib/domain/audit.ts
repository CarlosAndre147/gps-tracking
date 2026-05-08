import { db } from "@/lib/core/db";
import { auditLogs } from "../../../drizzle/schema";

export async function createAuditLog(params: {
  userId?: string;
  action: string;
  target?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  await db.insert(auditLogs).values({
    userId: params.userId,
    action: params.action,
    target: params.target,
    targetType: params.targetType,
    metadata: params.metadata,
    ip: params.ip,
    userAgent: params.userAgent,
  });
}
