import { Elysia, t } from "elysia";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { companies, trackingSessions, userCompanies } from "../../../drizzle/schema";
import { UnauthorizedError } from "@/lib/core/errors";
import { ingestLocationUpdate, snapshotLocationsForCompanies } from "@/lib/tracking/tracking-ingest";
import { getLastLocation, publishCompanyTrackingEvent } from "@/lib/tracking/tracking-redis";
import { wsPresenceConnected, wsPresenceDisconnected } from "@/lib/tracking/ws-presence";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";

function isRole(value: unknown): value is "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER" {
  return value === "SYSTEM_ADMIN" || value === "COMPANY_ADMIN" || value === "USER";
}

async function companyIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  return rows.map((r) => r.companyId);
}

async function closeOpenSessions(userId: string): Promise<void> {
  await db
    .update(trackingSessions)
    .set({ stoppedAt: new Date() })
    .where(and(eq(trackingSessions.userId, userId), isNull(trackingSessions.stoppedAt)));
}

export type WsBootstrap = {
  wsUserId: string;
  wsRole: "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER";
  /** Companies the user belongs to (membership) — used for presence + publishing. */
  membershipCompanyIds: string[];
  /** Companies to subscribe on the WS topic `company:{id}` (admins only). */
  adminTopicCompanyIds: string[];
};

function parseWsMessage(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw;
}

function isLocationMessage(
  msg: unknown,
): msg is {
  type: "LOCATION_UPDATE";
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
} {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "LOCATION_UPDATE" &&
    typeof m.lat === "number" &&
    typeof m.lng === "number" &&
    (m.accuracy === undefined || typeof m.accuracy === "number") &&
    (m.speed === undefined || typeof m.speed === "number") &&
    (m.heading === undefined || typeof m.heading === "number") &&
    (m.altitude === undefined || typeof m.altitude === "number")
  );
}

function isToggleMessage(msg: unknown): msg is { type: "TRACKING_TOGGLE"; action: "START" | "STOP" } {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.type === "TRACKING_TOGGLE" && (m.action === "START" || m.action === "STOP");
}

/**
 * Plugin standalone com `accessJwt` próprio — `@elysiajs/jwt` desduplica via `name`,
 * então conviver com o app principal não duplica decoradores.
 *
 * Mantemos como plugin instanciado (não função genérica) para evitar instanciação
 * recursiva do TS quando combinamos `derive({ as: "scoped" })` + genérico de Elysia.
 */
export const trackingWsModule = new Elysia({ name: "tracking-ws" })
  .use(accessJwtPlugin())
  .derive({ as: "scoped" }, async ({ query, accessJwt }) => {
            const verified = await accessJwt.verify(query.token);
            if (verified === false) {
              throw new UnauthorizedError("Invalid access token");
            }
            const sub = typeof verified.sub === "string" ? verified.sub : undefined;
            const role = verified.role;
            if (!sub || !isRole(role)) {
              throw new UnauthorizedError("Invalid access token payload");
            }

            const memberships = await db
              .select({ companyId: userCompanies.companyId })
              .from(userCompanies)
              .where(eq(userCompanies.userId, sub));
            const membershipCompanyIds = memberships.map((m) => m.companyId);

            let adminTopicCompanyIds: string[] = [];
            if (role === "USER") {
              adminTopicCompanyIds = [];
            } else if (role === "COMPANY_ADMIN") {
              adminTopicCompanyIds = membershipCompanyIds;
            } else if (role === "SYSTEM_ADMIN") {
              const all = await db
                .select({ id: companies.id })
                .from(companies)
                .where(eq(companies.isActive, true));
              adminTopicCompanyIds = all.map((c) => c.id);
            }

            return {
              wsBootstrap: {
                wsUserId: sub,
                wsRole: role,
                membershipCompanyIds,
                adminTopicCompanyIds,
              },
            };
          })
          .ws("/ws/tracking", {
            query: t.Object({
              token: t.String({ minLength: 10 }),
            }),
            open: async (ws) => {
              const b = (ws.data as unknown as { wsBootstrap: WsBootstrap }).wsBootstrap;
              const { wsUserId, wsRole, membershipCompanyIds, adminTopicCompanyIds } = b;

              await wsPresenceConnected(wsUserId, membershipCompanyIds);

              if (wsRole === "USER") {
                ws.subscribe(`user:${wsUserId}`);
                const last = await getLastLocation(wsUserId);
                ws.send(JSON.stringify({ type: "SNAPSHOT", data: { self: last } }));
                return;
              }

              for (const id of adminTopicCompanyIds) {
                ws.subscribe(`company:${id}`);
              }

              const snapshot = await snapshotLocationsForCompanies(adminTopicCompanyIds);
              ws.send(JSON.stringify({ type: "SNAPSHOT", data: { locationsByUserId: snapshot } }));
            },
            message: async (ws, rawMessage) => {
              const message = parseWsMessage(rawMessage);
              const b = (ws.data as unknown as { wsBootstrap: WsBootstrap }).wsBootstrap;
              const userId = b.wsUserId;

              if (isLocationMessage(message)) {
                if (b.wsRole !== "USER" && b.wsRole !== "COMPANY_ADMIN") {
                  ws.send(JSON.stringify({ type: "ERROR", message: "LOCATION_UPDATE not allowed for this role" }));
                  return;
                }
                const result = await ingestLocationUpdate({
                  userId,
                  lat: message.lat,
                  lng: message.lng,
                  accuracy: message.accuracy,
                  speed: message.speed,
                  heading: message.heading,
                  altitude: message.altitude,
                });
                ws.send(JSON.stringify({ type: "LOCATION_ACK", data: result }));
                return;
              }

              if (isToggleMessage(message)) {
                if (b.wsRole !== "USER" && b.wsRole !== "COMPANY_ADMIN") {
                  ws.send(JSON.stringify({ type: "ERROR", message: "TRACKING_TOGGLE not allowed for this role" }));
                  return;
                }
                const companyIds = await companyIdsForUser(userId);
                if (message.action === "START") {
                  await closeOpenSessions(userId);
                  const [session] = await db
                    .insert(trackingSessions)
                    .values({ userId, source: "ws" })
                    .returning();
                  if (!session) {
                    ws.send(JSON.stringify({ type: "ERROR", message: "Failed to start session" }));
                    return;
                  }
                  const event = {
                    type: "TRACKING_STARTED",
                    userId,
                    sessionId: session.id,
                    timestamp: Date.now(),
                  };
                  await Promise.all(companyIds.map((id) => publishCompanyTrackingEvent(id, event)));
                  ws.send(JSON.stringify({ type: "TRACKING_ACK", data: { sessionId: session.id } }));
                  return;
                }

                const [open] = await db
                  .select()
                  .from(trackingSessions)
                  .where(and(eq(trackingSessions.userId, userId), isNull(trackingSessions.stoppedAt)))
                  .orderBy(desc(trackingSessions.startedAt))
                  .limit(1);
                if (!open) {
                  ws.send(JSON.stringify({ type: "ERROR", message: "No active tracking session" }));
                  return;
                }
                const [updated] = await db
                  .update(trackingSessions)
                  .set({ stoppedAt: new Date() })
                  .where(eq(trackingSessions.id, open.id))
                  .returning();
                if (!updated) {
                  ws.send(JSON.stringify({ type: "ERROR", message: "No active tracking session" }));
                  return;
                }
                const event = {
                  type: "TRACKING_STOPPED",
                  userId,
                  sessionId: updated.id,
                  timestamp: Date.now(),
                };
                await Promise.all(companyIds.map((id) => publishCompanyTrackingEvent(id, event)));
                ws.send(JSON.stringify({ type: "TRACKING_ACK", data: { sessionId: updated.id, stopped: true } }));
                return;
              }

              ws.send(JSON.stringify({ type: "ERROR", message: "Unknown message" }));
            },
    close: async (ws) => {
      const b = (ws.data as unknown as { wsBootstrap: WsBootstrap }).wsBootstrap;
      wsPresenceDisconnected(b.wsUserId, b.membershipCompanyIds);
    },
  });
