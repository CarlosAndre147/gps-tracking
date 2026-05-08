import { t } from "elysia";
import type { Role } from "@/lib/auth/role";

export const listAuditLogsQuery = t.Object({
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
  action: t.Optional(t.String()),
  userId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const systemAdminOnly = { auth: true as const, roles: ["SYSTEM_ADMIN"] as Role[] };
