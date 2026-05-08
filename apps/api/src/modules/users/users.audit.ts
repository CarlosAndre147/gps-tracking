import { createAuditLog } from "@/lib/domain/audit";
import { getClientIp } from "@/lib/domain/client-ip";

type AuditRequest = Request;

function auditMeta(user: { name: string; email: string }) {
  return {
    targetLabel: user.name,
    targetSubtitle: user.email,
  };
}

export async function logUserCreated(
  actorUserId: string,
  user: { id: string; name: string; email: string },
  request: AuditRequest,
  extra?: Record<string, unknown>,
) {
  await createAuditLog({
    userId: actorUserId,
    action: "USER_CREATED",
    target: user.id,
    targetType: "User",
    metadata: { ...auditMeta(user), ...(extra ?? {}) },
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}

export async function logUserUpdated(
  actorUserId: string,
  user: { id: string; name: string; email: string },
  request: AuditRequest,
) {
  await createAuditLog({
    userId: actorUserId,
    action: "USER_UPDATED",
    target: user.id,
    targetType: "User",
    metadata: auditMeta(user),
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}

export async function logUserStatusChanged(
  action: "USER_DEACTIVATED" | "USER_ACTIVATED",
  actorUserId: string,
  user: { id: string; name: string; email: string },
  request: AuditRequest,
) {
  await createAuditLog({
    userId: actorUserId,
    action,
    target: user.id,
    targetType: "User",
    metadata: auditMeta(user),
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}
