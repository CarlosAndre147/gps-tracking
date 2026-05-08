import { createAuditLog } from "@/lib/domain/audit";
import { logger } from "@/lib/core";

export function sanitizeAuthUser(user: {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function createAuthAuditLogSafe(params: Parameters<typeof createAuditLog>[0]): Promise<void> {
  try {
    await createAuditLog(params);
  } catch (err) {
    logger.warn({ err, action: params.action, target: params.target }, "failed to persist auth audit log");
  }
}
