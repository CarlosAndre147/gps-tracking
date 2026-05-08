import type { Role } from "@/lib/auth/role";
import type { AuthUserPayload } from "@/lib/core/response";
import { ForbiddenError, UnauthorizedError } from "@/lib/core/errors";

type GuardContext = {
  authUser?: AuthUserPayload;
};

export const guards = {
  isAuthenticated: async (ctx: GuardContext): Promise<void> => {
    if (!ctx.authUser) {
      throw new UnauthorizedError();
    }
  },

  isSystemAdmin: async (ctx: GuardContext): Promise<void> => {
    await guards.isAuthenticated(ctx);
    if (ctx.authUser!.role !== "SYSTEM_ADMIN") {
      throw new ForbiddenError();
    }
  },

  isCompanyAdmin: async (ctx: GuardContext): Promise<void> => {
    await guards.isAuthenticated(ctx);
    if (ctx.authUser!.role !== "COMPANY_ADMIN") {
      throw new ForbiddenError();
    }
  },

  isAdminOrAbove: async (ctx: GuardContext): Promise<void> => {
    await guards.isAuthenticated(ctx);
    const role = ctx.authUser!.role;
    if (role !== "SYSTEM_ADMIN" && role !== "COMPANY_ADMIN") {
      throw new ForbiddenError();
    }
  },
};

export function hasAnyRole(user: AuthUserPayload, roles: Role[]): boolean {
  return roles.includes(user.role);
}
