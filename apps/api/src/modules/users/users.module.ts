import { Elysia, t } from "elysia";
import { and, count, desc, eq, exists, ilike, inArray, or, asc, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/core/db";
import { companies, trackingSessions, userCompanies, users } from "../../../drizzle/schema";
import { ok, fail } from "@/lib/core/response";
import { createAuditLog } from "@/lib/domain/audit";
import { getClientIp } from "@/lib/domain/client-ip";
import { parsePagination, paginationMeta } from "@/lib/domain/pagination";
import { assertCompanyExists } from "@/lib/domain/company-scope";
import { userIdsWithActiveTracking } from "@/lib/tracking/tracking-session-batch";
import { snapshotLocationsForCompanies } from "@/lib/tracking/tracking-ingest";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import type { Role } from "@/lib/auth/role";
import { isPgUniqueViolation } from "@/lib/core/pg-errors";
import {
  changePasswordBody,
  createUserBody,
  listUsersQuery,
  myCompanyUserTrackingHistoryQuery,
  myCompanyUsersQuery,
  updateUserBody,
} from "./users.schemas";
import {
  normalizeAndValidateCnpj,
  normalizeAndValidateCpf,
  normalizeAndValidateEmail,
} from "./users.validators";
import { mapUserBasic, mapUserListItem } from "./users.mappers";
import { logUserCreated, logUserStatusChanged, logUserUpdated } from "./users.audit";
import {
  activateUser,
  changeUserPassword,
  createUserWithCompany,
  deactivateUserAndRevokeSessions,
  updateUserProfile,
  userExists,
} from "./users.service";

const systemAdmin = { auth: true as const, roles: ["SYSTEM_ADMIN"] as Role[] };
const companyAdmin = { auth: true as const, roles: ["COMPANY_ADMIN"] as Role[] };

export const usersModule = new Elysia({ name: "users-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .group("/my-companies", (g) =>
    g
          .get(
            "/users",
            async ({ authUser, query, set }) => {
              const companyIds = authUser.companyIds;
              if (companyIds.length === 0) {
                return ok([]);
              }
              if (query.companyId && !companyIds.includes(query.companyId)) {
                set.status = 403;
                return fail("FORBIDDEN", "Company not managed by this user");
              }
              const scopedCompanyIds = query.companyId ? [query.companyId] : companyIds;

              const userRows = await db
                .select({ user: users })
                .from(users)
                .where(
                  exists(
                    db
                      .select({ id: userCompanies.userId })
                      .from(userCompanies)
                      .where(
                        and(
                          eq(userCompanies.userId, users.id),
                          inArray(userCompanies.companyId, scopedCompanyIds),
                        ),
                      ),
                  ),
                )
                .orderBy(asc(users.name));

              const ids = userRows.map((r) => r.user.id);
              if (ids.length === 0) {
                return ok([]);
              }

              const ucRows = await db
                .select({
                  userId: userCompanies.userId,
                  company: companies,
                })
                .from(userCompanies)
                .innerJoin(companies, eq(userCompanies.companyId, companies.id))
                .where(and(inArray(userCompanies.userId, ids), inArray(userCompanies.companyId, companyIds)));

              const companiesByUser = new Map<string, { id: string; name: string; cnpj: string }[]>();
              for (const r of ucRows) {
                const list = companiesByUser.get(r.userId) ?? [];
                list.push({ id: r.company.id, name: r.company.name, cnpj: r.company.cnpj });
                companiesByUser.set(r.userId, list);
              }

              const activeSet = await userIdsWithActiveTracking(ids);
              const lastLocationsByUserId = await snapshotLocationsForCompanies(scopedCompanyIds);
              const payload = userRows.map(({ user: u }) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                isActive: u.isActive,
                lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
                trackingActive: activeSet.has(u.id),
                companies: companiesByUser.get(u.id) ?? [],
                lastLocation: lastLocationsByUserId[u.id] ?? null,
              }));

              return ok(payload);
            },
            { query: myCompanyUsersQuery, ...companyAdmin },
          )
          .get(
            "/users/:userId/tracking-history",
            async ({ authUser, params, query, set }) => {
              const managedCompanyIds = authUser.companyIds;
              if (managedCompanyIds.length === 0) {
                set.status = 403;
                return fail("FORBIDDEN", "No managed companies");
              }

              if (query.companyId && !managedCompanyIds.includes(query.companyId)) {
                set.status = 403;
                return fail("FORBIDDEN", "Company not managed by this user");
              }

              const scopedCompanyIds = query.companyId ? [query.companyId] : managedCompanyIds;

              const [membership] = await db
                .select({ userId: userCompanies.userId })
                .from(userCompanies)
                .where(
                  and(
                    eq(userCompanies.userId, params.userId),
                    inArray(userCompanies.companyId, scopedCompanyIds),
                  ),
                )
                .limit(1);

              if (!membership) {
                set.status = 403;
                return fail("FORBIDDEN", "User not in managed company scope");
              }

              const { skip, take, page, limit } = parsePagination({
                page: Number(query.page),
                limit: Number(query.limit),
              });

              const whereClause = eq(trackingSessions.userId, params.userId);

              const [countRow] = await db
                .select({ total: count() })
                .from(trackingSessions)
                .where(whereClause);
              const total = Number(countRow?.total ?? 0);

              const rows = await db
                .select()
                .from(trackingSessions)
                .where(whereClause)
                .orderBy(desc(trackingSessions.startedAt))
                .limit(take)
                .offset(skip);

              const payload = rows.map((s) => {
                const stoppedAt = s.stoppedAt;
                const durationMs =
                  stoppedAt == null ? null : Math.max(0, stoppedAt.getTime() - s.startedAt.getTime());
                return {
                  id: s.id,
                  startedAt: s.startedAt.toISOString(),
                  stoppedAt: stoppedAt ? stoppedAt.toISOString() : null,
                  durationMs,
                  source: s.source,
                };
              });

              return ok(payload, paginationMeta(page, limit, total));
            },
            {
              params: t.Object({ userId: t.String() }),
              query: myCompanyUserTrackingHistoryQuery,
              ...companyAdmin,
            },
          )
    )
    .group("/users", (g) =>
      g
          .onBeforeHandle(async ({ query }) => {
            if (query.companyId) {
              await assertCompanyExists(query.companyId);
            }
          })
          .get(
            "/",
            async ({ query }) => {
              const { skip, take, page, limit } = parsePagination({
                page: Number(query.page),
                limit: Number(query.limit),
              });
              const sortBy = query.sortBy === "lastSeenAt" ? "lastSeenAt" : "name";
              const sortDir = query.sortDir === "desc" ? "desc" : "asc";

              const filters = [];
              if (query.search?.trim()) {
                const s = query.search.trim();
                const digits = s.replace(/\D/g, "");
                const searchClauses = [ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`)];
                if (digits.length > 0) {
                  searchClauses.push(
                    sql<boolean>`regexp_replace(${users.phone}, '[^0-9]', '', 'g') like ${`%${digits}%`}`,
                  );
                }
                filters.push(
                  or(...searchClauses)!,
                );
              }
              if (query.role) {
                filters.push(eq(users.role, query.role));
              }
              if (query.companyId) {
                filters.push(
                  exists(
                    db
                      .select({ id: userCompanies.userId })
                      .from(userCompanies)
                      .where(
                        and(
                          eq(userCompanies.userId, users.id),
                          eq(userCompanies.companyId, query.companyId),
                        ),
                      ),
                  ),
                );
              }
              if (query.isActive === "true") {
                filters.push(eq(users.isActive, true));
              } else if (query.isActive === "false") {
                filters.push(eq(users.isActive, false));
              }
              const whereClause = filters.length > 0 ? and(...filters) : undefined;

              const [countRow] = await db.select({ total: count() }).from(users).where(whereClause);
              const total = Number(countRow?.total ?? 0);
              const orderByClause =
                sortBy === "lastSeenAt"
                  ? [
                      asc(sql`${users.lastSeenAt} is null`),
                      sortDir === "desc" ? desc(users.lastSeenAt) : asc(users.lastSeenAt),
                      asc(users.name),
                    ]
                  : [sortDir === "desc" ? desc(users.name) : asc(users.name)];

              const rows = await db
                .select()
                .from(users)
                .where(whereClause)
                .orderBy(...orderByClause)
                .limit(take)
                .offset(skip);

              const ids = rows.map((u) => u.id);
              const ucRows =
                ids.length === 0
                  ? []
                  : await db
                      .select({
                        userId: userCompanies.userId,
                        company: companies,
                      })
                      .from(userCompanies)
                      .innerJoin(companies, eq(userCompanies.companyId, companies.id))
                      .where(inArray(userCompanies.userId, ids));

              const companiesByUser = new Map<string, { id: string; name: string; cnpj: string }[]>();
              for (const r of ucRows) {
                const list = companiesByUser.get(r.userId) ?? [];
                list.push({ id: r.company.id, name: r.company.name, cnpj: r.company.cnpj });
                companiesByUser.set(r.userId, list);
              }

              return ok(rows.map((u) => mapUserListItem(u, companiesByUser.get(u.id) ?? [])), paginationMeta(page, limit, total));
            },
            { query: listUsersQuery, ...systemAdmin },
          )
          .get(
            "/:id",
            async ({ params, set }) => {
              const [user] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
              if (!user) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              const ucs = await db
                .select({ company: companies })
                .from(userCompanies)
                .innerJoin(companies, eq(userCompanies.companyId, companies.id))
                .where(eq(userCompanies.userId, user.id));

              const sessions = await db
                .select()
                .from(trackingSessions)
                .where(eq(trackingSessions.userId, user.id))
                .orderBy(desc(trackingSessions.startedAt))
                .limit(10);

              return ok({
                id: user.id,
                name: user.name,
                email: user.email,
                cpf: user.cpf,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt.toISOString(),
                updatedAt: user.updatedAt.toISOString(),
                companies: ucs.map((c) => ({
                  id: c.company.id,
                  name: c.company.name,
                  cnpj: c.company.cnpj,
                  email: c.company.email,
                  phone: c.company.phone,
                })),
                recentSessions: sessions.map((s) => ({
                  id: s.id,
                  startedAt: s.startedAt.toISOString(),
                  stoppedAt: s.stoppedAt ? s.stoppedAt.toISOString() : null,
                  source: s.source,
                })),
              });
            },
            { params: t.Object({ id: t.String() }), ...systemAdmin },
          )
          .post(
            "/",
            async ({ body, set, authUser, request }) => {
              const email = normalizeAndValidateEmail(String(body.email));
              if (!email) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid email format");
              }
              const cpf = normalizeAndValidateCpf(String(body.cpf));
              if (!cpf) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid CPF");
              }
              let companyPayload:
                | { mode: "link"; companyIds: string[] }
                | {
                    mode: "create";
                    company: { name: string; cnpj: string; email: string; phone: string };
                  }
                | undefined;

              if (body.company?.mode === "link") {
                companyPayload = {
                  mode: "link",
                  companyIds: Array.from(
                    new Set(body.company.companyIds.map((id) => String(id).trim()).filter(Boolean)),
                  ),
                };
              } else if (body.company?.mode === "create") {
                const companyEmail = normalizeAndValidateEmail(String(body.company.company.email));
                if (!companyEmail) {
                  set.status = 400;
                  return fail("VALIDATION_ERROR", "Invalid company email format");
                }
                const companyCnpj = normalizeAndValidateCnpj(String(body.company.company.cnpj));
                if (!companyCnpj) {
                  set.status = 400;
                  return fail("VALIDATION_ERROR", "Invalid CNPJ");
                }
                companyPayload = {
                  mode: "create",
                  company: {
                    name: String(body.company.company.name).trim(),
                    cnpj: companyCnpj,
                    email: companyEmail,
                    phone: String(body.company.company.phone).trim(),
                  },
                };
              }

              try {
                const user = await createUserWithCompany({
                  name: String(body.name),
                  email,
                  cpf,
                  phone: String(body.phone),
                  password: String(body.password),
                  role: body.role as "COMPANY_ADMIN" | "USER",
                  company: companyPayload,
                });
                if (!user) {
                  throw new Error("User insert failed");
                }
                await logUserCreated(authUser.id, user, request, {
                  ...(body.company ? { via: "users_admin_flow", companyMode: body.company.mode } : {}),
                });
                set.status = 201;
                return ok(mapUserBasic(user));
              } catch (err: unknown) {
                if (err instanceof Error && err.message === "Company not found") {
                  return fail("NOT_FOUND", "Company not found");
                }
                if (err instanceof Error && err.message === "Company inactive") {
                  return fail("CONFLICT", "One or more companies are inactive");
                }
                if (isPgUniqueViolation(err)) {
                  set.status = 409;
                  return fail("CONFLICT", "Email, CPF ou CNPJ já cadastrado");
                }
                throw err;
              }
            },
            { body: createUserBody, ...systemAdmin },
          )
          .put(
            "/:id",
            async ({ params, body, set, authUser, request }) => {
              const existing = await userExists(params.id);
              if (!existing) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              const email = normalizeAndValidateEmail(String(body.email));
              if (!email) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid email format");
              }
              const cpf = normalizeAndValidateCpf(String(body.cpf));
              if (!cpf) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "Invalid CPF");
              }
              try {
                const user = await updateUserProfile(params.id, {
                  name: String(body.name),
                  email,
                  cpf,
                  phone: String(body.phone),
                });
                if (!user) {
                  set.status = 404;
                  return fail("NOT_FOUND", "User not found");
                }
                await logUserUpdated(authUser.id, user, request);
                return ok(mapUserBasic(user));
              } catch (err: unknown) {
                if (isPgUniqueViolation(err)) {
                  set.status = 409;
                  return fail("CONFLICT", "Email ou CPF já cadastrado");
                }
                throw err;
              }
            },
            {
              params: t.Object({ id: t.String() }),
              body: updateUserBody,
              ...systemAdmin,
            },
          )
          .patch(
            "/:id/password",
            async ({ params, body, set, authUser, request }) => {
              const [user] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
              if (!user) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              const adminResetOther =
                authUser.role === "SYSTEM_ADMIN" && authUser.id !== user.id;
              if (!adminResetOther) {
                const current = body.currentPassword?.trim() ?? "";
                if (!current) {
                  set.status = 400;
                  return fail("VALIDATION_ERROR", "Current password is required");
                }
                const match = await bcrypt.compare(current, user.passwordHash);
                if (!match) {
                  set.status = 400;
                  return fail("VALIDATION_ERROR", "Current password is incorrect");
                }
              }
              await changeUserPassword(user, body.newPassword);
              await createAuditLog({
                userId: authUser.id,
                action: "PASSWORD_CHANGED",
                target: user.id,
                targetType: "User",
                metadata: {
                  targetLabel: user.name,
                  targetSubtitle: user.email,
                  by: authUser.id === user.id ? "self" : "admin",
                },
                ip: getClientIp(request),
                userAgent: request.headers.get("user-agent") ?? undefined,
              });
              return ok({ updated: true });
            },
            {
              params: t.Object({ id: t.String() }),
              body: changePasswordBody,
              ...systemAdmin,
            },
          )
          .delete(
            "/:id",
            async ({ params, set, authUser, request }) => {
              if (authUser.id === params.id) {
                set.status = 400;
                return fail("VALIDATION_ERROR", "You cannot deactivate your own account");
              }
              const existing = await userExists(params.id);
              if (!existing) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              const user = await deactivateUserAndRevokeSessions(params.id);
              if (!user) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              await logUserStatusChanged("USER_DEACTIVATED", authUser.id, user, request);
              return ok({ id: user.id, isActive: false });
            },
            { params: t.Object({ id: t.String() }), ...systemAdmin },
          )
          .patch(
            "/:id/activate",
            async ({ params, set, authUser, request }) => {
              const existing = await userExists(params.id);
              if (!existing) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              const user = await activateUser(params.id);
              if (!user) {
                set.status = 404;
                return fail("NOT_FOUND", "User not found");
              }
              await logUserStatusChanged("USER_ACTIVATED", authUser.id, user, request);
              return ok({ id: user.id, isActive: true });
            },
            { params: t.Object({ id: t.String() }), ...systemAdmin },
          )
    );
