import { Elysia, status } from "elysia";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, fail, ForbiddenError, ok, type AuthUserPayload } from "@/lib/core";
import { companies, trackingSessions, users } from "../../../drizzle/schema";
import { ingestLocationUpdate, snapshotLocationsForCompanies } from "@/lib/tracking";
import { assertTrackingStartOptionalCompany, paginationMeta, parsePagination } from "@/lib/domain";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import { locationBody, startTrackingBody, trackingAuth, trackingHistoryQuery } from "./model";
import { startTrackingSession, stopTrackingSession } from "./service";

function assertCanUseTracking(authUser: AuthUserPayload): void {
  if (authUser.role === "USER" || authUser.role === "COMPANY_ADMIN") {
    return;
  }
  throw new ForbiddenError("Tracking is only available for USER or COMPANY_ADMIN");
}

export const trackingModule = new Elysia({ name: "tracking-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .group("/tracking", (g) =>
    g
          .post(
            "/start",
            async ({ authUser, set }) => {
              const session = await startTrackingSession(authUser.id, "http");
              set.status = 201;
              return ok({ sessionId: session.id });
            },
            {
              body: startTrackingBody,
              ...trackingAuth,
              beforeHandle: async ({ authUser, body }) => {
                if (!authUser) {
                  return status(401, "Unauthorized");
                }
                assertCanUseTracking(authUser);
                await assertTrackingStartOptionalCompany(authUser, body.companyId);
              },
            },
          )
          .post(
            "/stop",
            async ({ authUser, set }) => {
              const updated = await stopTrackingSession(authUser.id);
              if (!updated) {
                set.status = 404;
                return fail("NOT_FOUND", "No active tracking session");
              }
              return ok({ sessionId: updated.id, stoppedAt: updated.stoppedAt?.toISOString() ?? null });
            },
            trackingAuth,
          )
          .get(
            "/session-status",
            async ({ authUser }) => {
              const [open] = await db
                .select()
                .from(trackingSessions)
                .where(and(eq(trackingSessions.userId, authUser.id), isNull(trackingSessions.stoppedAt)))
                .orderBy(desc(trackingSessions.startedAt))
                .limit(1);
              return ok({
                active: open != null,
                sessionId: open?.id ?? null,
              });
            },
            trackingAuth,
          )
          .post(
            "/location",
            async ({ authUser, body }) => {
              const result = await ingestLocationUpdate({
                userId: authUser.id,
                lat: body.lat,
                lng: body.lng,
                accuracy: body.accuracy,
                speed: body.speed,
                heading: body.heading,
                altitude: body.altitude,
              });
              if (result.ignored) {
                return ok({ ignored: true });
              }
              if (result.persisted) {
                return ok({
                  ignored: false,
                  persisted: true,
                  locationId: result.locationId,
                  companiesNotified: result.companiesNotified,
                });
              }
              return ok({
                ignored: false,
                persisted: false,
                companiesNotified: result.companiesNotified,
              });
            },
            { body: locationBody, ...trackingAuth },
          )
          .get(
            "/history",
            async ({ authUser, query }) => {
              const { skip, take, page, limit } = parsePagination({
                page: Number(query.page),
                limit: Number(query.limit),
              });
              const whereClause = eq(trackingSessions.userId, authUser.id);
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
              const data = rows.map((s) => {
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
              return ok(data, paginationMeta(page, limit, total));
            },
            { query: trackingHistoryQuery, ...trackingAuth },
          )
          .get(
            "/active-users",
            async ({ authUser }) => {
              const companyIds =
                authUser.role === "SYSTEM_ADMIN"
                  ? (
                      await db
                        .select({ id: companies.id })
                        .from(companies)
                        .where(eq(companies.isActive, true))
                    ).map((r) => r.id)
                  : authUser.companyIds;

              if (companyIds.length === 0) {
                return ok([]);
              }

              const snapshot = await snapshotLocationsForCompanies(companyIds);
              const userIds = Object.keys(snapshot);
              if (userIds.length === 0) {
                return ok([]);
              }

              const userRows = await db
                .select({ id: users.id, name: users.name, email: users.email })
                .from(users)
                .where(inArray(users.id, userIds));

              const data = userRows.map((u) => {
                const loc = snapshot[u.id];
                return {
                  userId: u.id,
                  name: u.name,
                  email: u.email,
                  lat: loc?.lat ?? null,
                  lng: loc?.lng ?? null,
                  accuracy: loc?.accuracy ?? null,
                  timestamp: loc?.timestamp ?? null,
                  isActive: loc?.isActive ?? false,
                };
              });
              return ok(data);
            },
            {
              auth: true as const,
              beforeHandle({ authUser }: { authUser?: AuthUserPayload }) {
                if (!authUser) {
                  return status(401, "Unauthorized");
                }
                if (authUser.role !== "COMPANY_ADMIN" && authUser.role !== "SYSTEM_ADMIN") {
                  throw new ForbiddenError("Only admins can view active users");
                }
              },
            },
          )
  );
