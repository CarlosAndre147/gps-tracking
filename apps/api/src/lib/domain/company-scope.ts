import { and, eq } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, userCompanies } from "../../../drizzle/schema";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/core/errors";
import type { AuthUserPayload } from "@/lib/core/response";

/** Company Admin must manage the company; System Admin bypasses. */
export async function assertAuthUserManagesCompany(
  authUser: AuthUserPayload | undefined,
  companyId: string,
): Promise<void> {
  if (!authUser) {
    throw new UnauthorizedError();
  }
  if (authUser.role === "SYSTEM_ADMIN") {
    return;
  }
  if (authUser.role !== "COMPANY_ADMIN") {
    throw new ForbiddenError("Insufficient permissions for this company");
  }
  if (!authUser.companyIds.includes(companyId)) {
    throw new ForbiddenError("Company not managed by this user");
  }
}

/** Ensures the company row exists (e.g. filters on `companyId`). */
export async function assertCompanyExists(companyId: string): Promise<void> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Company not found");
  }
}

/**
 * Validates optional `companyId` on tracking start: admins must manage + belong;
 * users must belong; system admin only needs company to exist.
 */
export async function assertTrackingStartOptionalCompany(
  authUser: AuthUserPayload,
  companyId: string | undefined,
): Promise<void> {
  if (!companyId) return;
  if (authUser.role === "COMPANY_ADMIN") {
    await assertAuthUserManagesCompany(authUser, companyId);
    await assertUserBelongsToCompany(authUser.id, companyId);
    return;
  }
  if (authUser.role === "USER") {
    await assertUserBelongsToCompany(authUser.id, companyId);
    return;
  }
  if (authUser.role === "SYSTEM_ADMIN") {
    await assertCompanyExists(companyId);
  }
}

/**
 * Reusable Elysia `onBeforeHandle`: `params[paramName]` is treated as a company id
 * and must pass {@link assertAuthUserManagesCompany}.
 */
export function requireManagedCompanyFromParams(paramName = "id") {
  return async ({
    authUser,
    params,
  }: {
    authUser?: AuthUserPayload;
    params: Record<string, string | undefined>;
  }): Promise<void> => {
    const companyId = params[paramName];
    if (!companyId) {
      throw new ForbiddenError("Missing company id");
    }
    await assertAuthUserManagesCompany(authUser, companyId);
  };
}

/**
 * Ensures the target user is linked to the company (many-to-many).
 * Call before returning company-scoped user data to a Company Admin.
 */
export async function assertUserBelongsToCompany(userId: string, companyId: string): Promise<void> {
  const [link] = await db
    .select({ userId: userCompanies.userId })
    .from(userCompanies)
    .where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)))
    .limit(1);
  if (!link) {
    throw new ForbiddenError("User is not linked to this company");
  }
}
