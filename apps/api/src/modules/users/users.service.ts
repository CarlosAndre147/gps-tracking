import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, userCompanies, users } from "../../../drizzle/schema";
import { revokeAllUserRefreshTokens } from "@/lib/auth/revoke-user-sessions";

const BCRYPT_ROUNDS = 12;

type CreatePayload = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  password: string;
  role: "COMPANY_ADMIN" | "USER";
  company?:
    | { mode: "link"; companyIds: string[] }
    | { mode: "create"; company: { name: string; cnpj: string; email: string; phone: string } };
};

export async function createUserWithCompany(payload: CreatePayload) {
  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);

  return db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        name: payload.name.trim(),
        email: payload.email,
        cpf: payload.cpf,
        phone: payload.phone.trim(),
        passwordHash,
        role: payload.role,
      })
      .returning();
    if (!createdUser) throw new Error("User insert failed");

    if (payload.company?.mode === "link") {
      const companyRows = await tx
        .select({ id: companies.id, isActive: companies.isActive })
        .from(companies)
        .where(inArray(companies.id, payload.company.companyIds));
      if (companyRows.length !== payload.company.companyIds.length) throw new Error("Company not found");
      if (companyRows.some((c) => !c.isActive)) throw new Error("Company inactive");
      await tx.insert(userCompanies).values(companyRows.map((c) => ({ userId: createdUser.id, companyId: c.id })));
    } else if (payload.company?.mode === "create") {
      const [createdCompany] = await tx
        .insert(companies)
        .values(payload.company.company)
        .returning({ id: companies.id });
      if (!createdCompany) throw new Error("Company insert failed");
      await tx.insert(userCompanies).values({ userId: createdUser.id, companyId: createdCompany.id });
    }

    return createdUser;
  });
}

export async function updateUserProfile(id: string, payload: { name: string; email: string; cpf: string; phone: string }) {
  const [user] = await db
    .update(users)
    .set({ name: payload.name.trim(), email: payload.email, cpf: payload.cpf, phone: payload.phone.trim() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function deactivateUserAndRevokeSessions(id: string) {
  const [user] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(users).set({ isActive: false }).where(eq(users.id, id)).returning();
    if (updated) await revokeAllUserRefreshTokens(tx, updated.id);
    return [updated] as const;
  });
  return user;
}

export async function activateUser(id: string) {
  const [user] = await db.update(users).set({ isActive: true }).where(eq(users.id, id)).returning();
  return user;
}

export async function changeUserPassword(user: { id: string; passwordHash: string }, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await revokeAllUserRefreshTokens(tx, user.id);
  });
}

export async function userExists(id: string) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return existing;
}

export async function userBelongsToManagedCompany(userId: string, companyIds: string[]) {
  const [membership] = await db
    .select({ userId: userCompanies.userId })
    .from(userCompanies)
    .where(and(eq(userCompanies.userId, userId), inArray(userCompanies.companyId, companyIds)))
    .limit(1);
  return membership;
}
