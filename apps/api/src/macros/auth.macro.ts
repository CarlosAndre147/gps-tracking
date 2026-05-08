import { Elysia, status } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, userCompanies, users } from "../../drizzle/schema";
import type { AuthUserPayload } from "@/lib/core/response";
import type { Role } from "@/lib/auth/role";

type AccessJwt = {
  verify: (token?: string) => Promise<false | Record<string, unknown>>;
};

function isRole(value: unknown): value is Role {
  return value === "SYSTEM_ADMIN" || value === "COMPANY_ADMIN" || value === "USER";
}

/**
 * RBAC declarativo: `auth: true` resolve Bearer + membership;
 * `roles: [...]` exige perfil (extende `auth`).
 */
export function authMacroPlugin() {
  return new Elysia({ name: "auth-macro" }).macro({
    auth: {
      async resolve(ctx) {
        const { request } = ctx;
        const accessJwt = (ctx as { accessJwt?: AccessJwt }).accessJwt;
        if (!accessJwt) {
          return status(500, "accessJwt plugin not mounted");
        }
        const header = request.headers.get("authorization");
        if (!header?.startsWith("Bearer ")) {
          return status(401, "Unauthorized");
        }
        const token = header.slice("Bearer ".length).trim();
        if (!token) {
          return status(401, "Unauthorized");
        }
        const verified = await accessJwt.verify(token);
        if (verified === false) {
          return status(401, "Unauthorized");
        }
        const sub = typeof verified.sub === "string" ? verified.sub : undefined;
        const role = verified.role;
        if (!sub || !isRole(role)) {
          return status(401, "Unauthorized");
        }
        const [user] = await db
          .select({ id: users.id, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, sub))
          .limit(1);
        if (!user || !user.isActive) {
          return status(401, "Unauthorized");
        }

        const rows = await db
          .select({ companyId: userCompanies.companyId })
          .from(userCompanies)
          .innerJoin(companies, eq(userCompanies.companyId, companies.id))
          .where(and(eq(userCompanies.userId, sub), eq(companies.isActive, true)));
        const authUser: AuthUserPayload = {
          id: sub,
          role,
          companyIds: rows.map((r) => r.companyId),
        };
        return { authUser };
      },
    },

    roles(allowed: Role[]) {
      return {
        auth: true as const,
        beforeHandle(ctx: { authUser?: AuthUserPayload } & Record<string, unknown>) {
          const { authUser } = ctx;
          if (!authUser || !allowed.includes(authUser.role)) {
            return status(403, "Forbidden");
          }
        },
      };
    },
  });
}
