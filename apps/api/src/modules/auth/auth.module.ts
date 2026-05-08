import { Elysia } from "elysia";
import bcrypt from "bcryptjs";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db, isPgUniqueViolation, logger, ok, fail, UnauthorizedError } from "@/lib/core";
import { companies, refreshTokens, userCompanies, users } from "../../../drizzle/schema";
import { createAuditLog } from "@/lib/domain/audit";
import { getClientIp } from "@/lib/domain/client-ip";
import { isValidCpf, normalizeCpf } from "@/lib/utils/br-documents";
import {
  clearLoginFailures,
  digestRefreshToken,
  isLoginBlocked,
  recordLoginFailure,
  revokeAllUserRefreshTokens,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import { BCRYPT_ROUNDS, EMAIL_RE, loginBody, logoutBody, refreshBody, registerBody } from "./model";
import { createAuthAuditLogSafe, sanitizeAuthUser } from "./service";

export const authModule = new Elysia({ name: "auth-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .group("/auth", (r) =>
    r
      .post(
        "/register",
        async ({ body, set, accessJwt }) => {
          if (body.role !== "COMPANY_ADMIN" && body.role !== "USER") {
            set.status = 400;
            return fail("VALIDATION_ERROR", "Invalid role for registration");
          }

          const cpf = normalizeCpf(body.cpf);
          if (!isValidCpf(cpf)) {
            set.status = 400;
            return fail("VALIDATION_ERROR", "Invalid CPF");
          }

          const email = body.email.trim().toLowerCase();
          if (!EMAIL_RE.test(email)) {
            set.status = 400;
            return fail("VALIDATION_ERROR", "Invalid email format");
          }

          const [existing] = await db
            .select({ email: users.email, cpf: users.cpf })
            .from(users)
            .where(or(eq(users.email, email), eq(users.cpf, cpf)))
            .limit(1);
          if (existing) {
            set.status = 409;
            if (existing.email === email) {
              return fail("CONFLICT", "Email already registered");
            }
            return fail("CONFLICT", "CPF already registered");
          }

          const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

          try {
            const [user] = await db
              .insert(users)
              .values({
                name: body.name.trim(),
                email,
                cpf,
                phone: body.phone.trim(),
                passwordHash,
                role: body.role,
              })
              .returning();

            if (!user) {
              throw new Error("User insert failed");
            }

            const refreshToken = await signRefreshToken(user.id);
            const accessToken = await accessJwt.sign({ sub: user.id, role: user.role });
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await db.insert(refreshTokens).values({
              userId: user.id,
              tokenDigest: digestRefreshToken(refreshToken),
              expiresAt,
            });

            await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

            set.status = 201;
            return ok({
              accessToken,
              refreshToken,
              user: sanitizeAuthUser(user),
            });
          } catch (err: unknown) {
            if (isPgUniqueViolation(err)) {
              set.status = 409;
              return fail("CONFLICT", "Email or CPF already registered");
            }
            throw err;
          }
        },
        { body: registerBody },
      )
      .post(
        "/login",
        async ({ body, request, set, accessJwt }) => {
          const ip = getClientIp(request);
          const email = body.email.trim().toLowerCase();
          const userAgent = request.headers.get("user-agent") ?? undefined;
          if (await isLoginBlocked(ip)) {
            set.status = 429;
            set.headers["Retry-After"] = String(15 * 60);
            logger.warn({ ip, email, userAgent }, "login blocked due to brute-force protection");
            await createAuthAuditLogSafe({
              action: "LOGIN_BLOCKED",
              target: email,
              targetType: "Auth",
              metadata: { reason: "ip_rate_limited", email },
              ip,
              userAgent,
            });
            return fail("RATE_LIMITED", "Too many failed login attempts from this IP");
          }

          const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

          if (!user || !user.isActive) {
            await recordLoginFailure(ip);
            logger.warn({ ip, email, userAgent }, "login failed: user not found or inactive");
            await createAuthAuditLogSafe({
              action: "LOGIN_FAILED",
              target: email,
              targetType: "Auth",
              metadata: { reason: user ? "user_inactive" : "user_not_found", email },
              ip,
              userAgent,
            });
            set.status = 401;
            return fail("UNAUTHORIZED", "Invalid email or password");
          }

          const match = await bcrypt.compare(body.password, user.passwordHash);
          if (!match) {
            await recordLoginFailure(ip);
            logger.warn({ ip, email, userId: user.id, userAgent }, "login failed: invalid password");
            await createAuthAuditLogSafe({
              userId: user.id,
              action: "LOGIN_FAILED",
              target: user.id,
              targetType: "User",
              metadata: { reason: "invalid_password", email },
              ip,
              userAgent,
            });
            set.status = 401;
            return fail("UNAUTHORIZED", "Invalid email or password");
          }

          await clearLoginFailures(ip);

          const refreshToken = await signRefreshToken(user.id);
          const accessToken = await accessJwt.sign({ sub: user.id, role: user.role });
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await db.insert(refreshTokens).values({
            userId: user.id,
            tokenDigest: digestRefreshToken(refreshToken),
            expiresAt,
            ip,
            userAgent,
          });

          await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

          await createAuditLog({
            userId: user.id,
            action: "LOGIN",
            target: user.id,
            targetType: "User",
            metadata: {
              targetLabel: user.name,
              targetSubtitle: user.email,
              loginMethod: "password",
            },
            ip,
            userAgent,
          });

          return ok({
            accessToken,
            refreshToken,
            user: sanitizeAuthUser(user),
          });
        },
        { body: loginBody },
      )
      .post(
        "/refresh",
        async ({ body, request, set, accessJwt }) => {
          const ip = getClientIp(request);
          const userAgent = request.headers.get("user-agent") ?? undefined;

          let jwtPayload: { sub: string; jti: string };
          try {
            jwtPayload = await verifyRefreshToken(body.refreshToken);
          } catch {
            set.status = 401;
            return fail("UNAUTHORIZED", "Invalid refresh token");
          }

          const incomingDigest = digestRefreshToken(body.refreshToken);

          try {
            const rotation = await db.transaction(
              async (tx) => {
                const [row] = await tx
                  .select()
                  .from(refreshTokens)
                  .where(eq(refreshTokens.tokenDigest, incomingDigest))
                  .limit(1);

                if (!row) {
                  throw new UnauthorizedError("Refresh token not found");
                }
                if (row.userId !== jwtPayload.sub) {
                  throw new UnauthorizedError("Refresh token mismatch");
                }
                if (row.revokedAt) {
                  throw new UnauthorizedError("Refresh token revoked");
                }
                if (row.expiresAt.getTime() <= Date.now()) {
                  throw new UnauthorizedError("Refresh token expired");
                }
                if (row.usedAt) {
                  await revokeAllUserRefreshTokens(tx, row.userId);
                  throw new UnauthorizedError("Refresh token replay detected");
                }

                const consumed = await tx
                  .update(refreshTokens)
                  .set({ usedAt: new Date() })
                  .where(
                    and(
                      eq(refreshTokens.id, row.id),
                      isNull(refreshTokens.usedAt),
                      isNull(refreshTokens.revokedAt),
                      gt(refreshTokens.expiresAt, new Date()),
                    ),
                  )
                  .returning({ id: refreshTokens.id });

                if (consumed.length !== 1) {
                  await revokeAllUserRefreshTokens(tx, row.userId);
                  throw new UnauthorizedError("Refresh token already used");
                }

                const [u] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
                if (!u || !u.isActive) {
                  throw new UnauthorizedError("User not available");
                }

                const newRefresh = await signRefreshToken(u.id);
                const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                await tx.insert(refreshTokens).values({
                  userId: u.id,
                  tokenDigest: digestRefreshToken(newRefresh),
                  expiresAt: exp,
                  ip,
                  userAgent,
                });

                await tx.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));

                return { newRefresh, userId: u.id, role: u.role };
              },
              { isolationLevel: "serializable" },
            );

            const accessToken = await accessJwt.sign({
              sub: rotation.userId,
              role: rotation.role,
            });

            return ok({
              accessToken,
              refreshToken: rotation.newRefresh,
            });
          } catch (err: unknown) {
            if (err instanceof UnauthorizedError) {
              set.status = 401;
              return fail("UNAUTHORIZED", err.message);
            }
            throw err;
          }
        },
        { body: refreshBody },
      )
      .post(
        "/logout",
        async ({ body, request, authUser, set }) => {
          const digest = digestRefreshToken(body.refreshToken);
          const [row] = await db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenDigest, digest))
            .limit(1);
          if (!row || row.userId !== authUser.id) {
            set.status = 400;
            return fail("VALIDATION_ERROR", "Refresh token does not match the current user");
          }

          await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));

          const ip = getClientIp(request);
          const userAgent = request.headers.get("user-agent") ?? undefined;
          await createAuditLog({
            userId: authUser.id,
            action: "LOGOUT",
            target: authUser.id,
            targetType: "User",
            metadata: {
              reason: "explicit_logout",
            },
            ip,
            userAgent,
          });

          return ok({ acknowledged: true });
        },
        { body: logoutBody, auth: true },
      )
      .get(
        "/me",
        async ({ authUser, set }) => {
          const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
          if (!user) {
            set.status = 404;
            return fail("NOT_FOUND", "User not found");
          }

          const ucs = await db
            .select({ company: companies })
            .from(userCompanies)
            .innerJoin(companies, eq(userCompanies.companyId, companies.id))
            .where(and(eq(userCompanies.userId, authUser.id), eq(companies.isActive, true)))
            .orderBy(asc(companies.name));

          const companyPayload = ucs.map((r) => ({
            id: r.company.id,
            name: r.company.name,
            cnpj: r.company.cnpj,
            email: r.company.email,
            phone: r.company.phone,
            isActive: r.company.isActive,
          }));

          return ok({
            user: sanitizeAuthUser(user),
            companies: companyPayload,
          });
        },
        { auth: true },
      ),
  );
