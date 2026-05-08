import { Elysia, t } from "elysia";
import { and, count, desc, eq, ilike, asc, or, sql } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, userCompanies, users } from "../../../drizzle/schema";
import { ok, fail } from "@/lib/core/response";
import { createAuditLog } from "@/lib/domain/audit";
import { getClientIp } from "@/lib/domain/client-ip";
import { parsePagination, paginationMeta } from "@/lib/domain/pagination";
import bcrypt from "bcryptjs";
import { userIdsWithActiveTracking } from "@/lib/tracking/tracking-session-batch";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import type { Role } from "@/lib/auth/role";
import { isPgUniqueViolation } from "@/lib/core/pg-errors";
import { attachUserBody, createCompanyBody, listQuery, membersListQuery, updateCompanyBody } from "./companies.schemas";
import {
  normalizeAndValidateCompanyCnpj,
  normalizeAndValidateCompanyEmail,
  normalizeAndValidateUserCpf,
} from "./companies.validators";
import { mapCompanyItem } from "./companies.mappers";
import { logCompanyEvent } from "./companies.audit";
import { deactivateCompanyAndRevokeAffectedUsers } from "./companies.service";

const BCRYPT_ROUNDS = 12;

const adminOnly = { auth: true as const, roles: ["SYSTEM_ADMIN"] as Role[] };

export const companiesModule = new Elysia({ name: "companies-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .get(
    "/companies",
            async ({ query }) => {
              const { skip, take, page, limit } = parsePagination({
                page: Number(query.page),
                limit: Number(query.limit),
              });

              const sortField = query.sort ?? "name";
              const dir = query.dir ?? "asc";
              const activeOnly = query.activeOnly === "true";

              const filters = [];
              if (activeOnly) {
                filters.push(eq(companies.isActive, true));
              }
              if (query.search?.trim()) {
                filters.push(ilike(companies.name, `%${query.search.trim()}%`));
              }
              const whereClause = filters.length > 0 ? and(...filters) : undefined;

              const orderBy =
                sortField === "createdAt"
                  ? dir === "asc"
                    ? asc(companies.createdAt)
                    : desc(companies.createdAt)
                  : dir === "asc"
                    ? asc(companies.name)
                    : desc(companies.name);

              const [countRow] = await db
                .select({ total: count() })
                .from(companies)
                .where(whereClause);
              const total = Number(countRow?.total ?? 0);

              const rows = await db
                .select({
                  id: companies.id,
                  name: companies.name,
                  cnpj: companies.cnpj,
                  email: companies.email,
                  phone: companies.phone,
                  isActive: companies.isActive,
                  createdAt: companies.createdAt,
                  updatedAt: companies.updatedAt,
                  userCount: count(userCompanies.userId),
                })
                .from(companies)
                .leftJoin(userCompanies, eq(companies.id, userCompanies.companyId))
                .where(whereClause)
                .groupBy(
                  companies.id,
                  companies.name,
                  companies.cnpj,
                  companies.email,
                  companies.phone,
                  companies.isActive,
                  companies.createdAt,
                  companies.updatedAt,
                )
                .orderBy(orderBy)
                .limit(take)
                .offset(skip);

              return ok(
                rows.map((c) => ({
                  id: c.id,
                  name: c.name,
                  cnpj: c.cnpj,
                  email: c.email,
                  phone: c.phone,
                  isActive: c.isActive,
                  createdAt: c.createdAt.toISOString(),
                  updatedAt: c.updatedAt.toISOString(),
                  userCount: Number(c.userCount),
                })),
                paginationMeta(page, limit, total),
              );
            },
            { query: listQuery, ...adminOnly },
          )
          .post(
            "/companies",
            async ({ body, set, authUser, request }) => {
              const cnpj = normalizeAndValidateCompanyCnpj(String(body.cnpj));
              if (!cnpj) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid CNPJ");
              }
              const email = normalizeAndValidateCompanyEmail(String(body.email));
              if (!email) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid email format");
              }

              try {
                const [company] = await db
                  .insert(companies)
                  .values({
                    name: String(body.name).trim(),
                    cnpj,
                    email,
                    phone: String(body.phone).trim(),
                  })
                  .returning();
                if (!company) {
                  throw new Error("Company insert failed");
                }
                await logCompanyEvent("COMPANY_CREATED", authUser.id, company, request);
                set.status = 201;
                return ok(mapCompanyItem(company));
              } catch (err: unknown) {
                if (isPgUniqueViolation(err)) {
                  set.status = 409;
                  return fail("CONFLICT", "CNPJ already registered");
                }
                throw err;
              }
            },
            { body: createCompanyBody, ...adminOnly },
          )
          .group("/companies/:id", (cg) =>
            cg
              .get(
                "",
                async ({ params, set }) => {
                  const [company] = await db.select().from(companies).where(eq(companies.id, params.id)).limit(1);
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }

                  const memberRows = await db
                    .select({
                      id: users.id,
                      name: users.name,
                      email: users.email,
                      cpf: users.cpf,
                      phone: users.phone,
                      role: users.role,
                      isActive: users.isActive,
                    })
                    .from(userCompanies)
                    .innerJoin(users, eq(userCompanies.userId, users.id))
                    .where(eq(userCompanies.companyId, params.id));

                  const memberIds = memberRows.map((u) => u.id);
                  const activeSet = await userIdsWithActiveTracking(memberIds);
                  const userList = memberRows.map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    cpf: u.cpf,
                    phone: u.phone,
                    role: u.role,
                    isActive: u.isActive,
                    trackingActive: activeSet.has(u.id),
                  }));

                  return ok({
                    id: company.id,
                    name: company.name,
                    cnpj: company.cnpj,
                    email: company.email,
                    phone: company.phone,
                    isActive: company.isActive,
                    createdAt: company.createdAt.toISOString(),
                    updatedAt: company.updatedAt.toISOString(),
                    users: userList,
                  });
                },
                { params: t.Object({ id: t.String() }), ...adminOnly },
              )
              .put(
                "",
                async ({ params, body, set, authUser, request }) => {
                  const [existing] = await db
                    .select({ id: companies.id })
                    .from(companies)
                    .where(eq(companies.id, params.id))
                    .limit(1);
                  if (!existing) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  const email = normalizeAndValidateCompanyEmail(String(body.email));
                  if (!email) {
                    set.status = 400;
                    return fail("VALIDATION_ERROR", "Invalid email format");
                  }
                  const [company] = await db
                    .update(companies)
                    .set({
                      name: String(body.name).trim(),
                      email,
                      phone: String(body.phone).trim(),
                    })
                    .where(eq(companies.id, params.id))
                    .returning();
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  await logCompanyEvent("COMPANY_UPDATED", authUser.id, company, request);
                  return ok(mapCompanyItem(company));
                },
                {
                  params: t.Object({ id: t.String() }),
                  body: updateCompanyBody,
                  ...adminOnly,
                },
              )
              .delete(
                "",
                async ({ params, set, authUser, request }) => {
                  const [company] = await db.select().from(companies).where(eq(companies.id, params.id)).limit(1);
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  const activeLinks = await db
                    .select({ userId: userCompanies.userId })
                    .from(userCompanies)
                    .innerJoin(users, eq(userCompanies.userId, users.id))
                    .where(and(eq(userCompanies.companyId, params.id), eq(users.isActive, true)))
                    .limit(1);
                  if (activeLinks.length > 0) {
                    set.status = 409;
                    return fail("CONFLICT", "Cannot deactivate company while active users are linked");
                  }
                  await deactivateCompanyAndRevokeAffectedUsers(params.id);
                  await logCompanyEvent("COMPANY_DEACTIVATED", authUser.id, company, request);
                  return ok({ id: company.id, isActive: false });
                },
                { params: t.Object({ id: t.String() }), ...adminOnly },
              )
              .patch(
                "/activate",
                async ({ params, set, authUser, request }) => {
                  const [company] = await db.select().from(companies).where(eq(companies.id, params.id)).limit(1);
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  const [updated] = await db
                    .update(companies)
                    .set({ isActive: true })
                    .where(eq(companies.id, params.id))
                    .returning();
                  if (!updated) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  await logCompanyEvent("COMPANY_ACTIVATED", authUser.id, updated, request);
                  return ok({ id: updated.id, isActive: true });
                },
                { params: t.Object({ id: t.String() }), ...adminOnly },
              )
              .get(
                "/users",
                async ({ params, query, set }) => {
                  const [company] = await db
                    .select({ id: companies.id })
                    .from(companies)
                    .where(eq(companies.id, params.id))
                    .limit(1);
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }

                  const { skip, take, page, limit } = parsePagination({
                    page: Number(query.page),
                    limit: Number(query.limit),
                  });

                  const searchTerm = query.search?.trim();
                  const digits = searchTerm ? searchTerm.replace(/\D/g, "") : "";
                  const whereClause = and(
                    eq(userCompanies.companyId, params.id),
                    searchTerm
                      ? or(
                          ilike(users.name, `%${searchTerm}%`),
                          ilike(users.email, `%${searchTerm}%`),
                          ilike(users.phone, `%${searchTerm}%`),
                          ...(digits
                            ? [
                                sql<boolean>`regexp_replace(${users.phone}, '[^0-9]', '', 'g') like ${`%${digits}%`}`,
                              ]
                            : []),
                        )
                      : undefined,
                  );

                  const [countRow] = await db
                    .select({ total: count() })
                    .from(userCompanies)
                    .innerJoin(users, eq(userCompanies.userId, users.id))
                    .where(whereClause);
                  const total = Number(countRow?.total ?? 0);

                  const rows = await db
                    .select({
                      id: users.id,
                      name: users.name,
                      email: users.email,
                      phone: users.phone,
                      role: users.role,
                      isActive: users.isActive,
                    })
                    .from(userCompanies)
                    .innerJoin(users, eq(userCompanies.userId, users.id))
                    .where(whereClause)
                    .orderBy(asc(users.name))
                    .limit(take)
                    .offset(skip);

                  const memberIds = rows.map((u) => u.id);
                  const activeSet = await userIdsWithActiveTracking(memberIds);

                  return ok(
                    rows.map((u) => ({
                      id: u.id,
                      name: u.name,
                      email: u.email,
                      phone: u.phone,
                      role: u.role,
                      isActive: u.isActive,
                      trackingActive: activeSet.has(u.id),
                    })),
                    paginationMeta(page, limit, total),
                  );
                },
                {
                  params: t.Object({ id: t.String() }),
                  query: membersListQuery,
                  ...adminOnly,
                },
              )
              .post(
                "/users",
                async ({ params, body, set, authUser, request }) => {
                  const [company] = await db
                    .select()
                    .from(companies)
                    .where(eq(companies.id, params.id))
                    .limit(1);
                  if (!company || !company.isActive) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }

                  if (body.mode === "link") {
                    const [user] = await db
                      .select()
                      .from(users)
                      .where(eq(users.id, body.userId))
                      .limit(1);
                    if (!user || !user.isActive) {
                      set.status = 404;
                      return fail("NOT_FOUND", "User not found");
                    }
                    try {
                      await db.insert(userCompanies).values({ userId: user.id, companyId: company.id });
                    } catch (err: unknown) {
                      if (isPgUniqueViolation(err)) {
                        set.status = 409;
                        return fail("CONFLICT", "User already linked to this company");
                      }
                      throw err;
                    }
                    await createAuditLog({
                      userId: authUser.id,
                      action: "COMPANY_USER_LINKED",
                      target: company.id,
                      targetType: "Company",
                      metadata: {
                        targetLabel: company.name,
                        targetSubtitle: company.cnpj,
                        userId: user.id,
                        userName: user.name,
                        userEmail: user.email,
                      },
                      ip: getClientIp(request),
                      userAgent: request.headers.get("user-agent") ?? undefined,
                    });
                    set.status = 201;
                    return ok({ userId: user.id, companyId: company.id });
                  }

                  const email = normalizeAndValidateCompanyEmail(String(body.user.email));
                  if (!email) {
                    set.status = 400;
                    return fail("VALIDATION_ERROR", "Invalid email format");
                  }
                  const cpf = normalizeAndValidateUserCpf(String(body.user.cpf));
                  if (!cpf) {
                    set.status = 400;
                    return fail("VALIDATION_ERROR", "Invalid CPF");
                  }

                  const passwordHash = await bcrypt.hash(String(body.user.password), BCRYPT_ROUNDS);

                  try {
                    const created = await db.transaction(async (tx) => {
                      const [u] = await tx
                        .insert(users)
                        .values({
                          name: String(body.user.name).trim(),
                          email,
                          cpf,
                          phone: String(body.user.phone).trim(),
                          passwordHash,
                          role: body.user.role,
                        })
                        .returning();
                      if (!u) {
                        throw new Error("User insert failed");
                      }
                      await tx.insert(userCompanies).values({ userId: u.id, companyId: company.id });
                      return u;
                    });

                    await createAuditLog({
                      userId: authUser.id,
                      action: "USER_CREATED",
                      target: created.id,
                      targetType: "User",
                      metadata: {
                        via: "company_invite",
                        companyId: company.id,
                        companyName: company.name,
                        targetLabel: created.name,
                        targetSubtitle: created.email,
                      },
                      ip: getClientIp(request),
                      userAgent: request.headers.get("user-agent") ?? undefined,
                    });

                    set.status = 201;
                    return ok({ userId: created.id, companyId: company.id });
                  } catch (err: unknown) {
                    if (isPgUniqueViolation(err)) {
                      set.status = 409;
                      return fail("CONFLICT", "Email or CPF already registered");
                    }
                    throw err;
                  }
                },
                {
                  params: t.Object({ id: t.String() }),
                  body: attachUserBody,
                  ...adminOnly,
                },
              )
              .delete(
                "/users/:userId",
                async ({ params, set, authUser, request }) => {
                  const [company] = await db
                    .select({ id: companies.id, name: companies.name, cnpj: companies.cnpj })
                    .from(companies)
                    .where(eq(companies.id, params.id))
                    .limit(1);
                  if (!company) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Company not found");
                  }
                  const [link] = await db
                    .select()
                    .from(userCompanies)
                    .where(
                      and(eq(userCompanies.userId, params.userId), eq(userCompanies.companyId, params.id)),
                    )
                    .limit(1);
                  if (!link) {
                    set.status = 404;
                    return fail("NOT_FOUND", "Membership not found");
                  }
                  await db
                    .delete(userCompanies)
                    .where(
                      and(eq(userCompanies.userId, params.userId), eq(userCompanies.companyId, params.id)),
                    );
                  await createAuditLog({
                    userId: authUser.id,
                    action: "COMPANY_USER_UNLINKED",
                    target: params.id,
                    targetType: "Company",
                    metadata: {
                      targetLabel: company.name,
                      targetSubtitle: company.cnpj,
                      userId: params.userId,
                    },
                    ip: getClientIp(request),
                    userAgent: request.headers.get("user-agent") ?? undefined,
                  });
                  return ok({ removed: true });
                },
                { params: t.Object({ id: t.String(), userId: t.String() }), ...adminOnly },
              ),
          );
