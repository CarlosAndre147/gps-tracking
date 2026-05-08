import type { Role } from "@/lib/auth/role";

export const systemAdminOnly = { auth: true as const, roles: ["SYSTEM_ADMIN"] as Role[] };
