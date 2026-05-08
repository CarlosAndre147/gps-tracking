import { and, eq, inArray, notExists } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, userCompanies, users } from "../../../drizzle/schema";
import { revokeAllUserRefreshTokens } from "@/lib/auth/revoke-user-sessions";

export async function deactivateCompanyAndRevokeAffectedUsers(companyId: string) {
  await db.transaction(async (tx) => {
    await tx.update(companies).set({ isActive: false }).where(eq(companies.id, companyId));

    const linkedUsers = await tx
      .select({ userId: userCompanies.userId })
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));

    const linkedUserIds = Array.from(new Set(linkedUsers.map((r) => r.userId)));
    if (linkedUserIds.length === 0) return;

    const usersWithoutActiveCompanies = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, linkedUserIds),
          eq(users.isActive, true),
          notExists(
            tx
              .select({ userId: userCompanies.userId })
              .from(userCompanies)
              .innerJoin(companies, eq(userCompanies.companyId, companies.id))
              .where(and(eq(userCompanies.userId, users.id), eq(companies.isActive, true))),
          ),
        ),
      );

    for (const user of usersWithoutActiveCompanies) {
      await revokeAllUserRefreshTokens(tx, user.id);
    }
  });
}
